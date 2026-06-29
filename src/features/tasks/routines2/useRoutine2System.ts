/**
 * useRoutine2System — per-HABIT persistence for the Routine 2 tab.
 *
 * Routine definitions are SHARED with Routine 1 (the same hidden
 * "⚙️ Checkvist Routines" list and the same `[ROUTINE_DEF]` tasks). Only the
 * completion records differ: instead of one `[ROUTINE_LOG]` task per routine per
 * date, Routine 2 stores ONE `[HABIT_LOG]` task per habit, encoding that single
 * habit's own dated history. Editing one habit can only ever rewrite that
 * habit's task — sibling habits are never touched.
 *
 * Structure in Checkvist (same list as Routine 1):
 *   "⚙️ Checkvist Routines"
 *   ├── "[ROUTINE_DEF] Morning Routine ||| {JSON config}"   (shared with Routine 1)
 *   │   ├── "[ROUTINE_LOG] …"                                (Routine 1 — ignored here)
 *   │   └── "[HABIT_LOG] <routineId>:<habitId> ||| {JSON}"   (Routine 2 — one per habit)
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { fetchChecklists, createChecklist, fetchTasks, createTask, updateTask, deleteTask } from '@/api/endpoints'
import type { RoutineDef } from '../routines/routineTypes'
import { decodeRoutineDef } from '../routines/useRoutineSystem'
import { useSyncState } from '@/lib/sync/syncState'
import { refreshCounts } from '@/lib/sync/syncEngine'
import { enqueueHabitLog } from '@/lib/repositories/routine2Repo'

/** Options passed to direct-write store methods. `fromQueue` marks a replay by syncEngine. */
interface SyncWriteOpts {
  /** True when invoked by the queue handler — rethrow on failure, do NOT re-enqueue. */
  fromQueue?: boolean
}

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * A single habit's complete completion history (date-keyed), the source of truth.
 * Keyed by `habitId` ALONE — routine membership lives in the RoutineDef.steps
 * array, so a habit can be re-tagged to another routine without losing history.
 */
