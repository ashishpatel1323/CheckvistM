/**
 * useRoutineSystem — persists routine definitions and daily check-ins to a
 * hidden Checkvist system list, mirroring the useSystemLog pattern.
 *
 * Structure in Checkvist:
 *   "⚙️ Checkvist Routines"  (one checklist, created on first use)
 *   └── "[ROUTINE_DEF] Morning Routine ||| {JSON config}"  (one per routine)
 *       └── "[ROUTINE_LOG] Morning Routine | 2026-06-06 | done=true steps=id1 skipped= dur=1320"
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { fetchChecklists, createChecklist, fetchTasks, createTask, updateTask, deleteTask } from '@/api/endpoints'
import type { RoutineDef, CheckinLog, RoutineColor, RoutineStep } from './routineTypes'
import { useSyncState } from '@/lib/sync/syncState'

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_LIST_NAME = '⚙️ Checkvist Routines'
const ROUTINE_DEF_PREFIX = '[ROUTINE_DEF]'
const ROUTINE_LOG_PREFIX = '[ROUTINE_LOG]'
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

export function encodeCheckin(routineName: string, log: Omit<CheckinLog, 'systemTaskId'>): string {
  const stimes = log.stepCompletionTimes
  const stimesPart = stimes && Object.keys(stimes).length > 0
    ? ` stimes=${Object.entries(stimes).map(([id, t]) => `${id}@${t}`).join(',')}`
    : ''
  return `${ROUTINE_LOG_PREFIX} ${routineName} | ${log.date} | steps=${log.completedStepIds.join(',')} dur=${log.durationSec}${stimesPart}`
}

export function decodeCheckin(content: string, systemTaskId: number, parentId: number): CheckinLog | null {
  if (!content.startsWith(ROUTINE_LOG_PREFIX)) return null
  try {
    const dateM = content.match(/\| (\d{4}-\d{2}-\d{2}) \|/)
    const stepsM = content.match(/steps=([^\s|]*)/)
    const durM = content.match(/dur=(\d+)/)
    const stimesM = content.match(/stimes=(\S+)/)

    if (!dateM) return null

    const completedStepIds = stepsM?.[1] ? stepsM[1].split(',').filter(Boolean) : []

    const stepCompletionTimes: Record<string, string> = {}
    if (stimesM?.[1]) {
      for (const pair of stimesM[1].split(',')) {
        const atIdx = pair.lastIndexOf('@')
        if (atIdx > 0) {
          stepCompletionTimes[pair.slice(0, atIdx)] = pair.slice(atIdx + 1)
        }
      }
    }
    // Migrate old single `time=HH:MM` — if no per-step times but an old time= exists,
    // we just drop it (it was incorrectly shared across all steps anyway).

    return {
      routineTaskId: parentId,
      date: dateM[1],
      completedStepIds,
      durationSec: Number(durM?.[1] ?? 0),
      stepCompletionTimes: Object.keys(stepCompletionTimes).length > 0 ? stepCompletionTimes : undefined,
      systemTaskId,
    }
  } catch {
    return null
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface RoutineSystemStore {
  systemListId: number | null
  /** "routineTaskId:date" → checkin system task ID */
  checkinTaskIds: Record<string, number>

  ensureSystemList: () => Promise<number>
  fetchAll: () => Promise<{ routines: RoutineDef[]; checkinsByRoutine: Record<number, CheckinLog[]> }>
  saveRoutineDef: (def: Omit<RoutineDef, 'taskId'>, existingTaskId?: number) => Promise<number>
  deleteRoutineDef: (taskId: number) => Promise<void>
  logCheckin: (log: CheckinLog, routineName: string) => Promise<void>
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useRoutineSystem = create<RoutineSystemStore>()(
  persist(
    (set, get) => ({
      systemListId: null,
      checkinTaskIds: {},

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
        const checkinsByRoutine: Record<number, CheckinLog[]> = {}
        const newCheckinTaskIds: Record<string, number> = {}

        for (const task of tasks) {
          if (task.content.startsWith(ROUTINE_DEF_PREFIX) && !task.parent_id) {
            const def = decodeRoutineDef(task.content, task.id)
            if (def) routines.push(def)
          } else if (task.content.startsWith(ROUTINE_LOG_PREFIX) && task.parent_id) {
            const log = decodeCheckin(task.content, task.id, task.parent_id)
            if (log) {
              if (!checkinsByRoutine[log.routineTaskId]) checkinsByRoutine[log.routineTaskId] = []
              checkinsByRoutine[log.routineTaskId].push(log)
              newCheckinTaskIds[`${log.routineTaskId}:${log.date}`] = task.id
            }
          }
        }

        set((s) => ({ checkinTaskIds: { ...s.checkinTaskIds, ...newCheckinTaskIds } }))
        return { routines, checkinsByRoutine }
      },

      saveRoutineDef: async (def, existingTaskId) => {
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
          throw e
        }
      },

      deleteRoutineDef: async (taskId) => {
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
        }
      },

      logCheckin: async (log, routineName) => {
        try {
          const systemListId = await get().ensureSystemList()
          const content = encodeCheckin(routineName, log)
          const key = `${log.routineTaskId}:${log.date}`
          const existingId = get().checkinTaskIds[key]

          if (existingId) {
            await updateTask(systemListId, existingId, { content })
          } else {
            const created = await createTask(systemListId, {
              content,
              parent_id: log.routineTaskId,
              due_date: log.date.replace(/-/g, '/'),
            })
            set((s) => ({ checkinTaskIds: { ...s.checkinTaskIds, [key]: created.id } }))
          }
          const doneCount = log.completedStepIds.length
          useSyncState.getState().addHistoryItem({
            id: `checkin-${key}-${Date.now()}`,
            entityType: 'checkin',
            operation: existingId ? 'update' : 'create',
            localId: key,
            label: `Check-in synced · ${routineName} (${doneCount} steps done)`,
            syncedAt: Date.now(),
            status: 'synced',
          })
        } catch (e) {
          console.warn('[RoutineSystem] log checkin failed:', e)
          useSyncState.getState().addHistoryItem({
            id: `checkin-err-${Date.now()}`,
            entityType: 'checkin',
            operation: 'create',
            localId: `${log.routineTaskId}:${log.date}`,
            label: `Check-in sync failed · ${routineName}`,
            syncedAt: Date.now(),
            status: 'failed',
          })
        }
      },
    }),
    { name: 'system-routines-meta', storage }
  )
)
