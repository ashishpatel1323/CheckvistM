import { NativeModules, Platform } from 'react-native'
import { format } from 'date-fns'
import type { RoutineDef, CheckinLog } from '@/features/tasks/routines/routineTypes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WidgetDataModule: { updateWidgetData?: (json: string) => void } = (NativeModules as any).WidgetDataModule ?? {}

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
