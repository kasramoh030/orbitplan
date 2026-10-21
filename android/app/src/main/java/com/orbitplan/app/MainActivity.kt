package com.orbitplan.app

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.orbitplan.app.data.ProjectEntity
import com.orbitplan.app.data.TaskEntity
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    private val viewModel: TaskViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { OrbitPlanNative(viewModel) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OrbitPlanNative(viewModel: TaskViewModel) {
    val tasks by viewModel.todaysTasks.collectAsStateWithLifecycle(initialValue = emptyList())
    val projects by viewModel.projects.collectAsStateWithLifecycle(initialValue = emptyList())
    val requestNotifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) { if (Build.VERSION.SDK_INT >= 33) requestNotifications.launch(Manifest.permission.POST_NOTIFICATIONS) }
    var draft by rememberSaveable { mutableStateOf("") }
    var showCloud by rememberSaveable { mutableStateOf(false) }
    var showSecurity by rememberSaveable { mutableStateOf(false) }
    var showProjects by rememberSaveable { mutableStateOf(false) }
    var activeFocus by remember { mutableStateOf<TaskEntity?>(null) }
    var seconds by remember { mutableIntStateOf(25 * 60) }
    LaunchedEffect(activeFocus?.id) {
        while (activeFocus != null && seconds > 0) { delay(1_000); seconds-- }
        if (activeFocus != null && seconds == 0) { viewModel.complete(activeFocus!!); activeFocus = null; seconds = 25 * 60 }
    }
    MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF6758DC), secondary = Color(0xFF2FA7D1), surface = Color(0xFFF7F8FF))) {
        Scaffold(topBar = { TopAppBar(title = { Column { Text("OrbitPlan", fontWeight = FontWeight.Bold); Text("برنامه‌ریز مطالعه و کار", style = MaterialTheme.typography.labelSmall) } }, actions = { TextButton(onClick = { showProjects = true }) { Text("پروژه‌ها") }; TextButton(onClick = { showCloud = true }) { Text("Cloud") }; TextButton(onClick = { showSecurity = true }) { Text("امنیت") } }) }) { padding ->
            Column(Modifier.fillMaxSize().padding(padding).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (activeFocus != null) FocusCard(task = activeFocus!!, seconds = seconds, onStop = { activeFocus = null; seconds = 25 * 60 })
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(value = draft, onValueChange = { draft = it }, modifier = Modifier.weight(1f), label = { Text("کار جدید") }, singleLine = true)
                        Spacer(Modifier.width(8.dp))
                        Button(onClick = { viewModel.add(draft); draft = "" }, enabled = draft.isNotBlank()) { Text("افزودن") }
                    }
                }
                Text("امروز", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(tasks, key = { it.id }) { task -> TaskCard(task, onComplete = { viewModel.complete(task) }, onFocus = { activeFocus = task; seconds = 25 * 60 }) }
                }
            }
        }
        if (showCloud) CloudLoginDialog(onDismiss = { showCloud = false }, message = viewModel.cloudMessage, onLogin = viewModel::login)
        if (showSecurity) AccountSecurityDialog(onDismiss = { showSecurity = false }, message = viewModel.cloudMessage, onChangePassword = viewModel::changePassword, onRevokeSessions = viewModel::revokeOtherSessions)
        if (showProjects) ProjectDialog(projects = projects, message = viewModel.teamMessage, onDismiss = { showProjects = false }, onSave = viewModel::addProject, onPublish = viewModel::publishProject, onPull = viewModel::pullProject, onPush = viewModel::pushProject, onInvite = viewModel::createInvite, onJoin = viewModel::joinProject)
    }
}

@Composable
private fun ProjectDialog(
    projects: List<ProjectEntity>,
    message: String,
    onDismiss: () -> Unit,
    onSave: (String, String, Int) -> Unit,
    onPublish: (ProjectEntity) -> Unit,
    onPull: (ProjectEntity) -> Unit,
    onPush: (ProjectEntity) -> Unit,
    onInvite: (ProjectEntity, String) -> Unit,
    onJoin: (String) -> Unit
) {
    var name by rememberSaveable { mutableStateOf("") }
    var deadline by rememberSaveable { mutableStateOf("") }
    var inviteCode by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("پروژه‌ها و همکاری") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("انتشار، دریافت و ارسال پروژه‌های تیمی با همان Cloud امن OrbitPlan انجام می‌شود.", style = MaterialTheme.typography.bodySmall)
            if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            projects.forEach { project -> ProjectTeamCard(project, onPublish, onPull, onPush, onInvite) }
            HorizontalDivider()
            OutlinedTextField(value = inviteCode, onValueChange = { inviteCode = it }, label = { Text("کد دعوت پروژه") }, singleLine = true)
            TextButton(onClick = { onJoin(inviteCode); inviteCode = "" }, enabled = inviteCode.isNotBlank()) { Text("پیوستن با کد") }
            HorizontalDivider()
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("پروژهٔ جدید") }, singleLine = true)
            OutlinedTextField(value = deadline, onValueChange = { deadline = it }, label = { Text("تاریخ هدف YYYY-MM-DD") }, singleLine = true)
        } },
        confirmButton = { Button(onClick = { onSave(name, deadline, 120); name = ""; deadline = "" }, enabled = name.isNotBlank()) { Text("افزودن پروژه") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("بستن") } }
    )
}

