package com.ashishpatel.checkvist.widget

import android.content.Intent
import android.widget.RemoteViewsService

class ProgressWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        ProgressWidgetFactory(applicationContext, intent)
}
