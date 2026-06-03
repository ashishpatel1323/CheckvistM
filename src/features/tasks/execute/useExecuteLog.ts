import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { format } from 'date-fns'

export const MIN_ESTIMATE = 5
export const ESTIMATE_STEP = 5
export const DEFAULT_ESTIMATE = 10

export interface ExecuteLogEntry {
  taskId: number
  estimateMin: number
  startedAt: string | null
  actualSeconds: number
  completedAt: string | null
}

interface ExecuteLogStore {
  entries: Record<string, ExecuteLogEntry>
  // Wall-clock timestamp (ms) when the current timer started ticking.
  // Non-null means the timer is running, survives tab switches/unmounts.
  timerStartedAt: number | null
  timerRunningKey: string | null
  seed: (key: string, taskId: number, estimateMin: number) => void
  setEstimate: (key: string, min: number) => void
  markStarted: (key: string) => void
  play: (key: string) => void
  pause: () => void
  markCompleted: (key: string) => void
  reset: (key: string) => void
}

export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function entryKey(checklistId: number, taskId: number): string {
  return `${checklistId}:${todayKey()}:${taskId}`
}

/** Compute live elapsed seconds for a running timer without mutating state. */
export function liveSeconds(entry: ExecuteLogEntry, timerRunningKey: string | null, timerStartedAt: number | null, key: string): number {
  const running = timerRunningKey === key && timerStartedAt !== null
  const extra = running ? Math.floor((Date.now() - timerStartedAt) / 1000) : 0
  return entry.actualSeconds + extra
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useExecuteLog = create<ExecuteLogStore>()(
  persist(
    (set, get) => ({
      entries: {},
      timerStartedAt: null,
      timerRunningKey: null,
      seed: (key, taskId, estimateMin) =>
        set((s) => {
          if (s.entries[key]) return s
          return {
            entries: {
              ...s.entries,
              [key]: { taskId, estimateMin, startedAt: null, actualSeconds: 0, completedAt: null },
            },
          }
        }),
      setEstimate: (key, min) =>
        set((s) => {
          const entry = s.entries[key]
          if (!entry) return s
          const clamped = Math.max(MIN_ESTIMATE, min)
          return { entries: { ...s.entries, [key]: { ...entry, estimateMin: clamped } } }
        }),
      markStarted: (key) =>
        set((s) => {
          const entry = s.entries[key]
          if (!entry || entry.startedAt) return s
          return { entries: { ...s.entries, [key]: { ...entry, startedAt: new Date().toISOString() } } }
        }),
      play: (key) => {
        const s = get()
        // Flush any previously running timer first.
        if (s.timerRunningKey && s.timerStartedAt !== null) {
          const prev = s.entries[s.timerRunningKey]
          if (prev) {
            const extra = Math.floor((Date.now() - s.timerStartedAt) / 1000)
            set((st) => ({
              entries: { ...st.entries, [s.timerRunningKey!]: { ...prev, actualSeconds: prev.actualSeconds + extra } },
            }))
          }
        }
        // Mark startedAt if first time.
        const entry = get().entries[key]
        if (entry && !entry.startedAt) {
          set((st) => ({
            entries: { ...st.entries, [key]: { ...st.entries[key], startedAt: new Date().toISOString() } },
          }))
        }
        set({ timerRunningKey: key, timerStartedAt: Date.now() })
      },
      pause: () => {
        const s = get()
        if (!s.timerRunningKey || s.timerStartedAt === null) return
        const entry = s.entries[s.timerRunningKey]
        if (entry) {
          const extra = Math.floor((Date.now() - s.timerStartedAt) / 1000)
          set((st) => ({
            entries: { ...st.entries, [s.timerRunningKey!]: { ...entry, actualSeconds: entry.actualSeconds + extra } },
            timerRunningKey: null,
            timerStartedAt: null,
          }))
        } else {
          set({ timerRunningKey: null, timerStartedAt: null })
        }
      },
      markCompleted: (key) => {
        // Flush running time if this task is currently running.
        const s = get()
        if (s.timerRunningKey === key && s.timerStartedAt !== null) {
          const entry = s.entries[key]
          if (entry) {
            const extra = Math.floor((Date.now() - s.timerStartedAt) / 1000)
            set((st) => ({
              entries: { ...st.entries, [key]: { ...entry, actualSeconds: entry.actualSeconds + extra, completedAt: new Date().toISOString() } },
              timerRunningKey: null,
              timerStartedAt: null,
            }))
            return
          }
        }
        set((st) => {
          const e = st.entries[key]
          if (!e) return st
          return { entries: { ...st.entries, [key]: { ...e, completedAt: new Date().toISOString() } } }
        })
      },
      reset: (key) => {
        const s = get()
        const updates: Partial<ExecuteLogStore> = {}
        if (s.timerRunningKey === key) {
          updates.timerRunningKey = null
          updates.timerStartedAt = null
        }
        set((st) => {
          const e = st.entries[key]
          if (!e) return st
          return { ...updates, entries: { ...st.entries, [key]: { ...e, startedAt: null, actualSeconds: 0, completedAt: null } } }
        })
      },
    }),
    { name: 'execute-log', storage }
  )
)
