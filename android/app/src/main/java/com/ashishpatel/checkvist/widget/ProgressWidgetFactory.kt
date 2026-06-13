package com.ashishpatel.checkvist.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.ashishpatel.checkvist.R
import kotlin.math.roundToInt

class ProgressWidgetFactory(
    private val context: Context,
    intent: Intent,
) : RemoteViewsService.RemoteViewsFactory {

    private val widgetId = intent.getIntExtra(
        AppWidgetManager.EXTRA_APPWIDGET_ID,
        AppWidgetManager.INVALID_APPWIDGET_ID,
    )

    private var items: List<ProgressTrackerItem> = emptyList()

    override fun onCreate() { refresh() }
    override fun onDataSetChanged() { refresh() }
    override fun onDestroy() {}

    private fun refresh() {
        val prefs = context.getSharedPreferences(ProgressWidget.PREFS_NAME, Context.MODE_PRIVATE)
        items = prefs.getString(ProgressWidget.KEY_DATA, null)
            ?.let { ProgressWidgetData.fromJson(it) }
            ?.trackers
            ?: emptyList()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        val item = items.getOrNull(position)
            ?: return RemoteViews(context.packageName, R.layout.widget_progress_item)

        val views = RemoteViews(context.packageName, R.layout.widget_progress_item)

        val filledColor = runCatching { Color.parseColor(item.filledColor) }.getOrDefault(Color.parseColor("#2B5BAD"))
        val bgColor     = runCatching { Color.parseColor(item.bgColor) }.getOrDefault(Color.parseColor("#B8CCE8"))

        views.setInt(R.id.progress_item_color_dot, "setBackgroundColor", filledColor)
        views.setTextViewText(R.id.progress_item_name, item.name)

        val pct = item.percentage.roundToInt()
        val valueText = if (item.unit.isNotEmpty()) {
            "${fmt(item.current)} / ${fmt(item.target)} ${item.unit}"
        } else {
            "${fmt(item.current)} / ${fmt(item.target)}"
        }
        views.setTextViewText(R.id.progress_item_value, valueText)
        views.setTextViewText(R.id.progress_item_pct, "$pct%")
        views.setTextViewTextColor(R.id.progress_item_pct, filledColor)

        // ProgressBar: max=100, progress=clamped pct
        views.setProgressBar(R.id.progress_item_bar, 100, pct.coerceIn(0, 100), false)
        views.setInt(R.id.progress_item_bar_bg, "setBackgroundColor", bgColor)

        return views
    }

    private fun fmt(v: Double): String =
        if (v == v.toLong().toDouble()) v.toLong().toString() else "%.1f".format(v)

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = false
}
