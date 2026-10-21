package com.orbitplan.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.orbitplan.app.data.OrbitPlanDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class OrbitSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val endpoint = SecureCloudConfig.endpoint(applicationContext)
        val token = SecureCloudConfig.token(applicationContext)
        if (endpoint.isBlank() || token.isBlank()) return@withContext Result.success()
        val tasks = OrbitPlanDatabase.from(applicationContext).tasks().all()
        val array = JSONArray().apply { tasks.forEach { task -> put(JSONObject().apply {
            put("id", task.id); put("title", task.title); put("category", task.category); put("date", task.date)
            put("time", task.time); put("duration", task.durationMinutes); put("priority", task.priority); put("done", task.completed)
        }) } }
        val payload = JSONObject().apply { put("state", JSONObject().apply { put("tasks", array) }); put("baseUpdatedAt", JSONObject.NULL) }
        val connection = (URL("$endpoint/api/sync").openConnection() as HttpURLConnection).apply {
            requestMethod = "PUT"; doOutput = true; connectTimeout = 12_000; readTimeout = 12_000
            setRequestProperty("Authorization", "Bearer $token"); setRequestProperty("Content-Type", "application/json")
        }
        try {
            connection.outputStream.use { it.write(payload.toString().toByteArray()) }
            when (connection.responseCode) { in 200..299 -> Result.success(); 401 -> { SecureCloudConfig.clear(applicationContext); Result.failure() }; 409 -> Result.failure(); else -> Result.retry() }
        } catch (_: Exception) { Result.retry() } finally { connection.disconnect() }
    }

    companion object {
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<OrbitSyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(androidx.work.Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("orbitplan-cloud-sync", ExistingPeriodicWorkPolicy.UPDATE, request)
        }
    }
}
