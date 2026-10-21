package com.orbitplan.app.reminders

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.orbitplan.app.data.TaskEntity
import java.time.LocalDateTime
import java.time.ZoneId

object ReminderScheduler {
    fun schedule(context: Context, task: TaskEntity) {
        if (task.reminderMinutes <= 0 || task.completed) return
        val runAt = runCatching {
            LocalDateTime.parse("${task.date}T${task.time}").minusMinutes(task.reminderMinutes.toLong())
                .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        }.getOrNull() ?: return
        if (runAt <= System.currentTimeMillis()) return
        val pending = pendingIntent(context, task)
        val alarms = context.getSystemService(AlarmManager::class.java)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, runAt, pending)
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, runAt, pending)
        }
    }

    fun cancel(context: Context, task: TaskEntity) {
        context.getSystemService(AlarmManager::class.java).cancel(pendingIntent(context, task))
    }

    private fun pendingIntent(context: Context, task: TaskEntity): PendingIntent {
        val intent = Intent(context, ReminderReceiver::class.java)
            .putExtra("taskId", task.id)
            .putExtra("title", task.title)
        return PendingIntent.getBroadcast(context, task.id.toInt(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }
}
