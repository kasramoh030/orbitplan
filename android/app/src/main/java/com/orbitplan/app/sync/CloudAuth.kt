package com.orbitplan.app.sync

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object CloudAuth {
    suspend fun login(context: Context, endpoint: String, email: String, password: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val connection = (URL("${endpoint.trimEnd('/')}/api/auth/login").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; doOutput = true; connectTimeout = 12_000; readTimeout = 12_000
                setRequestProperty("Content-Type", "application/json")
            }
            try {
                val body = JSONObject().put("email", email).put("password", password).toString().toByteArray()
                connection.outputStream.use { it.write(body) }
                val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
                val response = stream.bufferedReader().use { it.readText() }
                if (connection.responseCode !in 200..299) error(JSONObject(response).optString("error", "Login failed"))
                val account = JSONObject(response)
                val token = account.getString("token")
                SecureCloudConfig.save(context, endpoint, token, account.getJSONObject("user").getString("email"))
                token
            } finally { connection.disconnect() }
        }
    }
}
