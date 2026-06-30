/**
 * useRoutineSystem — persists routine DEFINITIONS to a hidden Checkvist system
 * list, mirroring the useSystemLog pattern. (Completion logging is per-habit and
 * lives in useRoutine2System; this store owns only the [ROUTINE_DEF] tasks.)
 *
 * Structure in Checkvist:
 *   "⚙️ Checkvist Routines"  (one checklist, created on first use)
 *   └── "[ROUTINE_DEF] Morning Routine ||| {JSON config}"  (one per routine)
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { fetchChecklists, createChecklist, createTask, updateTask, deleteTask } from '@/api/endpoints'
import type { RoutineDef, RoutineColor, RoutineStep } from './routineTypes'
import { useSyncState } from '@/lib/sync/syncState'
import { refreshCounts } from '@/lib/sync/syncEngine'
import { enqueueRoutineSave, enqueueRoutineDelete } from '@/lib/repositories/routineRepo'

/** Options passed to direct-write store methods. `fromQueue` marks a replay by syncEngine. */
interface SyncWriteOpts {
  /** True when invoked by the queue handler — rethrow on failure, do NOT re-enqueue. */
  fromQueue?: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_LIST_NAME = '⚙️ Checkvist Routines'
const ROUTINE_DEF_PREFIX = '[ROUTINE_DEF]'
const DEF_SEP = ' ||| '

// ─── Encoding / Decoding ──────────────────────────────────────────────────────

interface DefPayload {
  v: number
  steps: RoutineStep[]
  trigger: string
  color: RoutineColor
}

export function encodeRoutineDef(def: Omit<RoutineDef, 'taskId'>): string {
  const payload: DefPayload = {
    v: 3,
    steps: def.steps,
    trigger: def.trigger,
    color: def.color,
  }
  return `${ROUTINE_DEF_PREFIX} ${def.name}${DEF_SEP}${JSON.stringify(payload)}`
}

export function decodeRoutineDef(content: string, taskId: number): RoutineDef | null {
  if (!content.startsWith(ROUTINE_DEF_PREFIX)) return null
  try {
    const rest = content.slice(ROUTINE_DEF_PREFIX.length + 1)
    const sepIdx = rest.indexOf(DEF_SEP)
    if (sepIdx === -1) return null
    const name = rest.slice(0, sepIdx).trim()
    const json: DefPayload = JSON.parse(rest.slice(sepIdx + DEF_SEP.length))
    const rawSteps: RoutineStep[] = (json.steps ?? []).map((s: RoutineStep) => ({
      ...s,
      scheduledDays: s.scheduledDays ?? [],
    }))
    return {
      taskId,
      name,
      trigger: json.trigger ?? '',
      color: json.color ?? 'blue',
      steps: rawSteps,
    }
  } catch {
    return null
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface RoutineSystemStore {
  systemListId: number | null

  ensureSystemList: () => Promise<number>
  saveRoutineDef: (def: Omit<RoutineDef, 'taskId'>, existingTaskId?: number, opts?: SyncWriteOpts) => Promise<number>
  deleteRoutineDef: (taskId: number, opts?: SyncWriteOpts) => Promise<void>
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useRoutineSystem = create<RoutineSystemStore>()(
  persist(
    (set, get) => ({
      systemListId: null,

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

      saveRoutineDef: async (def, existingTaskId, opts) => {
        const systemListId = await get().ensureSystemList()
        const content = encodeRoutineDef(def)
        const isUpdate = !!existingTaskId
        try {
          if (isUpdate) {
            await updateTask(systemListId, existingTaskId!, { content })
          } else {
            const created = await createTask(systemListId, { content })
            existingTaskId = created.id
          }
          useSyncState.getState().addHistoryItem({
            id: `routine-${existingTaskId}-${Date.now()}`,
            entityType: 'routine',
            operation: isUpdate ? 'update' : 'create',
            localId: String(existingTaskId),
            label: `Routine ${isUpdate ? 'updated' : 'created'} · ${def.name}`,
            syncedAt: Date.now(),
            status: 'synced',
          })
          return existingTaskId!
        } catch (e) {
          useSyncState.getState().addHistoryItem({
            id: `routine-err-${Date.now()}`,
            entityType: 'routine',
            operation: isUpdate ? 'update' : 'create',
            localId: String(existingTaskId ?? 0),
            label: `Routine save failed · ${def.name}`,
            syncedAt: Date.now(),
            status: 'failed',
          })
          // UI path: queue for auto-retry on reconnect. Queue replay path: let the
          // engine own retry/counts (don't re-enqueue), just surface the error.
          if (!opts?.fromQueue) {
            await enqueueRoutineSave({ ...def, taskId: existingTaskId ?? 0 })
            refreshCounts()
          }
          throw e
        }
      },

      deleteRoutineDef: async (taskId, opts) => {
        const systemListId = get().systemListId
        if (!systemListId) return
        try {
          await deleteTask(systemListId, taskId)
          useSyncState.getState().addHistoryItem({
            id: `routine-del-${taskId}-${Date.now()}`,
            entityType: 'routine',
            operation: 'delete',
            localId: String(taskId),
            label: 'Routine deleted',
            syncedAt: Date.now(),
            status: 'synced',
          })
        } catch (e) {
          console.warn('[RoutineSystem] delete failed:', e)
          useSyncState.getState().addHistoryItem({
            id: `routine-del-err-${taskId}-${Date.now()}`,
            entityType: 'routine',
            operation: 'delete',
            localId: String(taskId),
            label: 'Routine delete failed',
            syncedAt: Date.now(),
            status: 'failed',
          })
          if (opts?.fromQueue) throw e
          await enqueueRoutineDelete(taskId)
          refreshCounts()
        }
      },
    }),
    { name: 'system-routines-meta', storage }
  )
)
