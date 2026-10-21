package com.orbitplan.app.sync

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Password rotation and session invalidation for the native signed-in account. */
object AccountSecurity {
    private fun request(context: Context, path: String, payload: JSONObject): JSONObject {
        val endpoint = SecureCloudConfig.endpoint(context).trimEnd('/')
        val token = SecureCloudConfig.token(context)
        require(endpoint.isNotBlank() && token.isNotBlank()) { "ابتدا به Cloud وارد شو." }
        val connection = (URL("$endpoint$path").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"; doOutput = true; connectTimeout = 12_000; readTimeout = 12_000
            setRequestProperty("Authorization", "Bearer $token"); setRequestProperty("Content-Type", "application/json")
        }
        return try {
            connection.outputStream.use { it.write(payload.toString().toByteArray()) }
            val code = connection.responseCode
            val raw = (if (code in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code == 401) SecureCloudConfig.clear(context)
            if (code !in 200..299) error(runCatching { JSONObject(raw).optString("error", "Security request failed") }.getOrDefault("Security request failed"))
            JSONObject(raw)
        } finally { connection.disconnect() }
    }

    suspend fun changePassword(context: Context, currentPassword: String, newPassword: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            require(newPassword.length >= 10) { "گذرواژهٔ تازه باید حداقل ۱۰ نویسه باشد." }
            val response = request(context, "/api/auth/password", JSONObject().put("currentPassword", currentPassword).put("newPassword", newPassword))
            SecureCloudConfig.save(context, SecureCloudConfig.endpoint(context), response.getString("token"))
        }
    }

    suspend fun revokeOtherSessions(context: Context): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val response = request(context, "/api/auth/revoke-sessions", JSONObject())
            SecureCloudConfig.save(context, SecureCloudConfig.endpoint(context), response.getString("token"))
        }
    }
}
