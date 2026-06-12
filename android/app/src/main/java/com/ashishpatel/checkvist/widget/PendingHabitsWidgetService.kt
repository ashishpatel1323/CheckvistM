package com.ashishpatel.checkvist.widget

import android.content.Intent
import android.widget.RemoteViewsService

class PendingHabitsWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        PendingHabitsWidgetFactory(applicationContext, intent)
}
