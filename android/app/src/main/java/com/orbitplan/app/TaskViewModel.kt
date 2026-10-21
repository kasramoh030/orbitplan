package com.orbitplan.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.orbitplan.app.data.OrbitPlanDatabase
import com.orbitplan.app.data.ProjectEntity
import com.orbitplan.app.data.TaskEntity
import com.orbitplan.app.reminders.ReminderScheduler
import com.orbitplan.app.sync.AccountSecurity
import com.orbitplan.app.sync.CloudAuth
import com.orbitplan.app.sync.OrbitSyncWorker
import com.orbitplan.app.sync.SecureCloudConfig
import com.orbitplan.app.sync.TeamProjectApi
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.LocalDate

class TaskViewModel(application: Application) : AndroidViewModel(application) {
    private val database = OrbitPlanDatabase.from(application)
    private val dao = database.tasks()
    private val projectDao = database.projects()
    val todaysTasks = dao.observeForDate(LocalDate.now().toString())
    val projects = projectDao.observeAll()
    var cloudMessage by mutableStateOf("")
        private set
    var teamMessage by mutableStateOf("")
        private set

    fun login(endpoint: String, email: String, password: String) = viewModelScope.launch {
        cloudMessage = "در حال ورود…"
        CloudAuth.login(getApplication(), endpoint, email, password)
            .onSuccess { cloudMessage = "Cloud Sync فعال شد"; OrbitSyncWorker.schedule(getApplication()) }
            .onFailure { cloudMessage = it.message ?: "ورود ناموفق بود" }
    }

    fun addProject(name: String, deadline: String = "", capacity: Int = 120) = viewModelScope.launch {
        if (name.isBlank()) return@launch
        projectDao.insert(ProjectEntity(name = name.trim(), deadline = deadline, dailyCapacityMinutes = capacity))
        OrbitSyncWorker.schedule(getApplication())
    }

    fun add(title: String, duration: Int = 45) = viewModelScope.launch {
        if (title.isBlank()) return@launch
        val task = TaskEntity(title = title.trim(), date = LocalDate.now().toString(), durationMinutes = duration)
        val id = dao.insert(task)
        ReminderScheduler.schedule(getApplication(), task.copy(id = id))
        OrbitSyncWorker.schedule(getApplication())
    }

    fun complete(task: TaskEntity) = viewModelScope.launch {
        dao.setCompleted(task.id, !task.completed)
        ReminderScheduler.cancel(getApplication(), task)
        OrbitSyncWorker.schedule(getApplication())
    }

    fun publishProject(project: ProjectEntity) = viewModelScope.launch {
        teamMessage = "در حال انتشار پروژه…"
        TeamProjectApi.publish(getApplication(), project, dao.forProject(project.id)).onSuccess { response ->
            applyRemoteProject(response.project, project, "owner")
            teamMessage = "پروژه منتشر شد. کد دعوت: ${response.inviteCode}"
        }.onFailure { teamMessage = it.message ?: "انتشار پروژه ناموفق بود" }
    }

    fun pullProject(project: ProjectEntity) = viewModelScope.launch {
        if (project.remoteId.isBlank()) return@launch
        teamMessage = "در حال دریافت تغییرها…"
        TeamProjectApi.pull(getApplication(), project.remoteId).onSuccess { response ->
            applyRemoteProject(response.project, project)
            teamMessage = "آخرین نسخهٔ پروژه دریافت شد"
        }.onFailure { teamMessage = it.message ?: "دریافت تغییرها ناموفق بود" }
    }

    fun pushProject(project: ProjectEntity) = viewModelScope.launch {
        if (project.collaborationRole !in setOf("owner", "editor")) { teamMessage = "این نقش فقط اجازهٔ مشاهده دارد"; return@launch }
        teamMessage = "در حال ارسال تغییرها…"
        TeamProjectApi.push(getApplication(), project, dao.forProject(project.id)).onSuccess { response ->
            applyRemoteProject(response.project, project)
            teamMessage = "تغییرهای تیمی ارسال شد"
        }.onFailure { teamMessage = it.message ?: "ارسال ناموفق بود؛ در صورت تعارض ابتدا دریافت کن" }
    }

    fun joinProject(inviteCode: String) = viewModelScope.launch {
        if (inviteCode.isBlank()) return@launch
        teamMessage = "در حال پیوستن به پروژه…"
        TeamProjectApi.join(getApplication(), inviteCode).onSuccess { response ->
            applyRemoteProject(response.project, null)
            teamMessage = "به پروژهٔ تیمی پیوستی"
        }.onFailure { teamMessage = it.message ?: "پیوستن با کد ناموفق بود" }
    }

