package com.ashishpatel.checkvist.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
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
        views.setInt(R.id.progress_item_pct, "setTextColor", filledColor)

        // ProgressBar: max=100, progress=clamped pct
        views.setProgressBar(R.id.progress_item_bar, 100, pct.coerceIn(0, 100), false)
        views.setInt(R.id.progress_item_bar_bg, "setBackgroundColor", bgColor)

        // All-time chart
        if (item.chartPoints.size >= 2) {
            val bitmap = drawChartBitmap(item.chartPoints, item.target, filledColor, bgColor)
            views.setImageViewBitmap(R.id.progress_item_chart, bitmap)
            views.setViewVisibility(R.id.progress_item_chart, android.view.View.VISIBLE)
        } else {
            views.setViewVisibility(R.id.progress_item_chart, android.view.View.GONE)
        }

        return views
    }

    /**
     * Draws a step-style sparkline chart (matching the app's MiniChart) into a Bitmap.
     * The line steps horizontally then vertically (staircase), with a filled area underneath
     * and a dashed target line.
     */
    private fun drawChartBitmap(
        points: List<ChartPoint>,
        target: Double,
        lineColor: Int,
        bgColor: Int,
        width: Int = 800,
        height: Int = 160,
    ): Bitmap {
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)

        val paddingH = 8f
        val paddingTop = 10f
        val paddingBottom = 10f
        val chartW = width - paddingH * 2
        val chartH = height - paddingTop - paddingBottom

        // Background: very light tint of bgColor
        canvas.drawColor(Color.argb(30, Color.red(bgColor), Color.green(bgColor), Color.blue(bgColor)))

        val values = points.map { it.value }
        val minVal = minOf(values.min(), 0.0)
        val maxVal = maxOf(values.max(), target, minVal + 1.0)
        val range = maxVal - minVal

        fun xOf(idx: Int): Float = paddingH + (idx.toFloat() / (points.size - 1)) * chartW
        fun yOf(v: Double): Float = paddingTop + chartH - ((v - minVal) / range * chartH).toFloat()

        // Build stepped path
        val linePath = Path()
        val fillPath = Path()

        val x0 = xOf(0)
        val y0 = yOf(points[0].value)
        linePath.moveTo(x0, y0)
        fillPath.moveTo(x0, height.toFloat())
        fillPath.lineTo(x0, y0)

        for (i in 1 until points.size) {
            val xPrev = xOf(i - 1)
            val xCurr = xOf(i)
            val yCurr = yOf(points[i].value)
            val yPrev = yOf(points[i - 1].value)
            // Horizontal then vertical (step)
            linePath.lineTo(xCurr, yPrev)
            linePath.lineTo(xCurr, yCurr)
            fillPath.lineTo(xCurr, yPrev)
            fillPath.lineTo(xCurr, yCurr)
        }

        val xLast = xOf(points.size - 1)
        fillPath.lineTo(xLast, height.toFloat())
        fillPath.close()

        // Draw fill
        val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb(50, Color.red(lineColor), Color.green(lineColor), Color.blue(lineColor))
            style = Paint.Style.FILL
        }
        canvas.drawPath(fillPath, fillPaint)

        // Draw line
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = lineColor
            style = Paint.Style.STROKE
            strokeWidth = 2.5f
            strokeJoin = Paint.Join.ROUND
            strokeCap = Paint.Cap.ROUND
        }
        canvas.drawPath(linePath, linePaint)

        // Draw target dashed line
        if (target > minVal && target <= maxVal * 1.2) {
            val yTarget = yOf(target)
            val targetPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.argb(160, Color.red(lineColor), Color.green(lineColor), Color.blue(lineColor))
                style = Paint.Style.STROKE
                strokeWidth = 1.5f
                pathEffect = DashPathEffect(floatArrayOf(8f, 6f), 0f)
            }
            canvas.drawLine(paddingH, yTarget, paddingH + chartW, yTarget, targetPaint)
        }

        // Draw current value dot at last point
        val dotPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = lineColor
            style = Paint.Style.FILL
        }
        canvas.drawCircle(xOf(points.size - 1), yOf(points.last().value), 4f, dotPaint)

        return bmp
    }

    private fun fmt(v: Double): String =
        if (v == v.toLong().toDouble()) v.toLong().toString() else "%.1f".format(v)

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = false
}
