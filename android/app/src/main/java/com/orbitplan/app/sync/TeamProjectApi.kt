package com.orbitplan.app.sync

import android.content.Context
import com.orbitplan.app.data.ProjectEntity
import com.orbitplan.app.data.TaskEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Native client for the same revision-safe collaboration contract used by the PWA.
 * The UI decides when to push or pull; this class never silently overwrites a project.
 */
data class TeamProjectResponse(val project: JSONObject, val inviteCode: String = "")
data class TeamInviteResponse(val code: String, val role: String, val expiresAt: String)

object TeamProjectApi {
    private fun settings(context: Context): Pair<String, String> {
        val endpoint = SecureCloudConfig.endpoint(context)
        val token = SecureCloudConfig.token(context)
        require(endpoint.isNotBlank() && token.isNotBlank()) { "ابتدا به Cloud وارد شو." }
        return endpoint.trimEnd('/') to token
    }

    private fun errorMessage(raw: String, fallback: String): String = runCatching {
        JSONObject(raw).optString("error", fallback)
    }.getOrDefault(fallback)

    private fun request(context: Context, endpoint: String, token: String, path: String, method: String, payload: JSONObject? = null): JSONObject {
        val connection = (URL("$endpoint$path").openConnection() as HttpURLConnection).apply {
            requestMethod = method; connectTimeout = 12_000; readTimeout = 12_000
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "application/json")
            if (payload != null) doOutput = true
        }
        return try {
            payload?.let { connection.outputStream.use { output -> output.write(it.toString().toByteArray()) } }
            val code = connection.responseCode
            val stream = if (code in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code == 401) SecureCloudConfig.clear(context)
            if (code !in 200..299) error(errorMessage(raw, "Cloud request failed ($code)"))
            JSONObject(raw)
        } finally { connection.disconnect() }
    }

    private fun projectPayload(project: ProjectEntity, tasks: List<TaskEntity>): JSONObject = JSONObject().apply {
        put("project", JSONObject().apply {
            put("id", project.remoteId.ifBlank { project.id.toString() }); put("name", project.name)
            put("deadline", project.deadline); put("dailyCapacityMinutes", project.dailyCapacityMinutes); put("color", project.color)
        })
        put("tasks", JSONArray().apply { tasks.forEach { task -> put(JSONObject().apply {
            put("id", task.collabRemoteId ?: task.id.toString()); put("title", task.title); put("category", task.category)
            put("date", task.date); put("time", task.time); put("duration", task.durationMinutes); put("priority", task.priority)
            put("stage", task.stage); put("done", task.completed); put("reminderMinutes", task.reminderMinutes)
        }) } })
    }

    suspend fun publish(context: Context, project: ProjectEntity, tasks: List<TaskEntity>): Result<TeamProjectResponse> = withContext(Dispatchers.IO) {
        runCatching { val (endpoint, token) = settings(context); val result = request(context, endpoint, token, "/api/collab/projects", "POST", projectPayload(project, tasks)); TeamProjectResponse(result.getJSONObject("project"), result.optString("inviteCode")) }
    }

    suspend fun pull(context: Context, remoteId: String): Result<TeamProjectResponse> = withContext(Dispatchers.IO) {
        runCatching { val (endpoint, token) = settings(context); val result = request(context, endpoint, token, "/api/collab/projects/${java.net.URLEncoder.encode(remoteId, "UTF-8")}", "GET"); TeamProjectResponse(result.getJSONObject("project")) }
    }

    suspend fun push(context: Context, project: ProjectEntity, tasks: List<TaskEntity>): Result<TeamProjectResponse> = withContext(Dispatchers.IO) {
        runCatching {
            require(project.remoteId.isNotBlank()) { "این پروژه هنوز منتشر نشده است." }
            val (endpoint, token) = settings(context)
            val body = JSONObject().put("payload", projectPayload(project, tasks)).put("baseRevision", project.remoteRevision)
            val result = request(context, endpoint, token, "/api/collab/projects/${java.net.URLEncoder.encode(project.remoteId, "UTF-8")}", "PUT", body)
            TeamProjectResponse(result.getJSONObject("project"))
        }
    }

    suspend fun join(context: Context, inviteCode: String): Result<TeamProjectResponse> = withContext(Dispatchers.IO) {
        runCatching { val (endpoint, token) = settings(context); val result = request(context, endpoint, token, "/api/collab/projects/join", "POST", JSONObject().put("code", inviteCode.trim())); TeamProjectResponse(result.getJSONObject("project")) }
    }

    suspend fun invite(context: Context, remoteId: String, role: String): Result<TeamInviteResponse> = withContext(Dispatchers.IO) {
        runCatching {
            require(role == "editor" || role == "viewer") { "Role نامعتبر است." }
            val (endpoint, token) = settings(context)
            val result = request(context, endpoint, token, "/api/collab/projects/${java.net.URLEncoder.encode(remoteId, "UTF-8")}/invite", "POST", JSONObject().put("inviteRole", role))
            TeamInviteResponse(result.getString("code"), result.getString("role"), result.getString("expiresAt"))
        }
    }
}
