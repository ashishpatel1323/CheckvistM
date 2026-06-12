package com.ashishpatel.checkvist.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.ashishpatel.checkvist.R

class PendingHabitsWidgetFactory(
    private val context: Context,
    intent: Intent,
) : RemoteViewsService.RemoteViewsFactory {

    private val widgetId = intent.getIntExtra(
        AppWidgetManager.EXTRA_APPWIDGET_ID,
        AppWidgetManager.INVALID_APPWIDGET_ID,
    )

    private sealed class ListItem {
        /** Routine name row — shown once per routine that has pending steps */
        data class SectionHeader(
            val name: String,
            val color: String,
            val pendingCount: Int,
            val totalSteps: Int,
        ) : ListItem()

        /** Individual pending step row */
        data class StepRow(val displayText: String) : ListItem()
    }

    private var items: List<ListItem> = emptyList()

    override fun onCreate() { refresh() }
    override fun onDataSetChanged() { refresh() }
    override fun onDestroy() {}

    private fun refresh() {
        val prefs = context.getSharedPreferences(PendingHabitsWidget.PREFS_NAME, Context.MODE_PRIVATE)
        val data = prefs.getString(PendingHabitsWidget.KEY_DATA, null)?.let { WidgetData.fromJson(it) }

        items = data?.routines
            ?.filter { it.pendingSteps.isNotEmpty() }
            ?.flatMap { routine ->
                buildList {
                    add(
                        ListItem.SectionHeader(
                            name = routine.name,
                            color = routine.color,
                            pendingCount = routine.pendingSteps.size,
                            totalSteps = routine.totalSteps,
                        )
                    )
                    routine.pendingSteps.forEach { step ->
                        val text = if (step.emoji.isNotEmpty()) "${step.emoji}  ${step.name}" else step.name
                        add(ListItem.StepRow(text))
                    }
                }
            }
            ?: emptyList()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        return when (val item = items.getOrNull(position)) {
            is ListItem.SectionHeader -> buildSectionHeader(item)
            is ListItem.StepRow -> buildStepRow(item)
            null -> RemoteViews(context.packageName, R.layout.widget_step_item)
        }
    }

    private fun buildSectionHeader(item: ListItem.SectionHeader): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_section_header)
        val colorInt = runCatching { Color.parseColor(item.color) }.getOrDefault(Color.parseColor("#3B82F6"))
        views.setInt(R.id.header_color_dot, "setBackgroundColor", colorInt)
        views.setTextViewText(R.id.header_routine_name, item.name)
        views.setTextViewText(R.id.header_pending_count, "${item.pendingCount}/${item.totalSteps}")
        return views
    }

    private fun buildStepRow(item: ListItem.StepRow): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_step_item)
        views.setTextViewText(R.id.step_name_text, item.displayText)
        return views
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 2
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = false
}