@Composable
private fun ProjectTeamCard(
    project: ProjectEntity,
    onPublish: (ProjectEntity) -> Unit,
    onPull: (ProjectEntity) -> Unit,
    onPush: (ProjectEntity) -> Unit,
    onInvite: (ProjectEntity, String) -> Unit
) {
    ElevatedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(project.name, fontWeight = FontWeight.SemiBold)
        Text(if (project.deadline.isBlank()) "بدون تاریخ هدف" else "هدف: ${project.deadline}", style = MaterialTheme.typography.labelSmall)
        if (project.remoteId.isBlank()) {
            Button(onClick = { onPublish(project) }) { Text("انتشار برای تیم") }
        } else {
            Text("نقش: ${when (project.collaborationRole) { "owner" -> "مالک"; "editor" -> "ویرایشگر"; else -> "فقط مشاهده" }} · نسخه ${project.remoteRevision}", style = MaterialTheme.typography.labelSmall)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = { onPull(project) }) { Text("دریافت") }
                if (project.collaborationRole == "owner" || project.collaborationRole == "editor") Button(onClick = { onPush(project) }) { Text("ارسال") }
            }
            if (project.collaborationRole == "owner") Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TextButton(onClick = { onInvite(project, "editor") }) { Text("دعوت ویرایشگر") }
                TextButton(onClick = { onInvite(project, "viewer") }) { Text("دعوت مشاهده") }
            }
        }
    } }
}

@Composable
private fun CloudLoginDialog(onDismiss: () -> Unit, message: String, onLogin: (String, String, String) -> Unit) {
    var endpoint by rememberSaveable { mutableStateOf("https://your-orbitplan.example") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("اتصال Cloud") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("با همان حساب سرور OrbitPlan وارد شو. توکن روی دستگاه رمزنگاری می‌شود.", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(value = endpoint, onValueChange = { endpoint = it }, label = { Text("API URL") }, singleLine = true)
            OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("ایمیل") }, singleLine = true)
            OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("گذرواژه") }, singleLine = true)
            if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.labelMedium)
        } },
        confirmButton = { Button(onClick = { onLogin(endpoint, email, password) }, enabled = endpoint.isNotBlank() && email.isNotBlank() && password.isNotBlank()) { Text("ورود") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("بستن") } }
    )
}

@Composable
private fun AccountSecurityDialog(
    onDismiss: () -> Unit,
    message: String,
    onChangePassword: (String, String) -> Unit,
    onRevokeSessions: () -> Unit
) {
    var currentPassword by rememberSaveable { mutableStateOf("") }
    var newPassword by rememberSaveable { mutableStateOf("") }
    var confirmation by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("امنیت حساب") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("تغییر گذرواژه یا خروج از نشست‌های دیگر، tokenهای قبلی را بی‌اعتبار می‌کند.", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(value = currentPassword, onValueChange = { currentPassword = it }, label = { Text("گذرواژهٔ فعلی") }, singleLine = true)
            OutlinedTextField(value = newPassword, onValueChange = { newPassword = it }, label = { Text("گذرواژهٔ تازه (حداقل ۱۰ نویسه)") }, singleLine = true)
            OutlinedTextField(value = confirmation, onValueChange = { confirmation = it }, label = { Text("تأیید گذرواژه") }, singleLine = true)
            if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.labelMedium)
            TextButton(onClick = onRevokeSessions) { Text("خروج از نشست‌های دیگر") }
        } },
        confirmButton = { Button(onClick = { onChangePassword(currentPassword, newPassword) }, enabled = currentPassword.isNotBlank() && newPassword.length >= 10 && newPassword == confirmation) { Text("تغییر گذرواژه") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("بستن") } }
    )
}

@Composable
private fun TaskCard(task: TaskEntity, onComplete: () -> Unit, onFocus: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onComplete) { Icon(Icons.Outlined.CheckCircle, contentDescription = "تغییر وضعیت", tint = if (task.completed) Color(0xFF23A57B) else MaterialTheme.colorScheme.primary) }
            Column(Modifier.weight(1f)) { Text(task.title, fontWeight = FontWeight.SemiBold); Text("${task.time} · ${task.durationMinutes} دقیقه · ${task.category}", style = MaterialTheme.typography.labelMedium) }
            IconButton(onClick = onFocus, enabled = !task.completed) { Icon(Icons.Outlined.PlayArrow, contentDescription = "شروع تمرکز") }
        }
    }
}

@Composable
private fun FocusCard(task: TaskEntity, seconds: Int, onStop: () -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFEAE7FF)), shape = RoundedCornerShape(20.dp)) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { Text("تمرکز روی ${task.title}", fontWeight = FontWeight.Bold); Text("%02d:%02d".format(seconds / 60, seconds % 60), style = MaterialTheme.typography.headlineMedium) }
            OutlinedButton(onClick = onStop) { Text("توقف") }
        }
    }
}
