package com.ashishpatel.checkvist.widget

import org.json.JSONObject
import org.json.JSONArray

data class ChartPoint(val date: String, val value: Double)

data class ProgressTrackerItem(
    val name: String,
    val current: Double,
    val target: Double,
    val percentage: Double,
    val unit: String,
    val filledColor: String,
    val bgColor: String,
    val chartPoints: List<ChartPoint>,
)

data class ProgressWidgetData(
    val trackers: List<ProgressTrackerItem>,
    val updatedAt: String,
) {
    companion object {
        fun fromJson(json: String): ProgressWidgetData? = try {
            val obj = JSONObject(json)
            val arr: JSONArray = obj.getJSONArray("trackers")
            val trackers = (0 until arr.length()).map { i ->
                val t = arr.getJSONObject(i)
                val pts = t.optJSONArray("chartPoints")
                val chartPoints = if (pts != null) {
                    (0 until pts.length()).map { j ->
                        val p = pts.getJSONObject(j)
                        ChartPoint(p.optString("d", ""), p.getDouble("v"))
                    }
                } else emptyList()
                ProgressTrackerItem(
                    name        = t.getString("name"),
                    current     = t.getDouble("current"),
                    target      = t.getDouble("target"),
                    percentage  = t.getDouble("percentage"),
                    unit        = t.optString("unit", ""),
                    filledColor = t.optString("filledColor", "#2B5BAD"),
                    bgColor     = t.optString("bgColor", "#B8CCE8"),
                    chartPoints = chartPoints,
                )
            }
            ProgressWidgetData(
                trackers  = trackers,
                updatedAt = obj.optString("updatedAt", ""),
            )
        } catch (e: Exception) {
            null
        }
    }
}
