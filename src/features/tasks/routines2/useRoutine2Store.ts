/**
 * useRoutine2Store — Routine 2 state store.
 *
 * Source of truth is the INDIVIDUAL HABIT (`HabitHistory`, date-keyed). The
 * routine is only a grouping. A derived `checkins: Record<number, CheckinLog[]>`
 * is recomputed after every change so the (duplicated) Routine UI — which reads
 * per-routine-per-date `CheckinLog`s — works unchanged. Crucially, every
 * mutation persists exactly the one (or, for "mark all", N independent) habit
 * record(s) it touched, so editing one habit can never alter another.
 *
 * Exposes the routine store surface the routines2/ components consume (toggle,
 * mark failed, timer, derived checkins).
 */

import { create } from 'zustand'
import { format, parseISO } from 'date-fns'
import { useRoutine2System } from './useRoutine2System'
import type { HabitHistory } from './useRoutine2System'
import type { RoutineDef, CheckinLog, ActiveTimer } from '../routines/routineTypes'
import { getPendingRoutineStepIds } from '../routines/routineSchedule'
import { useExecuteLog } from '@/features/tasks/execute/useExecuteLog'
import { useSystemLog } from '@/features/tasks/execute/useSystemLog'

/** Mutual exclusion: pause any running Execute task timer before a routine takes over. */
function pauseExecuteTimer() {
  const ex = useExecuteLog.getState()
  if (ex.timerRunningKey) ex.pause()
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

const addDate = (arr: string[], d: string) => (arr.includes(d) ? arr : [...arr, d])
const rmDate = (arr: string[], d: string) => arr.filter((x) => x !== d)

/**
 * Build the per-routine-per-date CheckinLog view for one routine by joining its
 * steps with the flat habit-history map. Habits are keyed by id alone, so this
 * join is what associates a habit (and its full history) with its current
 * routine — re-tagging a habit simply moves its step into another routine.
 */
function synthRoutine(routine: RoutineDef, historyById: Record<string, HabitHistory>): CheckinLog[] {
  const dates = new Set<string>()
  for (const step of routine.steps) {
    const h = historyById[step.id]
    if (!h) continue
    h.done.forEach((d) => dates.add(d))
    h.failed.forEach((d) => dates.add(d))
  }
  const out: CheckinLog[] = []
  for (const date of dates) {
    const completedStepIds: string[] = []
    const failedStepIds: string[] = []
    const stepCompletionTimes: Record<string, string> = {}
    for (const step of routine.steps) {
      const h = historyById[step.id]
      if (!h) continue
      if (h.done.includes(date)) {
        completedStepIds.push(step.id)
        if (h.times[date]) stepCompletionTimes[step.id] = h.times[date]
      }
      if (h.failed.includes(date)) failedStepIds.push(step.id)
    }
    out.push({
      routineTaskId: routine.taskId,
      date,
      completedStepIds,
      failedStepIds: failedStepIds.length > 0 ? failedStepIds : undefined,
      durationSec: 0,
      stepCompletionTimes: Object.keys(stepCompletionTimes).length > 0 ? stepCompletionTimes : undefined,
    })
  }
  return out
}

function recompute(routines: RoutineDef[], historyById: Record<string, HabitHistory>): Record<number, CheckinLog[]> {
  const out: Record<number, CheckinLog[]> = {}
  for (const routine of routines) {
    out[routine.taskId] = synthRoutine(routine, historyById)
  }
  return out
}

/** Returns the index of the next step (from fromIndex) that hasn't been done or skipped. */
function findNextUndone(ids: string[], fromIndex: number, done: string[], skipped: string[]): number {
  for (let i = fromIndex; i < ids.length; i++) {
    if (!done.includes(ids[i]) && !skipped.includes(ids[i])) return i
  }
  return ids.length
}

/** Nearest previous step (before fromIndex) not marked Done. Skipped steps included. */
function findPrevUndone(ids: string[], fromIndex: number, done: string[]): number {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (!done.includes(ids[i])) return i
  }
  return -1
}

interface Routine2StoreState {
  routines: RoutineDef[]
  /** Internal source of truth: habitId → history (routine-independent) */
  habitHistoryById: Record<string, HabitHistory>
  /** Derived view kept in sync with habitHistoryById + routines */
  checkins: Record<number, CheckinLog[]>
  loading: boolean
  activeTimer: ActiveTimer | null
  timerMinimized: boolean
  routineQueue: number[]

