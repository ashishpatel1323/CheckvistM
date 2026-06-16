package com.ashishpatel.checkvist.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.ashishpatel.checkvist.R

class ProgressWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { updateWidget(context, manager, it) }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH, ACTION_DATA_UPDATED -> {
                val manager = AppWidgetManager.getInstance(context)
                val component = ComponentName(context, ProgressWidget::class.java)
                manager.getAppWidgetIds(component).forEach { id ->
                    updateWidget(context, manager, id)
                    manager.notifyAppWidgetViewDataChanged(id, R.id.progress_widget_list)
                }
            }
        }
    }

    companion object {
        const val PREFS_NAME = "com.ashishpatel.checkvist.progress_widget_prefs"
        const val KEY_DATA   = "progress_widget_data"
        const val ACTION_REFRESH      = "com.ashishpatel.checkvist.widget.PROGRESS_REFRESH"
        const val ACTION_DATA_UPDATED = "com.ashishpatel.checkvist.widget.PROGRESS_DATA_UPDATED"

        fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_progress)

            // Bind scrollable list
            val svcIntent = Intent(context, ProgressWidgetService::class.java)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            views.setRemoteAdapter(R.id.progress_widget_list, svcIntent)
            views.setEmptyView(R.id.progress_widget_list, R.id.progress_widget_empty)

            // Tap → open app
            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                val openPending = PendingIntent.getActivity(
                    context, 10, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                views.setOnClickPendingIntent(R.id.progress_widget_open_app, openPending)
                views.setPendingIntentTemplate(R.id.progress_widget_list, openPending)
            }

            // Refresh button
            val refreshIntent = Intent(context, ProgressWidget::class.java)
                .apply { action = ACTION_REFRESH }
            val refreshPending = PendingIntent.getBroadcast(
                context, 11, refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.progress_widget_refresh_btn, refreshPending)

            // Updated time from prefs
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val data  = prefs.getString(KEY_DATA, null)?.let { ProgressWidgetData.fromJson(it) }
            views.setTextViewText(
                R.id.progress_widget_updated_time,
                data?.updatedAt ?: "",
            )

            manager.updateAppWidget(widgetId, views)
        }
    }
}
