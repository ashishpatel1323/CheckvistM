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
  const timePart = log.completionTime ? ` time=${log.completionTime}` : ''
  return `${ROUTINE_LOG_PREFIX} ${routineName} | ${log.date} | steps=${log.completedStepIds.join(',')} dur=${log.durationSec}${timePart}`
}

export function decodeCheckin(content: string, systemTaskId: number, parentId: number): CheckinLog | null {
  if (!content.startsWith(ROUTINE_LOG_PREFIX)) return null
  try {
    const dateM = content.match(/\| (\d{4}-\d{2}-\d{2}) \|/)
    const stepsM = content.match(/steps=([^\s|]*)/)
    const durM = content.match(/dur=(\d+)/)

    if (!dateM) return null

    const completedStepIds = stepsM?.[1] ? stepsM[1].split(',').filter(Boolean) : []
    const timeM = content.match(/time=(\d{2}:\d{2})/)

    return {
      routineTaskId: parentId,
      date: dateM[1],
      completedStepIds,
      durationSec: Number(durM?.[1] ?? 0),
      completionTime: timeM?.[1],
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

        if (existingTaskId) {
          await updateTask(systemListId, existingTaskId, { content })
          return existingTaskId
        }

        const created = await createTask(systemListId, { content })
        return created.id
      },

      deleteRoutineDef: async (taskId) => {
        const systemListId = get().systemListId
        if (!systemListId) return
        try {
          await deleteTask(systemListId, taskId)
        } catch (e) {
          console.warn('[RoutineSystem] delete failed:', e)
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
        } catch (e) {
          console.warn('[RoutineSystem] log checkin failed:', e)
        }
      },
    }),
    { name: 'system-routines-meta', storage }
  )
)