  minimizeTimer: () => void
  expandTimer: () => void
  loadRoutines: () => Promise<void>
  getCheckinForDate: (routineTaskId: number, date: string) => CheckinLog | undefined
  getTodayCheckin: (routineTaskId: number) => CheckinLog | undefined
  getLast7Days: (routineTaskId: number) => { date: string; done: boolean }[]
  getLast7CompletionTimes: (routineTaskId: number, stepId: string) => string[]
  updateCheckinTime: (routineTaskId: number, date: string, stepId: string, newTime: string) => Promise<void>
  toggleStep: (routine: RoutineDef, stepId: string, date?: string) => Promise<void>
  markStepFailed: (routine: RoutineDef, stepId: string, date?: string) => Promise<void>
  markAllPendingFailed: (routine: RoutineDef, date?: string) => Promise<void>
  resetStep: (routine: RoutineDef, stepId: string, date?: string) => Promise<void>
  startTimer: (routine: RoutineDef) => void
  startQueue: (routines: RoutineDef[]) => void
  pauseTimer: () => void
  resumeTimer: () => void
  extendStep: (sec: number) => void
  advanceStep: (action: 'done' | 'skip') => Promise<void>
  goBack: () => void
  stopTimer: () => void

  // ── Internal helpers (per-habit writes) ──
  applyHabit: (habitId: string, mutate: (h: HabitHistory) => HabitHistory, routineName: string) => void
  persistHabit: (h: HabitHistory, routineName: string) => Promise<void>
}

