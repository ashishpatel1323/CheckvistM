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
  seed: (key: string, taskId: number, estimateMin: number) => void
  setEstimate: (key: string, min: number) => void
  markStarted: (key: string) => void
  addElapsed: (key: string, seconds: number) => void
  markCompleted: (key: string) => void
  reset: (key: string) => void
}

export function todayKey(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function entryKey(checklistId: number, taskId: number): string {
  return `${checklistId}:${todayKey()}:${taskId}`
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useExecuteLog = create<ExecuteLogStore>()(
  persist(
    (set) => ({
      entries: {},
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
      addElapsed: (key, seconds) =>
        set((s) => {
          const entry = s.entries[key]
          if (!entry) return s
          return { entries: { ...s.entries, [key]: { ...entry, actualSeconds: entry.actualSeconds + seconds } } }
        }),
      markCompleted: (key) =>
        set((s) => {
          const entry = s.entries[key]
          if (!entry) return s
          return { entries: { ...s.entries, [key]: { ...entry, completedAt: new Date().toISOString() } } }
        }),
      reset: (key) =>
        set((s) => {
          const entry = s.entries[key]
          if (!entry) return s
          return {
            entries: {
              ...s.entries,
              [key]: { ...entry, startedAt: null, actualSeconds: 0, completedAt: null },
            },
          }
        }),
    }),
    { name: 'execute-log', storage }
  )
)