export interface HabitHistory {
  habitId: string
  /** Dates (YYYY-MM-DD) the habit was marked done */
  done: string[]
  /** Dates (YYYY-MM-DD) the habit was explicitly marked failed */
  failed: string[]
  /** date → HH:MM (24h) wall-clock time the habit was marked done that day */
  times: Record<string, string>
  /** Checkvist task id backing this habit's log, once created */
  systemTaskId?: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_LIST_NAME = '⚙️ Checkvist Routines'
const ROUTINE_DEF_PREFIX = '[ROUTINE_DEF]'
const HABIT_LOG_PREFIX = '[HABIT_LOG]'
const SEP = ' ||| '

// ─── Encoding / Decoding ──────────────────────────────────────────────────────

interface HabitLogPayload {
  v: number
  done: string[]
  failed: string[]
  times: Record<string, string>
}

export function encodeHabitLog(h: Omit<HabitHistory, 'systemTaskId'>): string {
  const payload: HabitLogPayload = {
    v: 2,
    done: h.done,
    failed: h.failed,
    times: h.times,
  }
  return `${HABIT_LOG_PREFIX} ${h.habitId}${SEP}${JSON.stringify(payload)}`
}

export function decodeHabitLog(content: string, systemTaskId: number): HabitHistory | null {
  if (!content.startsWith(HABIT_LOG_PREFIX)) return null
  try {
    const rest = content.slice(HABIT_LOG_PREFIX.length + 1)
    const sepIdx = rest.indexOf(SEP)
    if (sepIdx === -1) return null
    let habitId = rest.slice(0, sepIdx).trim()
    // Back-compat: v1 keys were "<routineTaskId>:<habitId>" — take the habit id.
    const colonIdx = habitId.indexOf(':')
    if (colonIdx !== -1) habitId = habitId.slice(colonIdx + 1)
    if (!habitId) return null
    const json: HabitLogPayload = JSON.parse(rest.slice(sepIdx + SEP.length))
    return {
      habitId,
      done: Array.isArray(json.done) ? json.done : [],
      failed: Array.isArray(json.failed) ? json.failed : [],
      times: json.times && typeof json.times === 'object' ? json.times : {},
      systemTaskId,
    }
  } catch {
    return null
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface Routine2SystemStore {
  systemListId: number | null
  /** habitId → habit-log system task ID */
  habitLogTaskIds: Record<string, number>

  ensureSystemList: () => Promise<number>
  fetchAll: () => Promise<{ routines: RoutineDef[]; historyById: Record<string, HabitHistory> }>
  saveHabitLog: (history: HabitHistory, routineName: string, opts?: SyncWriteOpts) => Promise<void>
  deleteHabitLog: (habitId: string, opts?: SyncWriteOpts) => Promise<void>
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useRoutine2System = create<Routine2SystemStore>()(
  persist(
    (set, get) => ({
      systemListId: null,
      habitLogTaskIds: {},

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

      fetchAll: async () => {
        const systemListId = await get().ensureSystemList()
        const tasks = await fetchTasks(systemListId)

        const routines: RoutineDef[] = []
        const historyById: Record<string, HabitHistory> = {}
        const newHabitLogTaskIds: Record<string, number> = {}

        for (const task of tasks) {
          if (task.content.startsWith(ROUTINE_DEF_PREFIX) && !task.parent_id) {
            const def = decodeRoutineDef(task.content, task.id)
            if (def) routines.push(def)
          } else if (task.content.startsWith(HABIT_LOG_PREFIX)) {
            const h = decodeHabitLog(task.content, task.id)
            if (h) {
              historyById[h.habitId] = h
              newHabitLogTaskIds[h.habitId] = task.id
            }
          }
        }

        set((s) => ({ habitLogTaskIds: { ...s.habitLogTaskIds, ...newHabitLogTaskIds } }))
        return { routines, historyById }
      },

      saveHabitLog: async (history, routineName, opts) => {
        try {
          const systemListId = await get().ensureSystemList()
          const content = encodeHabitLog(history)
          const key = history.habitId
          const existingId = history.systemTaskId ?? get().habitLogTaskIds[key]

          if (existingId) {
            await updateTask(systemListId, existingId, { content })
          } else {
            // Created at root (no parent_id): membership lives in RoutineDef.steps,
            // so moving a habit between routines never re-parents this task.
            const created = await createTask(systemListId, { content })
            set((s) => ({ habitLogTaskIds: { ...s.habitLogTaskIds, [key]: created.id } }))
          }
          useSyncState.getState().addHistoryItem({
            id: `habitlog-${key}-${Date.now()}`,
            entityType: 'habitlog',
            operation: existingId ? 'update' : 'create',
            localId: key,
            label: `Habit synced · ${routineName} (${history.done.length} done)`,
            syncedAt: Date.now(),
            status: 'synced',
          })
        } catch (e) {
          console.warn('[Routine2System] save habit log failed:', e)
          useSyncState.getState().addHistoryItem({
            id: `habitlog-err-${Date.now()}`,
            entityType: 'habitlog',
            operation: 'create',
            localId: history.habitId,
            label: `Habit sync failed · ${routineName}`,
            syncedAt: Date.now(),
            status: 'failed',
          })
          if (opts?.fromQueue) throw e
          await enqueueHabitLog(history, routineName)
          refreshCounts()
        }
      },

      deleteHabitLog: async (habitId, opts) => {
        const systemListId = get().systemListId
        const taskId = get().habitLogTaskIds[habitId]
        if (!systemListId || !taskId) return
        try {
          await deleteTask(systemListId, taskId)
          set((s) => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [habitId]: _removed, ...rest } = s.habitLogTaskIds
            return { habitLogTaskIds: rest }
          })
        } catch (e) {
          console.warn('[Routine2System] delete habit log failed:', e)
          if (opts?.fromQueue) throw e
        }
      },
    }),
    { name: 'system-routines2-meta', storage }
  )
)
