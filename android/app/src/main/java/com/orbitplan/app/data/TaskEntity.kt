package com.orbitplan.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tasks")
data class TaskEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val category: String = "Study",
    val date: String,
    val time: String = "17:00",
    val durationMinutes: Int = 45,
    val priority: String = "Medium",
    val projectId: Long? = null,
    val stage: String = "backlog",
    /** Stable task identifier inside a shared Cloud project. */
    val collabRemoteId: String? = null,
    val completed: Boolean = false,
    val reminderMinutes: Int = 0,
    val updatedAt: Long = System.currentTimeMillis()
)
