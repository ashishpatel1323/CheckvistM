import { create } from 'zustand'
import { format } from 'date-fns'
import { useRoutineSystem } from './useRoutineSystem'
import type { RoutineDef, CheckinLog } from './routineTypes'
import { getPendingRoutineStepIds } from './routineSchedule'
import { syncWidget } from '@/lib/widgetBridge'

export interface ActiveTimer {
  routineTaskId: number
  /** Index into pendingStepIds (the filtered list of steps to run) */
  stepIndex: number
  /** Only the steps that are still pending (not yet succeeded today) */
  pendingStepIds: string[]
  stepStartedAt: number
  pausedAt: number | null
  stepElapsedSec: number
  completedStepIds: string[]
  skippedStepIds: string[]
  routineStartedAt: number
  totalElapsedSec: number
  /** Extra time added to the current step via "extend" while it overruns, in seconds */
  extensionSec: number
  /** stepId → HH:MM captured the moment each step's Done button was tapped this session */
  stepCompletionTimes: Record<string, string>
}

interface RoutineStoreState {
  routines: RoutineDef[]
  /** routineTaskId → checkins (all dates) */
  checkins: Record<number, CheckinLog[]>
  loading: boolean
  activeTimer: ActiveTimer | null
  timerMinimized: boolean
  /** Remaining routine taskIds to auto-start once the current one finishes */
  routineQueue: number[]

  minimizeTimer: () => void
  expandTimer: () => void
  loadRoutines: () => Promise<void>
  getCheckinForDate: (routineTaskId: number, date: string) => CheckinLog | undefined
  getTodayCheckin: (routineTaskId: number) => CheckinLog | undefined
  getLast7Days: (routineTaskId: number) => { date: string; done: boolean }[]
  /** Last ≤7 HH:MM times when a specific step was marked done (most-recent first) */
  getLast7CompletionTimes: (routineTaskId: number, stepId: string) => string[]
  /** Overwrite a specific step's recorded completion time for a given date and persist it */
  updateCheckinTime: (routineTaskId: number, date: string, stepId: string, newTime: string) => Promise<void>
  /** Toggle a single step done/undone for a given date (defaults to today) */
  toggleStep: (routine: RoutineDef, stepId: string, date?: string) => Promise<void>
  startTimer: (routine: RoutineDef) => void
  /** Start the first routine and queue the rest to auto-start in sequence */
  startQueue: (routines: RoutineDef[]) => void
  pauseTimer: () => void
  resumeTimer: () => void
  /** Add extra time (in seconds) to the currently running step's countdown */
  extendStep: (sec: number) => void
  advanceStep: (action: 'done' | 'skip') => Promise<void>
  /** Go back to the previous pending step, un-doing its done/skip so it can be re-attempted */
  goBack: () => void
  stopTimer: () => void
  upsertCheckin: (log: CheckinLog, routineName: string) => Promise<void>
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Returns the index of the next step (from fromIndex) that hasn't been done or skipped. */
function findNextUndone(ids: string[], fromIndex: number, done: string[], skipped: string[]): number {
  for (let i = fromIndex; i < ids.length; i++) {
    if (!done.includes(ids[i]) && !skipped.includes(ids[i])) return i
  }
  return ids.length // all remaining are done/skipped — routine finished
}

/** Returns the index of the nearest previous step (before fromIndex) that was NOT marked Done.
 *  Skipped steps ARE included — you can go back and retry a skipped habit. */
function findPrevUndone(ids: string[], fromIndex: number, done: string[]): number {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (!done.includes(ids[i])) return i
  }
  return -1
}

