package com.ashishpatel.checkvist.widget

import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetDataModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WidgetDataModule"

    @ReactMethod
    fun updateWidgetData(jsonData: String) {
        val ctx = reactApplicationContext
        ctx.getSharedPreferences(PendingHabitsWidget.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PendingHabitsWidget.KEY_DATA, jsonData)
            .apply()

        // Broadcast to all active PendingHabitsWidget instances
        ctx.sendBroadcast(
            Intent(ctx, PendingHabitsWidget::class.java).apply {
                action = PendingHabitsWidget.ACTION_DATA_UPDATED
            }
        )
    }
}
