import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { format } from 'date-fns'
import { useSystemLog } from './useSystemLog'
import { useRoutineStore } from '@/features/tasks/routines/useRoutineStore'

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

/** One play→pause block. Key = taskEntryKey + ':' + startMs (unique per block). */
export interface SessionLogEntry {
  taskEntryKey: string   // checklistId:date:taskId
  startedAt: string
  actualSeconds: number
  completedAt: string | null
}

interface ExecuteLogStore {
  entries: Record<string, ExecuteLogEntry>
  /** One entry per play→pause block, keyed by checklistId:date:taskId:startMs */
  sessionLog: Record<string, SessionLogEntry>
  /** Key of the play→pause block currently running */
  currentSessionKey: string | null
  // Wall-clock timestamp (ms) when the current timer started ticking.
  timerStartedAt: number | null
  timerRunningKey: string | null
  // Task display names, set by ExecuteStateProvider for use during API sync
  taskNames: Record<string, string>
  /** Last task opened in Raw View — persisted for refresh recovery */
  lastRawTaskId: number | null
  setLastRawTaskId: (taskId: number | null) => void
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

/** Extract minutes-from-midnight from ISO timestamp. */
function minutesFromMidnight(iso: string): number {
  try {
    const d = new Date(iso)
    return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
  } catch {
    return 0
  }
}

/** Check if a time range overlaps with any existing session for the same task on the same date. */
export function hasTimeOverlap(
  entries: Record<string, ExecuteLogEntry>,
  checklistId: number,
  taskId: number,
  dateStr: string,
  startMin: number,
  durationMin: number,
  excludeKey?: string,
): boolean {
  const newStart = startMin
  const newEnd = startMin + durationMin

  for (const [key, entry] of Object.entries(entries)) {
    if (key === excludeKey) continue
    const parts = key.split(':')
    if (parts.length < 3) continue
    const [cid, date, tid] = parts
    if (cid !== String(checklistId) || date !== dateStr || tid !== String(taskId)) continue
    if (!entry.startedAt) continue

    const existingStart = minutesFromMidnight(entry.startedAt)
    const existingEnd = existingStart + entry.actualSeconds / 60

    // Check if ranges overlap: new range [newStart, newEnd) overlaps with [existingStart, existingEnd)
    if (newStart < existingEnd && newEnd > existingStart) {
      return true
    }
  }

  return false
}

/**
 * Single source-of-truth session summary used by Execute tab, Log tab, and the popup overlay.
 *
 * Algorithm (same as Log tab):
 *  1. Local `entries` (3-part keys) are the live source for in-progress tasks.
 *  2. `remoteSessions` fills in everything else (any key length), deduped against entries.
 *  3. The currently-running session key (4-part) is also deduped so it isn't double-counted.
 */
export function summarizeDaySessions(
  dateStr: string,
  entries: Record<string, ExecuteLogEntry>,
  remoteSessions: Record<string, { startedAt: string; actualSeconds: number }>,
  timerRunningKey: string | null,
  timerStartedAt: number | null,
): { sessionCount: number; sessionTotalSeconds: number } {
  const seen = new Set<string>()
  let sessionCount = 0
  let sessionTotalSeconds = 0

  for (const [key, entry] of Object.entries(entries)) {
    const parts = key.split(':')
    if (parts.length < 3 || parts[1] !== dateStr || !entry.startedAt) continue
    seen.add(key)
    sessionCount++
    sessionTotalSeconds += liveSeconds(entry, timerRunningKey, timerStartedAt, key)
  }

  for (const [key, session] of Object.entries(remoteSessions)) {
    if (seen.has(key) || !session.startedAt) continue
    const parts = key.split(':')
    if (parts.length < 3 || parts[1] !== dateStr) continue
    // For new-format 4-part keys, also dedup against the 3-part task entry key
    const taskEntryKey = parts.slice(0, 3).join(':')
    if (seen.has(taskEntryKey)) continue
    seen.add(key)
    sessionCount++
    sessionTotalSeconds += session.actualSeconds
  }

  return { sessionCount, sessionTotalSeconds }
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useExecuteLog = create<ExecuteLogStore>()(
  persist(
    (set, get) => ({
      entries: {},
      sessionLog: {},
      currentSessionKey: null,
      timerStartedAt: null,
      lastRawTaskId: null,
      setLastRawTaskId: (taskId) => set({ lastRawTaskId: taskId }),
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

          const parts = key.split(':')
          if (parts.length < 3) return s
          const [checklistId, dateStr, taskId] = parts

          // Check for overlaps with other sessions for the same task
          if (hasTimeOverlap(s.entries, Number(checklistId), Number(taskId), dateStr, startMin, durationMin, key)) {
            console.warn('[useExecuteLog] Cannot update: overlapping time range with another session for this task')
            return s
          }

          // Reconstruct startedAt using the date from the key (format: checklistId:yyyy-MM-dd:taskId)
          const datePart = dateStr ?? entry.startedAt.slice(0, 10)
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
        const now = Date.now()
        const nowIso = new Date(now).toISOString()

        // Mutual exclusion: only one global timer runs at a time. Starting a task timer
        // pauses any running routine. (See useRoutineStore for the reverse direction.)
        const rt = useRoutineStore.getState()
        if (rt.activeTimer && rt.activeTimer.pausedAt === null) rt.pauseTimer()

        // Flush any previously running timer first (accumulate into task entry + session entry).
        if (s.timerRunningKey && s.timerStartedAt !== null) {
          const extra = Math.floor((now - s.timerStartedAt) / 1000)
          const prev = s.entries[s.timerRunningKey]
          const prevSession = s.currentSessionKey ? s.sessionLog[s.currentSessionKey] : null
          set((st) => {
            const updates: Partial<ExecuteLogStore> = {}
            if (prev) updates.entries = { ...st.entries, [s.timerRunningKey!]: { ...prev, actualSeconds: prev.actualSeconds + extra } }
            if (prevSession && s.currentSessionKey) {
              updates.sessionLog = { ...st.sessionLog, [s.currentSessionKey]: { ...prevSession, actualSeconds: prevSession.actualSeconds + extra, completedAt: nowIso } }
            }
            return updates
          })
          // Sync the flushed session
          if (s.currentSessionKey) {
            const flushedSession = get().sessionLog[s.currentSessionKey]
            const taskEntry = get().entries[s.timerRunningKey]
            if (flushedSession && taskEntry) {
              const name = s.taskNames?.[s.timerRunningKey] ?? `Task ${taskEntry.taskId}`
              useSystemLog.getState().syncSession(s.currentSessionKey, name, { ...taskEntry, startedAt: flushedSession.startedAt, actualSeconds: flushedSession.actualSeconds, completedAt: flushedSession.completedAt }).catch(() => {})
            }
          }
        }

        // Mark task entry startedAt if first time working on this task today.
        const entry = get().entries[key]
        if (entry && !entry.startedAt) {
          set((st) => ({ entries: { ...st.entries, [key]: { ...st.entries[key], startedAt: nowIso } } }))
        }

        // Create a new session log entry for this play→pause block.
        const sessionKey = `${key}:${now}`
        set((st) => ({
          sessionLog: { ...st.sessionLog, [sessionKey]: { taskEntryKey: key, startedAt: nowIso, actualSeconds: 0, completedAt: null } },
          currentSessionKey: sessionKey,
          timerRunningKey: key,
          timerStartedAt: now,
        }))
      },
      pause: () => {
        const s = get()
        if (!s.timerRunningKey || s.timerStartedAt === null) return
        const key = s.timerRunningKey
        const entry = s.entries[key]
        const now = Date.now()
        const nowIso = new Date(now).toISOString()
        const extra = Math.floor((now - s.timerStartedAt) / 1000)

        if (entry) {
          const updatedEntry = { ...entry, actualSeconds: entry.actualSeconds + extra }
          const sessionKey = s.currentSessionKey
          const prevSession = sessionKey ? s.sessionLog[sessionKey] : null
          const updatedSession = prevSession && sessionKey
            ? { ...prevSession, actualSeconds: prevSession.actualSeconds + extra, completedAt: nowIso }
            : null

          set((st) => ({
            entries: { ...st.entries, [key]: updatedEntry },
            ...(updatedSession && sessionKey ? { sessionLog: { ...st.sessionLog, [sessionKey]: updatedSession } } : {}),
            timerRunningKey: null,
            timerStartedAt: null,
            currentSessionKey: null,
          }))

          // Sync this play→pause block to remote using its unique sessionKey
          if (sessionKey && updatedSession) {
            const name = s.taskNames?.[key] ?? `Task ${entry.taskId}`
            useSystemLog.getState().syncSession(sessionKey, name, { ...updatedEntry, startedAt: updatedSession.startedAt, actualSeconds: updatedSession.actualSeconds, completedAt: updatedSession.completedAt }).catch(() => {})
          }
        } else {
          set({ timerRunningKey: null, timerStartedAt: null, currentSessionKey: null })
        }
      },
      markCompleted: (key) => {
        const s = get()
        const now = Date.now()
        const nowIso = new Date(now).toISOString()
        if (s.timerRunningKey === key && s.timerStartedAt !== null) {
          const entry = s.entries[key]
          if (entry) {
            const extra = Math.floor((now - s.timerStartedAt) / 1000)
            const updatedEntry = { ...entry, actualSeconds: entry.actualSeconds + extra, completedAt: nowIso }
            const sessionKey = s.currentSessionKey
            const prevSession = sessionKey ? s.sessionLog[sessionKey] : null
            const updatedSession = prevSession && sessionKey
              ? { ...prevSession, actualSeconds: prevSession.actualSeconds + extra, completedAt: nowIso }
              : null
            set((st) => ({
              entries: { ...st.entries, [key]: updatedEntry },
              ...(updatedSession && sessionKey ? { sessionLog: { ...st.sessionLog, [sessionKey]: updatedSession } } : {}),
              timerRunningKey: null,
              timerStartedAt: null,
              currentSessionKey: null,
            }))
            const name = s.taskNames?.[key] ?? `Task ${entry.taskId}`
            if (sessionKey && updatedSession) {
              useSystemLog.getState().syncSession(sessionKey, name, { ...updatedEntry, startedAt: updatedSession.startedAt, actualSeconds: updatedSession.actualSeconds, completedAt: updatedSession.completedAt }).catch(() => {})
            }
            return
          }
        }
        set((st) => {
          const e = st.entries[key]
          if (!e) return st
          const updated = { ...e, completedAt: nowIso }
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
          updates.currentSessionKey = null
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
