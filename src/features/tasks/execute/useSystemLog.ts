/**
 * useSystemLog — syncs execution log sessions to a hidden Checkvist system list.
 *
 * Structure in Checkvist:
 *   "⚙️ Checkvist System Log"  (one checklist, created on first use)
 *   └── "2026-06-04"           (one parent task per day, due = that date)
 *       └── "[EXLOG] Task name | 09:15–09:45 | 30m | key=cid:date:tid sec=1800"
 *            (one child task per session; human-readable + machine-parseable)
 *
 * Sync happens on pause / complete — not every second.
 * On app load the log view hydrates from the API.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useSyncState } from '@/lib/sync/syncState'
import { refreshCounts } from '@/lib/sync/syncEngine'
import { enqueueSessionSync } from '@/lib/repositories/logRepo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { format, parseISO } from 'date-fns'
import { apiClient } from '@/api/client'
import { fetchChecklists, createChecklist, fetchTasks, createTask, updateTask, deleteTask } from '@/api/endpoints'
import { clientId, clientLabel } from '@/platform/clientIdentity'
import type { ExecuteLogEntry } from './useExecuteLog'

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_LIST_NAME = '⚙️ Checkvist System Log'
const EXLOG_PREFIX = '[EXLOG]'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = parseISO(iso)
  const h = d.getHours() % 12 || 12
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  return `${h}:${m} ${ampm}`
}

function fmtDur(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** Encode a session as Checkvist task content */
function encodeSession(key: string, taskName: string, entry: ExecuteLogEntry): string {
  const start = entry.startedAt ? fmtTime(entry.startedAt) : '?'
  const endIso = entry.completedAt ?? new Date().toISOString()
  const end = fmtTime(endIso)
  const dur = fmtDur(entry.actualSeconds)
  // Human-readable label + machine key at the end.
  // client=<id> cname=<url-encoded friendly label> identify the originating device.
  return `${EXLOG_PREFIX} ${taskName} | ${start}–${end} | ${dur} | key=${key} sec=${entry.actualSeconds} s=${entry.startedAt ?? ''} done=${entry.completedAt ?? ''} client=${clientId()} cname=${encodeURIComponent(clientLabel())}`
}

export interface SyncedSession {
  key: string            // "checklistId:yyyy-MM-dd:taskId"
  taskId: number         // Checkvist task id of the original task
  checklistId: number
  taskName: string
  startedAt: string
  actualSeconds: number
  completedAt: string | null
  // The Checkvist system-list task id that stores this session (for updates)
  systemTaskId?: number
  // Identity of the client/device that recorded this session (undefined for legacy entries)
  clientId?: string
  clientLabel?: string
}

