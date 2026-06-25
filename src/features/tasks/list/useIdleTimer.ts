import { create } from 'zustand'

// Single source of truth for the "nothing is being tracked" idle countdown. Previously the idle
// clock + limit lived independently in GlobalTimerBar (local state), in the menu-bar snapshot
// (a constant), and in the floating window (a local offset) — so the main app and the floating
// window drifted into two different timers. This store unifies them: GlobalTimerBar drives
// start/clear, both it and the snapshot read the same startedAt + limit, and any extend (from the
// main bar OR dispatched from the floating window) mutates this one place.

export const DEFAULT_IDLE_LIMIT_SEC = 5 * 60

interface IdleTimerState {
  /** Epoch ms when the idle window began; null while a task/routine is tracked. */
  startedAt: number | null
  /** Current idle limit in seconds (extendable). */
  limitSec: number
  /** Begin (or keep) the idle window; resets the limit to default on a fresh start. */
  ensureStarted: () => void
  /** Tracking resumed — clear the idle window and reset the limit. */
  clear: () => void
  /** Extend (or shrink) the idle limit; floored at 60s. */
  extend: (deltaSec: number) => void
}

export const useIdleTimer = create<IdleTimerState>((set, get) => ({
  startedAt: null,
  limitSec: DEFAULT_IDLE_LIMIT_SEC,
  ensureStarted: () => {
    if (get().startedAt == null) set({ startedAt: Date.now(), limitSec: DEFAULT_IDLE_LIMIT_SEC })
  },
  clear: () => {
    if (get().startedAt != null) set({ startedAt: null, limitSec: DEFAULT_IDLE_LIMIT_SEC })
  },
  extend: (deltaSec) => set({ limitSec: Math.max(60, get().limitSec + deltaSec) }),
}))
