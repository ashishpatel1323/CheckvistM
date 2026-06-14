package com.ashishpatel.checkvist.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.ashishpatel.checkvist.R

class PendingHabitsWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { updateWidget(context, manager, it) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH, ACTION_DATA_UPDATED -> {
                val manager = AppWidgetManager.getInstance(context)
                val component = ComponentName(context, PendingHabitsWidget::class.java)
                manager.getAppWidgetIds(component).forEach { id ->
                    updateWidget(context, manager, id)
                    manager.notifyAppWidgetViewDataChanged(id, R.id.widget_list)
                }
            }
        }
    }

    companion object {
        const val PREFS_NAME = "com.ashishpatel.checkvist.widget_prefs"
        const val KEY_DATA = "widget_data"
        const val ACTION_REFRESH = "com.ashishpatel.checkvist.widget.ACTION_REFRESH"
        const val ACTION_DATA_UPDATED = "com.ashishpatel.checkvist.widget.DATA_UPDATED"

        const val EXTRA_ACTION = "widget_action"
        const val EXTRA_ROUTINE_ID = "routine_task_id"
        const val EXTRA_STEP_ID = "step_id"
        const val ACTION_TYPE_START = "start"
        const val ACTION_TYPE_DONE = "done"

        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_pending_habits)

            // Bind scrollable list
            val svcIntent = Intent(context, PendingHabitsWidgetService::class.java)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            views.setRemoteAdapter(R.id.widget_list, svcIntent)
            views.setEmptyView(R.id.widget_list, R.id.widget_empty_text)

            // Template: mutable VIEW intent — fillInIntent sets the URI per button
            val templateIntent = Intent(Intent.ACTION_VIEW).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val templatePending = PendingIntent.getActivity(
                context, 0, templateIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            views.setPendingIntentTemplate(R.id.widget_list, templatePending)

            // Tap header "Open App →" and refresh
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                val openPending = PendingIntent.getActivity(
                    context, 1, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                views.setOnClickPendingIntent(R.id.widget_open_app, openPending)
            }

            val refreshIntent = Intent(context, PendingHabitsWidget::class.java)
                .apply { action = ACTION_REFRESH }
            val refreshPending = PendingIntent.getBroadcast(
                context, 2, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_refresh_btn, refreshPending)

            // Global summary
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val data = prefs.getString(KEY_DATA, null)?.let { WidgetData.fromJson(it) }
            if (data != null) {
                val totalPending = data.routines.sumOf { it.pendingSteps.size }
                val totalSteps = data.routines.sumOf { it.totalSteps }
                val summary = if (totalPending == 0) "All habits done today ✓"
                              else "$totalPending of $totalSteps steps pending"
                views.setTextViewText(R.id.widget_global_summary, summary)
                views.setTextViewText(R.id.widget_updated_time, data.updatedAt)
            } else {
                views.setTextViewText(R.id.widget_global_summary, "Open app to sync")
                views.setTextViewText(R.id.widget_updated_time, "")
            }

            manager.updateAppWidget(widgetId, views)
        }

        /** Deep-link URI that the React Native app handles to mark a step done */
        fun markDoneUri(routineTaskId: Int, stepId: String): Uri =
            Uri.parse("checkvist://mark-step-done?routineTaskId=$routineTaskId&stepId=${Uri.encode(stepId)}")

        /** Deep-link URI that opens the app to the Routines tab */
        fun routinesUri(routineTaskId: Int): Uri =
            Uri.parse("checkvist://routines?routineTaskId=$routineTaskId")
    }
}
