import { NativeModules, Platform } from 'react-native'
import { format } from 'date-fns'
import type { RoutineDef, CheckinLog } from '@/features/tasks/routines/routineTypes'
import type { Tracker, TrackerEntry } from '@/features/progress/types'
import { COLOR_PAIRS } from '@/features/progress/lib/trackerEncoding'
import { buildTimeSeries } from '@/features/progress/lib/replayEngine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WidgetDataModule: {
  updateWidgetData?: (json: string) => void
  updateProgressWidgetData?: (json: string) => void
} = (NativeModules as any).WidgetDataModule ?? {}

const ROUTINE_COLOR_HEX: Record<string, string> = {
  blue: '#3B82F6',
  green: '#22C55E',
  purple: '#A855F7',
  pink: '#EC4899',
  navy: '#1E40AF',
  teal: '#14B8A6',
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Serialises the current routine + checkin state into the JSON payload the
 * Android widget reads from SharedPreferences.
 */
export function buildWidgetPayload(
  routines: RoutineDef[],
  checkins: Record<number, CheckinLog[]>,
): string {
  const today = todayStr()
  const dayOfWeek = new Date().getDay() // 0 = Sun … 6 = Sat

  const routinePayloads = routines.map((routine) => {
    const completedIds = checkins[routine.taskId]?.find((c) => c.date === today)?.completedStepIds ?? []

    // Only count steps scheduled for today (empty scheduledDays = every day)
    const todaySteps = routine.steps.filter(
      (s) => s.scheduledDays.length === 0 || s.scheduledDays.includes(dayOfWeek),
    )
    const pendingSteps = todaySteps
      .filter((s) => !completedIds.includes(s.id))
      .map((s) => ({ id: s.id, name: s.name, emoji: s.emoji }))

    return {
      taskId: routine.taskId,
      name: routine.name,
      color: ROUTINE_COLOR_HEX[routine.color] ?? '#3B82F6',
      pendingSteps,
      totalSteps: todaySteps.length,
      completedSteps: todaySteps.length - pendingSteps.length,
    }
  })

  return JSON.stringify({
    routines: routinePayloads,
    updatedAt: format(new Date(), 'HH:mm'),
  })
}

/**
 * Pushes the current routine state to the Android home-screen widget.
 * No-op on iOS or web.
 */
export function syncWidget(
  routines: RoutineDef[],
  checkins: Record<number, CheckinLog[]>,
): void {
  if (Platform.OS !== 'android' || !WidgetDataModule.updateWidgetData) return
  try {
    WidgetDataModule.updateWidgetData(buildWidgetPayload(routines, checkins))
  } catch (e) {
    console.warn('[WidgetBridge] sync failed:', e)
  }
}

/**
 * Serialises progress tracker state into JSON for the Progress Android widget.
 * entriesMap: trackerId → TrackerEntry[] for chart data (optional)
 */
export function buildProgressWidgetPayload(
  trackers: Tracker[],
  entriesMap: Record<number, TrackerEntry[]> = {},
): string {
  const items = trackers.map((t) => {
    const { targetValue, initialValue } = t.meta
    const pct = targetValue > 0 ? Math.min(100, (t.currentValue / targetValue) * 100) : 0
    const colors = COLOR_PAIRS[t.meta.colorKey] ?? COLOR_PAIRS.blue

    // Build time series for the chart; keep last 30 points to limit payload size
    const entries = entriesMap[t.taskId] ?? []
    const series = buildTimeSeries(entries, initialValue)
    const chartPoints = series.slice(-30).map((p) => ({ d: p.date, v: p.value }))

    return {
      name: t.name,
      current: t.currentValue,
      target: targetValue,
      percentage: Math.round(pct * 10) / 10,
      unit: t.meta.unit ?? '',
      filledColor: colors.filled,
      bgColor: colors.background,
      chartPoints,
    }
  })
  return JSON.stringify({ trackers: items, updatedAt: format(new Date(), 'HH:mm') })
}

/**
 * Pushes current progress tracker state to the Android Progress widget.
 * No-op on iOS or web.
 */
export function syncProgressWidget(
  trackers: Tracker[],
  entriesMap: Record<number, TrackerEntry[]> = {},
): void {
  if (Platform.OS !== 'android' || !WidgetDataModule.updateProgressWidgetData) return
  try {
    WidgetDataModule.updateProgressWidgetData(buildProgressWidgetPayload(trackers, entriesMap))
  } catch (e) {
    console.warn('[WidgetBridge] progress sync failed:', e)
  }
}