    fun createInvite(project: ProjectEntity, role: String) = viewModelScope.launch {
        if (project.collaborationRole != "owner" || project.remoteId.isBlank()) { teamMessage = "فقط مالک می‌تواند دعوت بسازد"; return@launch }
        TeamProjectApi.invite(getApplication(), project.remoteId, role).onSuccess { invite ->
            teamMessage = "کد ${if (invite.role == "viewer") "مشاهده" else "ویرایش"}: ${invite.code}"
        }.onFailure { teamMessage = it.message ?: "ساخت دعوت ناموفق بود" }
    }

    fun changePassword(current: String, replacement: String) = viewModelScope.launch {
        cloudMessage = "در حال تغییر گذرواژه…"
        AccountSecurity.changePassword(getApplication(), current, replacement).onSuccess { cloudMessage = "گذرواژه تغییر کرد و نشست‌های دیگر باطل شدند" }.onFailure { cloudMessage = it.message ?: "تغییر گذرواژه ناموفق بود" }
    }

    fun revokeOtherSessions() = viewModelScope.launch {
        cloudMessage = "در حال باطل‌کردن نشست‌ها…"
        AccountSecurity.revokeOtherSessions(getApplication()).onSuccess { cloudMessage = "نشست‌های دیگر باطل شدند" }.onFailure { cloudMessage = it.message ?: "ابطال نشست‌ها ناموفق بود" }
    }

    private fun roleFor(remote: JSONObject, fallback: String): String {
        val email = SecureCloudConfig.email(getApplication())
        val members = remote.optJSONObject("members")
        return members?.optJSONObject(email)?.optString("role")?.takeIf { it.isNotBlank() } ?: fallback
    }

    /** Maps server payload to Room while keeping the Android id private to this device. */
    private suspend fun applyRemoteProject(remote: JSONObject, local: ProjectEntity?, expectedRole: String = "viewer") {
        val payload = remote.getJSONObject("payload")
        val details = payload.getJSONObject("project")
        val role = roleFor(remote, local?.collaborationRole?.ifBlank { expectedRole } ?: expectedRole)
        val base = (local ?: ProjectEntity(name = details.optString("name", "پروژهٔ تیمی"))).copy(
            name = details.optString("name", local?.name ?: "پروژهٔ تیمی"),
            deadline = details.optString("deadline", local?.deadline ?: ""),
            dailyCapacityMinutes = details.optInt("dailyCapacityMinutes", local?.dailyCapacityMinutes ?: 120),
            color = details.optString("color", local?.color ?: "violet"),
            remoteId = remote.getString("id"),
            remoteRevision = remote.optInt("revision", 1),
            collaborationRole = role,
            remoteUpdatedAt = remote.optString("updatedAt", "")
        )
        val localProjectId = if (local == null) projectDao.insert(base) else { projectDao.update(base); base.id }
        val existing = dao.forProject(localProjectId)
        val byRemote = existing.filter { it.collabRemoteId != null }.associateBy { it.collabRemoteId!! }
        val receivedIds = mutableSetOf<String>()
        val remoteTasks = payload.optJSONArray("tasks") ?: org.json.JSONArray()
        for (index in 0 until remoteTasks.length()) {
            val item = remoteTasks.getJSONObject(index)
            val remoteTaskId = item.opt("id")?.toString() ?: continue
            receivedIds += remoteTaskId
            val prior = byRemote[remoteTaskId] ?: existing.firstOrNull { it.collabRemoteId == null && it.id.toString() == remoteTaskId }
            val task = TaskEntity(
                id = prior?.id ?: 0,
                title = item.optString("title", "کار بدون عنوان"),
                category = item.optString("category", "Study"),
                date = item.optString("date", LocalDate.now().toString()),
                time = item.optString("time", "17:00"),
                durationMinutes = item.optInt("duration", 45),
                priority = item.optString("priority", "Medium"),
                projectId = localProjectId,
                stage = item.optString("stage", if (item.optBoolean("done", false)) "done" else "backlog"),
                collabRemoteId = remoteTaskId,
                completed = item.optBoolean("done", false),
                reminderMinutes = item.optInt("reminderMinutes", 0),
                updatedAt = System.currentTimeMillis()
            )
            if (prior == null) dao.insert(task) else dao.update(task)
        }
        existing.filter { it.collabRemoteId != null && it.collabRemoteId !in receivedIds }.forEach { dao.deleteById(it.id) }
        OrbitSyncWorker.schedule(getApplication())
    }
}
