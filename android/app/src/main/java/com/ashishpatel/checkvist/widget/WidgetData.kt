package com.ashishpatel.checkvist.widget

import org.json.JSONObject
import org.json.JSONArray

data class WidgetStep(
    val id: String,
    val name: String,
    val emoji: String,
)

data class WidgetRoutine(
    val taskId: Int,
    val name: String,
    val color: String,
    val pendingSteps: List<WidgetStep>,
    val totalSteps: Int,
    val completedSteps: Int,
)

data class WidgetData(
    val routines: List<WidgetRoutine>,
    val updatedAt: String,
) {
    companion object {
        fun fromJson(json: String): WidgetData? = try {
            val obj = JSONObject(json)
            val routinesArr: JSONArray = obj.getJSONArray("routines")
            val routines = (0 until routinesArr.length()).map { i ->
                val r = routinesArr.getJSONObject(i)
                val pendingArr: JSONArray = r.getJSONArray("pendingSteps")
                val pendingSteps = (0 until pendingArr.length()).map { j ->
                    val s = pendingArr.getJSONObject(j)
                    WidgetStep(
                        id = s.getString("id"),
                        name = s.getString("name"),
                        emoji = s.optString("emoji", ""),
                    )
                }
                WidgetRoutine(
                    taskId = r.getInt("taskId"),
                    name = r.getString("name"),
                    color = r.optString("color", "#3B82F6"),
                    pendingSteps = pendingSteps,
                    totalSteps = r.getInt("totalSteps"),
                    completedSteps = r.getInt("completedSteps"),
                )
            }
            WidgetData(
                routines = routines,
                updatedAt = obj.optString("updatedAt", ""),
            )
        } catch (e: Exception) {
            null
        }
    }
}