/** Parse a session back from Checkvist task content */
function decodeSession(content: string, systemTaskId: number): SyncedSession | null {
  if (!content.startsWith(EXLOG_PREFIX)) return null
  try {
    const keyM = content.match(/key=([\w:.-]+)/)
    const secM = content.match(/sec=(\d+)/)
    const sM = content.match(/s=([^\s|]+)/)
    const doneM = content.match(/done=([^\s|]+)/)
    const clientM = content.match(/client=([\w-]+)/)
    const cnameM = content.match(/cname=([^\s|]+)/)
    // Extract task name from between prefix and first |
    const nameM = content.match(/\[EXLOG\] (.+?) \|/)

    if (!keyM) return null
    const key = keyM[1]
    const parts = key.split(':')
    if (parts.length < 3) return null
    const [checklistId, , taskId] = parts

    let decodedLabel: string | undefined
    if (cnameM?.[1]) {
      try { decodedLabel = decodeURIComponent(cnameM[1]) } catch { decodedLabel = cnameM[1] }
    }

    return {
      key,
      taskId: Number(taskId),
      checklistId: Number(checklistId),
      taskName: nameM?.[1] ?? `Task ${taskId}`,
      startedAt: sM?.[1] ?? '',
      actualSeconds: Number(secM?.[1] ?? 0),
      completedAt: doneM?.[1] && doneM[1] !== 'null' && doneM[1] !== '' ? doneM[1] : null,
      systemTaskId,
      clientId: clientM?.[1],
      clientLabel: decodedLabel,
    }
  } catch {
    return null
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface SystemLogStore {
  /** ID of the "⚙️ Checkvist System Log" checklist, null until first sync */
  systemListId: number | null
  /** Today's date tasks in the system list, keyed by date string */
  dayTaskIds: Record<string, number>
  /** Sessions fetched from the API for the log view, keyed by session key */
  remoteSessions: Record<string, SyncedSession>
  /** System task IDs keyed by session key (for updates) */
  sessionTaskIds: Record<string, number>

  ensureSystemList: () => Promise<number>
  ensureDayTask: (systemListId: number, dateStr: string) => Promise<number>
  syncSession: (key: string, taskName: string, entry: ExecuteLogEntry, opts?: { fromQueue?: boolean }) => Promise<void>
  deleteSession: (key: string) => Promise<void>
  fetchTodaySessions: () => Promise<void>
  /** Manually add a time block (not tied to a task), persists to Checkvist */
  addManualSession: (checklistId: number, dateStr: string, taskName: string, startMinutes: number, durationMin: number) => Promise<void>
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useSystemLog = create<SystemLogStore>()(
  persist(
    (set, get) => ({
      systemListId: null,
      dayTaskIds: {},
      remoteSessions: {},
      sessionTaskIds: {},

      ensureSystemList: async () => {
        const cached = get().systemListId
        if (cached) return cached

        const lists = await fetchChecklists()
        const existing = lists.find((l) => l.name === SYSTEM_LIST_NAME)
        if (existing) {
          set({ systemListId: existing.id })
          return existing.id
        }

        const created = await createChecklist(SYSTEM_LIST_NAME)
        set({ systemListId: created.id })
        return created.id
      },

      ensureDayTask: async (systemListId, dateStr) => {
        const cached = get().dayTaskIds[dateStr]
        if (cached) return cached

        // Look for an existing day task in the system list
        const tasks = await fetchTasks(systemListId)
        const existing = tasks.find((t) => t.content === dateStr && t.parent_id === null)
        if (existing) {
          set((s) => ({ dayTaskIds: { ...s.dayTaskIds, [dateStr]: existing.id } }))
          return existing.id
        }

        // Create the day parent task
        const created = await createTask(systemListId, {
          content: dateStr,
          due_date: dateStr.replace(/-/g, '/'),
        })
        set((s) => ({ dayTaskIds: { ...s.dayTaskIds, [dateStr]: created.id } }))
        return created.id
      },

      syncSession: async (key, taskName, entry, opts) => {
        if (!entry.startedAt || entry.actualSeconds < 10) return

        // Optimistic local update so Execute tab sees it immediately without waiting for fetchTodaySessions
        const optimisticSession: SyncedSession = {
          key,
          taskId: entry.taskId,
          checklistId: Number(key.split(':')[0]),
          taskName,
          startedAt: entry.startedAt,
          actualSeconds: entry.actualSeconds,
          completedAt: entry.completedAt,
          clientId: clientId(),
          clientLabel: clientLabel(),
        }
        set((s) => ({ remoteSessions: { ...s.remoteSessions, [key]: optimisticSession } }))

        try {
          const systemListId = await get().ensureSystemList()
          const dateStr = key.split(':')[1]
          const dayTaskId = await get().ensureDayTask(systemListId, dateStr)
          const content = encodeSession(key, taskName, entry)

          const existingSystemTaskId = get().sessionTaskIds[key]
          if (existingSystemTaskId) {
            await updateTask(systemListId, existingSystemTaskId, { content })
          } else {
            const created = await createTask(systemListId, { content, parent_id: dayTaskId })
            set((s) => ({
              sessionTaskIds: { ...s.sessionTaskIds, [key]: created.id },
              remoteSessions: { ...s.remoteSessions, [key]: { ...optimisticSession, systemTaskId: created.id } },
            }))
          }
          const mins = Math.round(entry.actualSeconds / 60)
          useSyncState.getState().addHistoryItem({
            id: `session-${key}-${Date.now()}`,
            entityType: 'session',
            operation: existingSystemTaskId ? 'update' : 'create',
            localId: key,
            label: `Session synced · ${taskName} (${mins}m)`,
            syncedAt: Date.now(),
            status: 'synced',
          })
        } catch (e) {
          console.warn('[SystemLog] sync failed:', e)
          useSyncState.getState().addHistoryItem({
            id: `session-${key}-${Date.now()}`,
            entityType: 'session',
            operation: 'create',
            localId: key,
            label: `Session sync failed · ${taskName}`,
            syncedAt: Date.now(),
            status: 'failed',
          })
          if (opts?.fromQueue) throw e
          await enqueueSessionSync(key, taskName, entry)
          refreshCounts()
        }
      },

      deleteSession: async (key) => {
        try {
          const systemTaskId = get().sessionTaskIds[key]
          if (!systemTaskId) {
            // If no systemTaskId, just remove from local state
            set((s) => {
              const { [key]: _, ...rest } = s.remoteSessions
              const { [key]: __, ...taskIds } = s.sessionTaskIds
              return { remoteSessions: rest, sessionTaskIds: taskIds }
            })
            return
          }

          // Get system list ID and delete the task
          const systemListId = await get().ensureSystemList()
          await deleteTask(systemListId, systemTaskId)

          // Remove from local state
          set((s) => {
            const { [key]: _, ...rest } = s.remoteSessions
            const { [key]: __, ...taskIds } = s.sessionTaskIds
            return { remoteSessions: rest, sessionTaskIds: taskIds }
          })
        } catch (e) {
          console.warn('[SystemLog] deleteSession failed:', e)
          throw e
        }
      },

      addManualSession: async (checklistId, dateStr, taskName, startMinutes, durationMin) => {
        const { useExecuteLog } = await import('./useExecuteLog')
        const { hasTimeOverlap } = await import('./useExecuteLog')
        const entries = useExecuteLog.getState().entries

        // Check for overlaps with existing sessions (manual entries don't have a taskId, use 0 as placeholder)
        // Note: Since manual entries are for logging only and not tied to a specific task,
        // we skip overlap checking for manual entries to avoid false positives
        // However, if needed in future, overlap check could be added per-task basis

        try {
          const uid = Date.now().toString(36)
          const key = `${checklistId}:${dateStr}:manual:${uid}`
          // Build ISO start time from dateStr + startMinutes
          const [y, mo, d] = dateStr.split('-').map(Number)
          const startDate = new Date(y, mo - 1, d, Math.floor(startMinutes / 60), Math.round(startMinutes % 60))
          const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000)
          const entry: ExecuteLogEntry = {
            taskId: 0,
            estimateMin: durationMin,
            startedAt: startDate.toISOString(),
            actualSeconds: durationMin * 60,
            completedAt: endDate.toISOString(),
          }
          // Add to local remoteSessions immediately for instant render
          const session: SyncedSession = {
            key,
            taskId: 0,
            checklistId,
            taskName,
            startedAt: startDate.toISOString(),
            actualSeconds: durationMin * 60,
            completedAt: endDate.toISOString(),
            clientId: clientId(),
            clientLabel: clientLabel(),
          }
          set((s) => ({ remoteSessions: { ...s.remoteSessions, [key]: session } }))

          // Sync to Checkvist
          const systemListId = await get().ensureSystemList()
          const dayTaskId = await get().ensureDayTask(systemListId, dateStr)
          const content = `${EXLOG_PREFIX} ${taskName} | ${format(startDate, 'h:mm a')}–${format(endDate, 'h:mm a')} | ${durationMin}m | key=${key} sec=${entry.actualSeconds} s=${entry.startedAt} done=${entry.completedAt} client=${clientId()} cname=${encodeURIComponent(clientLabel())}`
          const created = await createTask(systemListId, { content, parent_id: dayTaskId })
          set((s) => ({ sessionTaskIds: { ...s.sessionTaskIds, [key]: created.id } }))
        } catch (e) {
          console.warn('[SystemLog] addManualSession failed:', e)
        }
      },

      fetchTodaySessions: async () => {
        try {
          // Always resolve the system list — handles fresh browsers with empty localStorage
          const systemListId = await get().ensureSystemList()

          const tasks = await fetchTasks(systemListId)
          const sessions: Record<string, SyncedSession> = {}
          const taskIds: Record<string, number> = { ...get().sessionTaskIds }

          for (const task of tasks) {
            if (!task.content.startsWith(EXLOG_PREFIX)) continue
            const session = decodeSession(task.content, task.id)
            if (session) {
              sessions[session.key] = session
              taskIds[session.key] = task.id
            }
          }

          set({ remoteSessions: sessions, sessionTaskIds: taskIds })
        } catch (e) {
          console.warn('[SystemLog] fetch failed:', e)
        }
      },

    }),
    { name: 'system-log-meta', storage }
  )
)
