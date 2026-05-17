import type { CheckvistTask, CheckvistChecklist } from '@/api/types'
import { dbGetByIndex, dbGetAll, dbPutAll } from './db'

export const getCachedTasks = (checklistId: number): Promise<CheckvistTask[]> =>
  dbGetByIndex<CheckvistTask>('tasks', 'checklist_id', checklistId)

export const getCachedLists = (): Promise<CheckvistChecklist[]> =>
  dbGetAll<CheckvistChecklist>('lists')

export const cacheTasks = (tasks: CheckvistTask[]): Promise<void> =>
  dbPutAll('tasks', tasks)

export const cacheLists = (lists: CheckvistChecklist[]): Promise<void> =>
  dbPutAll('lists', lists)
