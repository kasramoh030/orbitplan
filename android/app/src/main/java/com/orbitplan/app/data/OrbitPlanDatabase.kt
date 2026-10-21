package com.orbitplan.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [TaskEntity::class, ProjectEntity::class], version = 3, exportSchema = true)
abstract class OrbitPlanDatabase : RoomDatabase() {
    abstract fun tasks(): TaskDao
    abstract fun projects(): ProjectDao

    companion object {
        @Volatile private var instance: OrbitPlanDatabase? = null
        fun from(context: Context): OrbitPlanDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, OrbitPlanDatabase::class.java, "orbitplan.db")
                .fallbackToDestructiveMigration()
                .build()
                .also { instance = it }
        }
    }
}
