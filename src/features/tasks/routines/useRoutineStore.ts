import { create } from 'zustand'
import { format } from 'date-fns'
import { useRoutineSystem } from './useRoutineSystem'
import type { RoutineDef, CheckinLog } from './routineTypes'

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
}

interface RoutineStoreState {
  routines: RoutineDef[]
  /** routineTaskId → checkins (all dates) */
  checkins: Record<number, CheckinLog[]>
  loading: boolean
  activeTimer: ActiveTimer | null
  /** Remaining routine taskIds to auto-start once the current one finishes */
  routineQueue: number[]

  loadRoutines: () => Promise<void>
  getCheckinForDate: (routineTaskId: number, date: string) => CheckinLog | undefined
  getTodayCheckin: (routineTaskId: number) => CheckinLog | undefined
  getLast7Days: (routineTaskId: number) => { date: string; done: boolean }[]
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
  stopTimer: () => void
  upsertCheckin: (log: CheckinLog, routineName: string) => Promise<void>
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

export const useRoutineStore = create<RoutineStoreState>()((set, get) => ({
  routines: [],
  checkins: {},
  loading: false,
  activeTimer: null,
  routineQueue: [],

  loadRoutines: async () => {
    set({ loading: true })
    try {
      const { fetchAll } = useRoutineSystem.getState()
      const { routines, checkinsByRoutine } = await fetchAll()
      set({ routines, checkins: checkinsByRoutine, loading: false })
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

    const log: CheckinLog = {
      routineTaskId: routine.taskId,
      date: targetDate,
      completedStepIds,
      durationSec: existing?.durationSec ?? 0,
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
    // Only include steps that haven't been completed today (all steps = failed by default)
    const todayCheckin = get().getTodayCheckin(routine.taskId)
    const completedToday = todayCheckin?.completedStepIds ?? []
    const pendingStepIds = routine.steps
      .filter((s) => !completedToday.includes(s.id))
      .map((s) => s.id)
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
      },
    })
  },

  startQueue: (routinesToRun) => {
    if (routinesToRun.length === 0) return
    const [first, ...rest] = routinesToRun
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

    // Done = succeeded; Skip = stays failed (still in skippedStepIds but not completed)
    const completedStepIds = action === 'done'
      ? [...activeTimer.completedStepIds, currentStepId]
      : activeTimer.completedStepIds
    const skippedStepIds = action === 'skip'
      ? [...activeTimer.skippedStepIds, currentStepId]
      : activeTimer.skippedStepIds

    const nextIndex = activeTimer.stepIndex + 1
    const isFinished = nextIndex >= activeTimer.pendingStepIds.length

    if (isFinished) {
      const today = todayStr()
      // Merge with any steps already completed earlier today
      const existingCheckin = get().getTodayCheckin(routine.taskId)
      const alreadyCompleted = existingCheckin?.completedStepIds ?? []
      const mergedCompleted = [...new Set([...alreadyCompleted, ...completedStepIds])]
      const log: CheckinLog = {
        routineTaskId: routine.taskId,
        date: today,
        completedStepIds: mergedCompleted,
        durationSec: Math.round(newTotalElapsed),
        systemTaskId: existingCheckin?.systemTaskId,
      }
      set((s) => {
        const existing = s.checkins[routine.taskId] ?? []
        const others = existing.filter((c) => c.date !== today)
        return {
          checkins: { ...s.checkins, [routine.taskId]: [...others, log] },
          activeTimer: { ...activeTimer, completedStepIds, skippedStepIds, totalElapsedSec: newTotalElapsed, stepIndex: nextIndex },
        }
      })
      await get().upsertCheckin(log, routine.name)
    } else {
      set({
        activeTimer: {
          ...activeTimer,
          stepIndex: nextIndex,
          stepStartedAt: Date.now(),
          pausedAt: null,
          stepElapsedSec: 0,
          extensionSec: 0,
          completedStepIds,
          skippedStepIds,
          totalElapsedSec: newTotalElapsed,
        },
      })
    }
  },

  stopTimer: () => {
    const { routines, getTodayCheckin } = get()
    const queue = [...get().routineQueue]
    while (queue.length > 0) {
      const nextId = queue.shift()!
      const nextRoutine = routines.find((r) => r.taskId === nextId)
      if (!nextRoutine) continue
      const completed = getTodayCheckin(nextRoutine.taskId)?.completedStepIds ?? []
      const hasPending = nextRoutine.steps.some((s) => !completed.includes(s.id))
      if (hasPending) {
        set({ routineQueue: queue })
        get().startTimer(nextRoutine)
        return
      }
    }
    set({ activeTimer: null, routineQueue: [] })
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
          return {
            checkins: {
              ...s.checkins,
              [log.routineTaskId]: arr.map((c) =>
                c.date === log.date ? { ...c, systemTaskId: newId } : c
              ),
            },
          }
        })
      }
    } catch (e) {
      console.warn('[RoutineStore] upsertCheckin failed:', e)
    }
  },
}))
