import { Platform } from 'react-native'
import type { CheckvistTask, CheckvistChecklist } from '@/api/types'

// Web: IndexedDB via db.ts
// Native: AsyncStorage (JSON-serialized)

async function getNativeStorage() {
  const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage')
  return AsyncStorage
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function getCachedTasks(checklistId: number): Promise<CheckvistTask[]> {
  if (Platform.OS === 'web') {
    const { dbGetByIndex } = await import('./db')
    return dbGetByIndex<CheckvistTask>('tasks', 'checklist_id', checklistId)
  }
  const store = await getNativeStorage()
  const raw = await store.getItem(`tasks_${checklistId}`)
  return raw ? (JSON.parse(raw) as CheckvistTask[]) : []
}

export async function cacheTasks(tasks: CheckvistTask[]): Promise<void> {
  if (Platform.OS === 'web') {
    const { dbPutAll } = await import('./db')
    return dbPutAll('tasks', tasks)
  }
  // Group by checklist_id and store each group separately
  const byChecklist: Record<number, CheckvistTask[]> = {}
  for (const t of tasks) {
    const id = t.checklist_id ?? 0
    if (!byChecklist[id]) byChecklist[id] = []
    byChecklist[id].push(t)
  }
  const store = await getNativeStorage()
  await Promise.all(
    Object.entries(byChecklist).map(([id, ts]) =>
      store.setItem(`tasks_${id}`, JSON.stringify(ts))
    )
  )
}

// ─── Lists ───────────────────────────────────────────────────────────────────

export async function getCachedLists(): Promise<CheckvistChecklist[]> {
  if (Platform.OS === 'web') {
    const { dbGetAll } = await import('./db')
    return dbGetAll<CheckvistChecklist>('lists')
  }
  const store = await getNativeStorage()
  const raw = await store.getItem('checklists')
  return raw ? (JSON.parse(raw) as CheckvistChecklist[]) : []
}

export async function cacheLists(lists: CheckvistChecklist[]): Promise<void> {
  if (Platform.OS === 'web') {
    const { dbPutAll } = await import('./db')
    return dbPutAll('lists', lists)
  }
  const store = await getNativeStorage()
  await store.setItem('checklists', JSON.stringify(lists))
}
