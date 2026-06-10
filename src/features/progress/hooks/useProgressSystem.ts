/**
 * useProgressSystem — persists progress trackers and entries to a hidden
 * Checkvist system list, mirroring the useRoutineSystem / useSystemLog pattern.
 *
 * Structure in Checkvist:
 *   "⚙️ Checkvist Progress"  (one checklist, created on first use)
 *   └── "[TRACKER] Red Hearing ||| {JSON meta}"   (one per tracker)
 *       └── "[ENTRY] set|64|2026-05-17|note text"  (one per entry)
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { fetchChecklists, createChecklist, fetchTasks, createTask, updateTask, deleteTask } from '@/api/endpoints'
import type { Tracker, TrackerEntry, TrackerMeta, TrackerEntryMeta, EntryMode } from '../types'
import { computeCurrentValue } from '../lib/replayEngine'
import { format } from 'date-fns'

// ─── Constants ────────────────────────────────────────────────────────────────

const SYSTEM_LIST_NAME = '⚙️ Checkvist Progress'
const TRACKER_PREFIX = '[TRACKER]'
const ENTRY_PREFIX = '[ENTRY]'
const SEP = ' ||| '

// ─── Encoding ─────────────────────────────────────────────────────────────────

export function encodeTracker(name: string, meta: TrackerMeta): string {
  return `${TRACKER_PREFIX} ${name}${SEP}${JSON.stringify(meta)}`
}

export function decodeTracker(content: string, taskId: number, checklistId: number, allTasks: { id: number; content: string; parent_id: number | null; created_at: string; due: string | null }[]): Tracker | null {
  if (!content.startsWith(TRACKER_PREFIX)) return null
  try {
    const rest = content.slice(TRACKER_PREFIX.length + 1)
    const sepIdx = rest.indexOf(SEP)
    if (sepIdx === -1) return null
    const name = rest.slice(0, sepIdx).trim()
    const meta: TrackerMeta = JSON.parse(rest.slice(sepIdx + SEP.length))

    const entries = allTasks
      .filter(t => t.parent_id === taskId)
      .map(t => decodeEntry(t.content, t.id, taskId, t.created_at, t.due))
      .filter((e): e is TrackerEntry => e !== null)

    const currentValue = computeCurrentValue(entries, meta.initialValue, meta.resets)
    const lastEntry = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

    return {
      taskId,
      checklistId,
      name,
      meta,
      currentValue,
      lastUpdatedAt: lastEntry?.createdAt ?? null,
    }
  } catch {
    return null
  }
}

export function encodeEntry(meta: TrackerEntryMeta, date: Date): string {
  const note = meta.note.replace(/\|/g, '\\|')
  // Store full ISO datetime so Day/Week graphs can distinguish same-day entries
  return `${ENTRY_PREFIX} ${meta.mode}|${meta.value}|${date.toISOString()}|${note}`
}

export function decodeEntry(content: string, taskId: number, trackerId: number, createdAt: string, due: string | null): TrackerEntry | null {
  if (!content.startsWith(ENTRY_PREFIX)) return null
  try {
    const rest = content.slice(ENTRY_PREFIX.length + 1)
    const parts = rest.split('|')
    if (parts.length < 3) return null
    const mode = parts[0] as EntryMode
    const value = parseFloat(parts[1])
    // parts[2] is ISO datetime (new) or yyyy-MM-dd (legacy) — both parse correctly
    const isoDatetime = parts[2]
    // Note: ISO contains colons so re-join from part 2 up to the first non-date segment
    // Format: mode|value|<ISO datetime>|note  — ISO datetime is parts[2]+parts[3]+parts[4]
    // (ISO "2026-06-10T14:30:00.000Z" splits on | only, no | in ISO itself — safe)
    const note = parts.slice(3).join('|').replace(/\\\|/g, '|')
    return {
      taskId,
      trackerId,
      meta: { mode, value, note },
      effectiveDate: isoDatetime || due || createdAt,
      createdAt,
    }
  } catch {
    return null
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ProgressSystemStore {
  systemListId: number | null

  ensureSystemList: () => Promise<number>
  loadTrackers: () => Promise<Tracker[]>
  loadEntries: (trackerId: number) => Promise<TrackerEntry[]>
  createTracker: (name: string, meta: TrackerMeta) => Promise<Tracker>
  updateTracker: (taskId: number, name: string, meta: TrackerMeta) => Promise<void>
  deleteTracker: (taskId: number) => Promise<void>
  createEntry: (trackerId: number, meta: TrackerEntryMeta, date: Date) => Promise<TrackerEntry>
  updateEntry: (taskId: number, trackerId: number, meta: TrackerEntryMeta, date: Date) => Promise<void>
  deleteEntry: (taskId: number) => Promise<void>
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useProgressSystem = create<ProgressSystemStore>()(
  persist(
    (set, get) => ({
      systemListId: null,

      ensureSystemList: async () => {
        const cached = get().systemListId
        if (cached) return cached

        const lists = await fetchChecklists()
        const existing = lists.find(l => l.name === SYSTEM_LIST_NAME)
        if (existing) {
          set({ systemListId: existing.id })
          return existing.id
        }
        const created = await createChecklist(SYSTEM_LIST_NAME)
        set({ systemListId: created.id })
        return created.id
      },

      loadTrackers: async () => {
        const listId = await get().ensureSystemList()
        const tasks = await fetchTasks(listId)
        const rootTasks = tasks.filter(t => !t.parent_id && t.content.startsWith(TRACKER_PREFIX))
        return rootTasks
          .map(t => decodeTracker(t.content, t.id, listId, tasks))
          .filter((t): t is Tracker => t !== null)
      },

      loadEntries: async (trackerId) => {
        const listId = await get().ensureSystemList()
        const tasks = await fetchTasks(listId)
        return tasks
          .filter(t => t.parent_id === trackerId && t.content.startsWith(ENTRY_PREFIX))
          .map(t => decodeEntry(t.content, t.id, trackerId, t.created_at, t.due))
          .filter((e): e is TrackerEntry => e !== null)
          .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt))
      },

      createTracker: async (name, meta) => {
        const listId = await get().ensureSystemList()
        const task = await createTask(listId, { content: encodeTracker(name, meta) })
        return {
          taskId: task.id,
          checklistId: listId,
          name,
          meta,
          currentValue: meta.initialValue,
          lastUpdatedAt: null,
        }
      },

      updateTracker: async (taskId, name, meta) => {
        const listId = await get().ensureSystemList()
        await updateTask(listId, taskId, { content: encodeTracker(name, meta) })
      },

      deleteTracker: async (taskId) => {
        const listId = await get().ensureSystemList()
        await deleteTask(listId, taskId)
      },

      createEntry: async (trackerId, meta, date) => {
        const listId = await get().ensureSystemList()
        const task = await createTask(listId, {
          content: encodeEntry(meta, date),
          parent_id: trackerId,
          due_date: format(date, 'yyyy/MM/dd'),
        })
        return {
          taskId: task.id,
          trackerId,
          meta,
          effectiveDate: date.toISOString(),
          createdAt: task.created_at,
        }
      },

      updateEntry: async (taskId, trackerId, meta, date) => {
        const listId = await get().ensureSystemList()
        await updateTask(listId, taskId, {
          content: encodeEntry(meta, date),
          due_date: format(date, 'yyyy/MM/dd'),
        })
      },

      deleteEntry: async (taskId) => {
        const listId = await get().ensureSystemList()
        await deleteTask(listId, taskId)
      },
    }),
    {
      name: 'progress-system',
      storage,
      partialize: (s) => ({ systemListId: s.systemListId }),
    }
  )
)
