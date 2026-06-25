import { create } from 'zustand'

// Self-contained Pomodoro, ported from the Swift menu-bar app (tools/menubar-app/CheckvistTimer.swift,
// "MARK: Pomodoro"). Local, in-memory, independent of the Execute/Routine timer. Work → break → work…
// Durations are configurable. Remaining time is derived in the UI from a 1 s tick; the store only holds
// the phase + accrual anchors so pause/resume is exact.

export type PomoPhase = 'off' | 'work' | 'onBreak'

export const POMO_WORK_PRESETS = [15, 20, 25, 30, 45, 50] as const
export const POMO_BREAK_PRESETS = [5, 10, 15] as const

interface PomodoroState {
  phase: PomoPhase
  workMin: number
  breakMin: number
  /** Seconds accrued in the current phase before the current run segment. */
  accumSec: number
  /** Epoch ms the current run segment started; null when paused. */
  runStartedAt: number | null

  start: () => void
  stop: () => void
  reset: () => void
  pause: () => void
  resume: () => void
  /** Called by the UI when the current phase hits 0 — flips work↔break and resets accrual. */
  advancePhase: () => PomoPhase
  setWorkMin: (m: number) => void
  setBreakMin: (m: number) => void
}

export const usePomodoro = create<PomodoroState>((set, get) => ({
  // Always-running: the Pomodoro auto-starts the moment the floating window loads and loops
  // work → break → work forever (see advancePhase). There is no explicit start / off state.
  phase: 'work',
  workMin: 25,
  breakMin: 5,
  accumSec: 0,
  runStartedAt: Date.now(),

  start: () => set({ phase: 'work', accumSec: 0, runStartedAt: Date.now() }),
  stop: () => set({ phase: 'off', accumSec: 0, runStartedAt: null }),
  // Restart the current phase from full (no-op when off). Mirrors the Swift app's Reset.
  reset: () => { if (get().phase !== 'off') set({ accumSec: 0, runStartedAt: Date.now() }) },

  pause: () => {
    const { runStartedAt, accumSec } = get()
    if (runStartedAt == null) return
    set({ accumSec: accumSec + (Date.now() - runStartedAt) / 1000, runStartedAt: null })
  },
  resume: () => {
    if (get().phase === 'off' || get().runStartedAt != null) return
    set({ runStartedAt: Date.now() })
  },

  advancePhase: () => {
    const next: PomoPhase = get().phase === 'work' ? 'onBreak' : 'work'
    set({ phase: next, accumSec: 0, runStartedAt: Date.now() })
    return next
  },

  setWorkMin: (m) => set({ workMin: Math.max(1, m) }),
  setBreakMin: (m) => set({ breakMin: Math.max(1, m) }),
}))

/** Length of the given phase, in seconds, for the current durations. */
export function pomoPhaseLenSec(state: Pick<PomodoroState, 'phase' | 'workMin' | 'breakMin'>): number {
  return state.phase === 'onBreak' ? state.breakMin * 60 : state.workMin * 60
}

/** Seconds elapsed in the current phase, given an external `now`. */
export function pomoElapsedSec(state: Pick<PomodoroState, 'accumSec' | 'runStartedAt'>, now: number): number {
  return state.accumSec + (state.runStartedAt != null ? (now - state.runStartedAt) / 1000 : 0)
}