export const useRoutineStore = create<RoutineStoreState>()((set, get) => ({
  routines: [],
  checkins: {},
  loading: false,
  activeTimer: null,
  timerMinimized: false,
  routineQueue: [],
  minimizeTimer: () => set({ timerMinimized: true }),
  expandTimer: () => set({ timerMinimized: false }),

  loadRoutines: async () => {
    set({ loading: true })
    try {
      const { fetchAll } = useRoutineSystem.getState()
      const { routines, checkinsByRoutine } = await fetchAll()
      set({ routines, checkins: checkinsByRoutine, loading: false })
      syncWidget(routines, checkinsByRoutine)
    } catch (e) {
      console.warn('[RoutineStore] load failed:', e)
      set({ loading: false })
    }
  },

  getCheckinForDate: (routineTaskId, date) => {
    return get().checkins[routineTaskId]?.find((c) => c.date === date)
  },

  getTodayCheckin: (routineTaskId) => {
    return get().getCheckinForDate(routineTaskId, todayStr())
  },

  getLast7Days: (routineTaskId) => {
    const logs = get().checkins[routineTaskId] ?? []
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      const date = format(d, 'yyyy-MM-dd')
      const log = logs.find((l) => l.date === date)
      const done = log ? log.completedStepIds.length > 0 : false
      return { date, done }
    })
  },

  getLast7CompletionTimes: (routineTaskId, stepId) => {
    const logs = get().checkins[routineTaskId] ?? []
    return logs
      .filter((l) => l.completedStepIds.includes(stepId) && l.stepCompletionTimes?.[stepId])
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 10)
      .map((l) => l.stepCompletionTimes![stepId])
  },

  updateCheckinTime: async (routineTaskId, date, stepId, newTime) => {
    const existing = get().getCheckinForDate(routineTaskId, date)
    if (!existing) return
    const updated: CheckinLog = {
      ...existing,
      stepCompletionTimes: { ...existing.stepCompletionTimes, [stepId]: newTime },
    }
    set((s) => {
      const arr = s.checkins[routineTaskId] ?? []
      return {
        checkins: {
          ...s.checkins,
          [routineTaskId]: arr.map((c) => (c.date === date ? updated : c)),
        },
      }
    })
    const routineName = get().routines.find((r) => r.taskId === routineTaskId)?.name ?? ''
    await get().upsertCheckin(updated, routineName)
  },

  toggleStep: async (routine, stepId, date?) => {
    const targetDate = date ?? todayStr()
    const existing = get().getCheckinForDate(routine.taskId, targetDate)

    let completedStepIds: string[]
    if (existing) {
      if (existing.completedStepIds.includes(stepId)) {
        completedStepIds = existing.completedStepIds.filter((id) => id !== stepId)
      } else {
        completedStepIds = [...existing.completedStepIds, stepId]
      }
    } else {
      completedStepIds = [stepId]
    }

    const isToday = targetDate === todayStr()
    const prevTimes = existing?.stepCompletionTimes ?? {}
    let stepCompletionTimes: Record<string, string>
    if (completedStepIds.includes(stepId)) {
      // Adding — record this step's time if it's today and not already recorded
      stepCompletionTimes = prevTimes[stepId]
        ? prevTimes
        : isToday ? { ...prevTimes, [stepId]: format(new Date(), 'HH:mm') } : prevTimes
    } else {
      // Removing — clear this step's time
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [stepId]: _removed, ...rest } = prevTimes
      stepCompletionTimes = rest
    }
    const log: CheckinLog = {
      routineTaskId: routine.taskId,
      date: targetDate,
      completedStepIds,
      durationSec: existing?.durationSec ?? 0,
      stepCompletionTimes: Object.keys(stepCompletionTimes).length > 0 ? stepCompletionTimes : undefined,
      systemTaskId: existing?.systemTaskId,
    }

    // Optimistic update
    set((s) => {
      const existing2 = s.checkins[routine.taskId] ?? []
      const others = existing2.filter((c) => c.date !== targetDate)
      return { checkins: { ...s.checkins, [routine.taskId]: [...others, log] } }
    })

    await get().upsertCheckin(log, routine.name)
  },

  startTimer: (routine) => {
    const now = Date.now()
    const todayCheckin = get().getTodayCheckin(routine.taskId)
    const completedToday = todayCheckin?.completedStepIds ?? []
    const pendingStepIds = getPendingRoutineStepIds(routine, completedToday, new Date().getDay())
    if (pendingStepIds.length === 0) return

    set({
      activeTimer: {
        routineTaskId: routine.taskId,
        stepIndex: 0,
        pendingStepIds,
        stepStartedAt: now,
        pausedAt: null,
        stepElapsedSec: 0,
        completedStepIds: [],
        skippedStepIds: [],
        routineStartedAt: now,
        totalElapsedSec: 0,
        extensionSec: 0,
        stepCompletionTimes: {},
      },
    })
  },

  startQueue: (routinesToRun) => {
    const dayOfWeek = new Date().getDay()
    const eligibleRoutines = routinesToRun.filter((routine) => {
      const completedToday = get().getTodayCheckin(routine.taskId)?.completedStepIds ?? []
      return getPendingRoutineStepIds(routine, completedToday, dayOfWeek).length > 0
    })
    if (eligibleRoutines.length === 0) return

    const [first, ...rest] = eligibleRoutines
    set({ routineQueue: rest.map((r) => r.taskId) })
    get().startTimer(first)
  },

  pauseTimer: () => {
    const { activeTimer } = get()
    if (!activeTimer || activeTimer.pausedAt !== null) return
    const elapsed = activeTimer.stepElapsedSec + (Date.now() - activeTimer.stepStartedAt) / 1000
    set({ activeTimer: { ...activeTimer, pausedAt: Date.now(), stepElapsedSec: elapsed } })
  },

  resumeTimer: () => {
    const { activeTimer } = get()
    if (!activeTimer || activeTimer.pausedAt === null) return
    set({ activeTimer: { ...activeTimer, pausedAt: null, stepStartedAt: Date.now() } })
  },

  extendStep: (sec) => {
    const { activeTimer } = get()
    if (!activeTimer) return
    set({ activeTimer: { ...activeTimer, extensionSec: activeTimer.extensionSec + sec } })
  },

  advanceStep: async (action) => {
    const { activeTimer, routines } = get()
    if (!activeTimer) return
    const routine = routines.find((r) => r.taskId === activeTimer.routineTaskId)
    if (!routine) return

    const currentStepId = activeTimer.pendingStepIds[activeTimer.stepIndex]
    const stepElapsed = activeTimer.stepElapsedSec + (
      activeTimer.pausedAt !== null ? 0 : (Date.now() - activeTimer.stepStartedAt) / 1000
    )
    const newTotalElapsed = activeTimer.totalElapsedSec + stepElapsed

    const completedStepIds = action === 'done'
      ? [...activeTimer.completedStepIds, currentStepId]
      : activeTimer.completedStepIds
    const skippedStepIds = action === 'skip'
      ? [...activeTimer.skippedStepIds, currentStepId]
      : activeTimer.skippedStepIds

    // Record per-step completion time immediately when Done is tapped
    const stepCompletionTimes = action === 'done'
      ? { ...activeTimer.stepCompletionTimes, [currentStepId]: format(new Date(), 'HH:mm') }
      : activeTimer.stepCompletionTimes

    // Jump to the next step that hasn't been done or skipped yet
    const nextIndex = findNextUndone(
      activeTimer.pendingStepIds, activeTimer.stepIndex + 1, completedStepIds, skippedStepIds,
    )
    const isFinished = nextIndex >= activeTimer.pendingStepIds.length

    // Always persist immediately — don't wait for the whole routine to finish
    const today = todayStr()
    const existingCheckin = get().getTodayCheckin(routine.taskId)
    const alreadyCompleted = existingCheckin?.completedStepIds ?? []
    const mergedCompleted = [...new Set([...alreadyCompleted, ...completedStepIds])]
    const mergedStepTimes = { ...existingCheckin?.stepCompletionTimes, ...stepCompletionTimes }
    const log: CheckinLog = {
      routineTaskId: routine.taskId,
      date: today,
      completedStepIds: mergedCompleted,
      durationSec: Math.round(newTotalElapsed),
      stepCompletionTimes: Object.keys(mergedStepTimes).length > 0 ? mergedStepTimes : undefined,
      systemTaskId: existingCheckin?.systemTaskId,
    }

    set((s) => {
      const existing = s.checkins[routine.taskId] ?? []
      const others = existing.filter((c) => c.date !== today)
      return {
        checkins: { ...s.checkins, [routine.taskId]: [...others, log] },
        activeTimer: {
          ...activeTimer,
          stepIndex: nextIndex,
          stepStartedAt: Date.now(),
          pausedAt: null,
          stepElapsedSec: 0,
          extensionSec: 0,
          completedStepIds,
          skippedStepIds,
          stepCompletionTimes,
          totalElapsedSec: newTotalElapsed,
        },
      }
    })

    await get().upsertCheckin(log, routine.name)
  },

  goBack: () => {
    const { activeTimer } = get()
    if (!activeTimer) return
    const { pendingStepIds, stepIndex, completedStepIds, skippedStepIds } = activeTimer
    // Navigate back to the nearest previous step that is not yet done or skipped
    // (does NOT un-do any completions — completed steps stay completed)
    const prevIndex = findPrevUndone(pendingStepIds, stepIndex, completedStepIds)
    if (prevIndex < 0) return
    set({
      activeTimer: {
        ...activeTimer,
        stepIndex: prevIndex,
        stepStartedAt: Date.now(),
        pausedAt: null,
        stepElapsedSec: 0,
        extensionSec: 0,
      },
    })
  },

  stopTimer: () => {
    const { routines, getTodayCheckin } = get()
    const dayOfWeek = new Date().getDay()
    const queue = [...get().routineQueue]
    while (queue.length > 0) {
      const nextId = queue.shift()!
      const nextRoutine = routines.find((r) => r.taskId === nextId)
      if (!nextRoutine) continue
      const completed = getTodayCheckin(nextRoutine.taskId)?.completedStepIds ?? []
      const hasPending = getPendingRoutineStepIds(nextRoutine, completed, dayOfWeek).length > 0
      if (hasPending) {
        set({ routineQueue: queue })
        get().startTimer(nextRoutine)
        return
      }
    }
    set({ activeTimer: null, routineQueue: [], timerMinimized: false })
  },

  upsertCheckin: async (log, routineName) => {
    try {
      const { logCheckin, checkinTaskIds } = useRoutineSystem.getState()
      const key = `${log.routineTaskId}:${log.date}`
      const logWithId: CheckinLog = { ...log, systemTaskId: checkinTaskIds[key] }
      await logCheckin(logWithId, routineName)

      const newId = useRoutineSystem.getState().checkinTaskIds[key]
      if (newId && !log.systemTaskId) {
        set((s) => {
          const arr = s.checkins[log.routineTaskId] ?? []
          const updatedCheckins = {
            ...s.checkins,
            [log.routineTaskId]: arr.map((c) =>
              c.date === log.date ? { ...c, systemTaskId: newId } : c
            ),
          }
          syncWidget(s.routines, updatedCheckins)
          return { checkins: updatedCheckins }
        })
      } else {
        const { routines, checkins } = get()
        syncWidget(routines, checkins)
      }
    } catch (e) {
      console.warn('[RoutineStore] upsertCheckin failed:', e)
    }
  },
}))
