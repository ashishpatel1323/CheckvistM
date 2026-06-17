import { registerSyncHandler, type SyncHandler } from './syncEngine'
import { apiClient } from '@/api/client'
import type { SyncQueueItem } from './syncQueue'
import type { CreateTaskPayload, UpdateTaskPayload } from '@/api/types'

/**
 * Register sync handlers for all task operations.
 * Call this once on app initialization.
 */
export function registerTaskHandlers(): void {
  registerSyncHandler('task', handleTaskSync)
}

async function handleTaskSync(item: SyncQueueItem): Promise<void> {
  // Extract checklistId from localId (encoded as "checklistId:taskId")
  const [checklistIdStr, taskIdStr] = item.localId.split(':')
  const checklistId = parseInt(checklistIdStr, 10)
  const taskId = parseInt(taskIdStr, 10)

  const payload = item.payload as CreateTaskPayload | UpdateTaskPayload | undefined

  switch (item.operation) {
    case 'create':
      if (!payload) throw new Error('Missing payload for create')
      await apiClient.post(
        `/checklists/${checklistId}/tasks.json`,
        { task: payload }
      )
      break

    case 'update':
      if (!payload) throw new Error('Missing payload for update')
      await apiClient.put(
        `/checklists/${checklistId}/tasks/${taskId}.json`,
        { task: payload }
      )
      break

    case 'delete':
      await apiClient.delete(
        `/checklists/${checklistId}/tasks/${taskId}.json`
      )
      break

    default:
      throw new Error(`Unknown operation: ${item.operation}`)
  }
}
