import type { CheckvistTask } from '@/api/types'
import type { RoutineDef, CheckinLog } from '@/features/tasks/routines/routineTypes'
import { isPast, isToday, parseISO } from 'date-fns'

export interface TabBadges {
  date: number
  execute: number
  routines: number
  log: number
}

/**
 * Calculate badge counts for each tab
 * - date: tasks due today count
 * - execute: tasks logged today
 * - routines: pending steps across all routines
 * - log: sessions recorded today
 */
export function calculateTabBadges(
  tasks: CheckvistTask[],
  routines: RoutineDef[],
  checkins: Record<number, CheckinLog[]>,
  getTodayCheckin: (routineTaskId: number) => CheckinLog | undefined,
  sessionCount: number,
): TabBadges {
  // Tasks due today
  const todayCount = tasks.filter((t) => {
    if (!t.due || t.status !== 0) return false
    const dueDate = parseISO(t.due.replace(/\//g, '-'))
    return isToday(dueDate)
  }).length

  // Execute: tasks with active checkin today (in-progress work)
  const executeCount = tasks.filter((t) => {
    return getTodayCheckin(t.id) !== undefined
  }).length

  // Routines: total pending steps across all routines
  let pendingStepsCount = 0
  for (const routine of routines) {
    const checkin = getTodayCheckin(routine.taskId)
    if (!checkin) {
      pendingStepsCount += routine.steps.length
    } else {
      const pending = routine.steps.filter(
        (s) =>
          !checkin.completedStepIds?.includes(s.id) &&
          !checkin.failedStepIds?.includes(s.id)
      ).length
      pendingStepsCount += pending
    }
  }

  // Log: sessions recorded (show if > 0)
  const logCount = sessionCount > 0 ? 1 : 0

  return {
    date: todayCount,
    execute: executeCount,
    routines: pendingStepsCount,
    log: logCount,
  }
}
