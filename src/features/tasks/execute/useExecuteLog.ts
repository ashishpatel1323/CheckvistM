import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { format } from 'date-fns'
import { useSystemLog } from './useSystemLog'

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
  // Task display names, set by ExecuteStateProvider for use during API sync
  taskNames: Record<string, string>
  seed: (key: string, taskId: number, estimateMin: number) => void
  setEstimate: (key: string, min: number) => void
  markStarted: (key: string) => void
  play: (key: string) => void
  pause: () => void
  markCompleted: (key: string) => void
  reset: (key: string) => void
  setTaskName: (key: string, name: string) => void
  /** Merge remote session data into local entries without overwriting active timers */
  hydrateFromRemote: (remote: Record<string, { startedAt: string; actualSeconds: number; completedAt: string | null }>) => void
  /** Overwrite start time and duration for a completed or paused session */
  updateSessionTimes: (key: string, startMin: number, durationMin: number) => void
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
      taskNames: {},
      setTaskName: (key, name) => set((s) => ({ taskNames: { ...s.taskNames, [key]: name } })),
      hydrateFromRemote: (remote) => set((s) => {
        const updated = { ...s.entries }
        for (const [key, session] of Object.entries(remote)) {
          const local = updated[key]
          if (!local) continue
          // Never overwrite a locally-started or currently-running session
          if (local.startedAt) continue
          if (s.timerRunningKey === key) continue
          updated[key] = {
            ...local,
            startedAt: session.startedAt,
            actualSeconds: session.actualSeconds,
            completedAt: session.completedAt,
          }
        }
        return { entries: updated }
      }),
      updateSessionTimes: (key, startMin, durationMin) =>
        set((s) => {
          const entry = s.entries[key]
          if (!entry || !entry.startedAt) return s
          // Reconstruct startedAt using the date from the key (format: checklistId:yyyy-MM-dd:taskId)
          const datePart = key.split(':')[1] ?? entry.startedAt.slice(0, 10)
          const h = Math.floor(startMin / 60) % 24
          const m = Math.round(startMin % 60)
          const newStartedAt = `${datePart}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
          return {
            entries: {
              ...s.entries,
              [key]: { ...entry, startedAt: newStartedAt, actualSeconds: Math.round(durationMin * 60) },
            },
          }
        }),
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
        const key = s.timerRunningKey
        const entry = s.entries[key]
        if (entry) {
          const extra = Math.floor((Date.now() - s.timerStartedAt) / 1000)
          const updated = { ...entry, actualSeconds: entry.actualSeconds + extra }
          set((st) => ({
            entries: { ...st.entries, [key]: updated },
            timerRunningKey: null,
            timerStartedAt: null,
          }))
          // Fire-and-forget sync to Checkvist API
          const name = s.taskNames?.[key] ?? `Task ${entry.taskId}`
          useSystemLog.getState().syncSession(key, name, updated).catch(() => {})
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
            const updated = { ...entry, actualSeconds: entry.actualSeconds + extra, completedAt: new Date().toISOString() }
            set((st) => ({
              entries: { ...st.entries, [key]: updated },
              timerRunningKey: null,
              timerStartedAt: null,
            }))
            const name = s.taskNames?.[key] ?? `Task ${entry.taskId}`
            useSystemLog.getState().syncSession(key, name, updated).catch(() => {})
            return
          }
        }
        set((st) => {
          const e = st.entries[key]
          if (!e) return st
          const updated = { ...e, completedAt: new Date().toISOString() }
          const name = st.taskNames?.[key] ?? `Task ${e.taskId}`
          useSystemLog.getState().syncSession(key, name, updated).catch(() => {})
          return { entries: { ...st.entries, [key]: updated } }
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
