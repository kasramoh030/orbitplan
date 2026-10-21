package com.orbitplan.app.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "projects")
data class ProjectEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val deadline: String = "",
    val dailyCapacityMinutes: Int = 120,
    val color: String = "violet",
    /** Server-owned project id. Empty means this is private/local only. */
    val remoteId: String = "",
    /** Optimistic-concurrency revision supplied by the Cloud API. */
    val remoteRevision: Int = 0,
    /** owner, editor or viewer for a connected project. */
    val collaborationRole: String = "",
    val remoteUpdatedAt: String = "",
    val createdAt: Long = System.currentTimeMillis()
)
