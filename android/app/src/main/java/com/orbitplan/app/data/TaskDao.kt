package com.orbitplan.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface TaskDao {
    @Query("SELECT * FROM tasks WHERE date = :date ORDER BY time ASC")
    fun observeForDate(date: String): Flow<List<TaskEntity>>

    @Query("SELECT * FROM tasks WHERE completed = 0 ORDER BY date ASC, time ASC")
    suspend fun pending(): List<TaskEntity>

    @Query("SELECT * FROM tasks ORDER BY date ASC, time ASC")
    suspend fun all(): List<TaskEntity>

    @Query("SELECT * FROM tasks WHERE projectId = :projectId ORDER BY date ASC, time ASC")
    suspend fun forProject(projectId: Long): List<TaskEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(task: TaskEntity): Long

    @Update
    suspend fun update(task: TaskEntity)

    @Query("DELETE FROM tasks WHERE id = :id")
    suspend fun deleteById(id: Long)

    @Query("UPDATE tasks SET completed = :completed, updatedAt = :updatedAt WHERE id = :id")
    suspend fun setCompleted(id: Long, completed: Boolean, updatedAt: Long = System.currentTimeMillis())
}
