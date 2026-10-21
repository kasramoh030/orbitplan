package com.orbitplan.app.reminders

import android.content.BroadcastReceiver
import android.content.Context
import com.orbitplan.app.data.OrbitPlanDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: android.content.Intent) {
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try { OrbitPlanDatabase.from(context).tasks().pending().forEach { ReminderScheduler.schedule(context, it) } }
            finally { pendingResult.finish() }
        }
    }
}