export const useRoutine2Store = create<Routine2StoreState>()((set, get) => ({
  routines: [],
  habitHistoryById: {},
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
      const { fetchAll } = useRoutine2System.getState()
      const { routines, historyById } = await fetchAll()
      set({ routines, habitHistoryById: historyById, checkins: recompute(routines, historyById), loading: false })
    } catch (e) {
      console.warn('[Routine2Store] load failed:', e)
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

  getLast7CompletionTimes: (_routineTaskId, stepId) => {
    const habit = get().habitHistoryById[stepId]
    if (!habit) return []
    return Object.entries(habit.times)
      .filter(([d]) => habit.done.includes(d))
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 10)
      .map(([, t]) => t)
  },

  applyHabit: (habitId, mutate, routineName) => {
    const prevMap = get().habitHistoryById
    const prev = prevMap[habitId] ?? { habitId, done: [], failed: [], times: {} }
    const next = mutate({
      ...prev,
      done: [...prev.done],
      failed: [...prev.failed],
      times: { ...prev.times },
    })
    const newMap = { ...prevMap, [habitId]: next }
    set({ habitHistoryById: newMap, checkins: recompute(get().routines, newMap) })
    void get().persistHabit(next, routineName)
  },

  persistHabit: async (h, routineName) => {
    try {
      const sys = useRoutine2System.getState()
      const sysId = h.systemTaskId ?? sys.habitLogTaskIds[h.habitId]
      await sys.saveHabitLog({ ...h, systemTaskId: sysId }, routineName)

      const newId = useRoutine2System.getState().habitLogTaskIds[h.habitId]
      if (newId && !h.systemTaskId) {
        set((s) => {
          const cur = s.habitHistoryById[h.habitId]
          if (!cur) return {}
          return {
            habitHistoryById: { ...s.habitHistoryById, [h.habitId]: { ...cur, systemTaskId: newId } },
          }
        })
      }
    } catch (e) {
      console.warn('[Routine2Store] persistHabit failed:', e)
    }
  },

  updateCheckinTime: async (routineTaskId, date, stepId, newTime) => {
    const routineName = get().routines.find((r) => r.taskId === routineTaskId)?.name ?? ''
    get().applyHabit(stepId, (h) => {
      h.times[date] = newTime
      return h
    }, routineName)
  },

  toggleStep: async (routine, stepId, date?) => {
    const targetDate = date ?? todayStr()
    const isToday = targetDate === todayStr()
    get().applyHabit(stepId, (h) => {
      if (h.done.includes(targetDate)) {
        h.done = rmDate(h.done, targetDate)
        delete h.times[targetDate]
      } else {
        h.done = addDate(h.done, targetDate)
        h.failed = rmDate(h.failed, targetDate)
        if (isToday && !h.times[targetDate]) h.times[targetDate] = format(new Date(), 'HH:mm')
      }
      return h
    }, routine.name)
  },

  markStepFailed: async (routine, stepId, date?) => {
    const targetDate = date ?? todayStr()
    get().applyHabit(stepId, (h) => {
      if (h.failed.includes(targetDate)) {
        h.failed = rmDate(h.failed, targetDate)
      } else {
        h.failed = addDate(h.failed, targetDate)
        h.done = rmDate(h.done, targetDate)
        delete h.times[targetDate]
      }
      return h
    }, routine.name)
  },

  resetStep: async (routine, stepId, date?) => {
    const targetDate = date ?? todayStr()
    get().applyHabit(stepId, (h) => {
      h.done = rmDate(h.done, targetDate)
      h.failed = rmDate(h.failed, targetDate)
      delete h.times[targetDate]
      return h
    }, routine.name)
  },

  markAllPendingFailed: async (routine, date?) => {
    const targetDate = date ?? todayStr()
    const dayOfWeek = parseISO(targetDate).getDay()
    const existing = get().getCheckinForDate(routine.taskId, targetDate)
    const completed = existing?.completedStepIds ?? []
    const failed = existing?.failedStepIds ?? []
    const pending = getPendingRoutineStepIds(routine, completed, dayOfWeek, failed)
    if (pending.length === 0) return
    // Each pending habit is failed via its own independent write.
    for (const habitId of pending) {
      get().applyHabit(habitId, (h) => {
        h.failed = addDate(h.failed, targetDate)
        h.done = rmDate(h.done, targetDate)
        delete h.times[targetDate]
        return h
      }, routine.name)
    }
  },

  startTimer: (routine) => {
    const now = Date.now()
    const todayCheckin = get().getTodayCheckin(routine.taskId)
    const completedToday = todayCheckin?.completedStepIds ?? []
    const failedToday = todayCheckin?.failedStepIds ?? []
    const pendingStepIds = getPendingRoutineStepIds(routine, completedToday, new Date().getDay(), failedToday)
    if (pendingStepIds.length === 0) return

    pauseExecuteTimer()
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
      const checkin = get().getTodayCheckin(routine.taskId)
      const completedToday = checkin?.completedStepIds ?? []
      const failedToday = checkin?.failedStepIds ?? []
      return getPendingRoutineStepIds(routine, completedToday, dayOfWeek, failedToday).length > 0
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
    pauseExecuteTimer()
    set({ activeTimer: { ...activeTimer, pausedAt: null, stepStartedAt: Date.now() } })
  },

  extendStep: (sec) => {
    const { activeTimer, routines } = get()
    if (!activeTimer) return
    const routine = routines.find((r) => r.taskId === activeTimer.routineTaskId)
    const step = routine?.steps.find((s) => s.id === activeTimer.pendingStepIds[activeTimer.stepIndex])
    const baseSec = step ? step.durationMin * 60 : 0
    const minExtension = baseSec > 0 ? 60 - baseSec : 0
    const nextExtension = Math.max(minExtension, activeTimer.extensionSec + sec)
    set({ activeTimer: { ...activeTimer, extensionSec: nextExtension } })
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

    const nowHHmm = format(new Date(), 'HH:mm')
    const stepCompletionTimes = action === 'done'
      ? { ...activeTimer.stepCompletionTimes, [currentStepId]: nowHHmm }
      : activeTimer.stepCompletionTimes

    const nextIndex = findNextUndone(
      activeTimer.pendingStepIds, activeTimer.stepIndex + 1, completedStepIds, skippedStepIds,
    )

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
        stepCompletionTimes,
        totalElapsedSec: newTotalElapsed,
      },
    })

    // Log the step's elapsed time to the Log tab under a SINGLE routine identity
    // (taskId = routine.taskId, name = routine.name) so the grouped-by-task view
    // collapses every step into one "routine" group instead of one row per habit.
    // Fire for both done and skip — time was spent either way; syncSession drops <10s blocks.
    const roundedElapsed = Math.round(stepElapsed)
    if (roundedElapsed >= 10) {
      const startMs = Date.now() - roundedElapsed * 1000
      const nowIso = new Date().toISOString()
      const listId = useRoutine2System.getState().systemListId ?? 0
      const key = `${listId}:${todayStr()}:${routine.taskId}:${startMs}`
      void useSystemLog.getState().syncSession(key, routine.name, {
        taskId: routine.taskId,
        estimateMin: 0,
        startedAt: new Date(startMs).toISOString(),
        actualSeconds: roundedElapsed,
        completedAt: nowIso,
      }).catch(() => {})
    }

    // Persist only the one habit that was completed — independent of siblings.
    if (action === 'done') {
      const today = todayStr()
      get().applyHabit(currentStepId, (h) => {
        h.done = addDate(h.done, today)
        h.failed = rmDate(h.failed, today)
        if (!h.times[today]) h.times[today] = nowHHmm
        return h
      }, routine.name)
    }
  },

  goBack: () => {
    const { activeTimer } = get()
    if (!activeTimer) return
    const { pendingStepIds, stepIndex, completedStepIds } = activeTimer
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
      const nextCheckin = getTodayCheckin(nextRoutine.taskId)
      const completed = nextCheckin?.completedStepIds ?? []
      const failed = nextCheckin?.failedStepIds ?? []
      const hasPending = getPendingRoutineStepIds(nextRoutine, completed, dayOfWeek, failed).length > 0
      if (hasPending) {
        set({ routineQueue: queue })
        get().startTimer(nextRoutine)
        return
      }
    }
    set({ activeTimer: null, routineQueue: [], timerMinimized: false })
  },
}))
