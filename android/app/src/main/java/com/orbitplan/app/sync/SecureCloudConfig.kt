package com.orbitplan.app.sync

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

object SecureCloudConfig {
    private fun preferences(context: Context) = EncryptedSharedPreferences.create(
        context,
        "orbitplan-secure-cloud",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    fun endpoint(context: Context): String = preferences(context).getString("endpoint", "") ?: ""
    fun token(context: Context): String = preferences(context).getString("token", "") ?: ""
    fun email(context: Context): String = preferences(context).getString("email", "") ?: ""
    fun save(context: Context, endpoint: String, token: String, email: String? = null) {
        val editor = preferences(context).edit().putString("endpoint", endpoint.trimEnd('/')).putString("token", token)
        if (email != null) editor.putString("email", email.trim().lowercase())
        editor.apply()
    }
    fun clear(context: Context) = preferences(context).edit().clear().apply()
}
