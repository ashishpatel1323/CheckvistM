/**
 * Task repository — single point of contact for task writes.
 *
 * UI continues to use useTasksQuery / useCreateTask etc. (React Query hooks) for
 * optimistic updates.  This repo handles the *sync engine* side: when the engine
 * processes a queued task operation it calls the endpoints directly and then
 * invalidates the React Query cache so the UI stays fresh.
 *
 * Sync handler is registered once at module load time.
 */

import { createTask, updateTask, closeTask, deleteTask } from '@/api/endpoints'
import type { CreateTaskPayload, UpdateTaskPayload } from '@/api/types'
import { queryClient } from '@/queryClient'
import { tasksQueryKey } from '@/features/tasks/list/useTasksQuery'
import { enqueue } from '../sync/syncQueue'
import { registerSyncHandler } from '../sync/syncEngine'
import type { SyncQueueItem } from '../sync/syncQueue'

// ─── Sync handler ──────────────────────────────────────────────────────────────

registerSyncHandler('task', async (item: SyncQueueItem) => {
  const { operation, payload } = item as {
    operation: 'create' | 'update' | 'delete'
    payload: { checklistId: number; taskId?: number; data?: CreateTaskPayload | UpdateTaskPayload }
  }
  const p = payload as { checklistId: number; taskId?: number; data?: Record<string, unknown> }

  if (operation === 'create') {
    await createTask(p.checklistId, p.data as unknown as CreateTaskPayload)
  } else if (operation === 'update') {
    await updateTask(p.checklistId, p.taskId!, p.data as unknown as UpdateTaskPayload)
  } else if (operation === 'delete') {
    await deleteTask(p.checklistId, p.taskId!)
  }

  // Refresh the React Query cache for this checklist
  await queryClient.invalidateQueries({ queryKey: tasksQueryKey(p.checklistId) })
})

// ─── Public API (called when UI wants to enqueue a sync operation explicitly) ──

/** Enqueue a task create for sync. Used when offline and React Query mutation will handle
 *  the optimistic update, but we want explicit sync state tracking. */
export async function enqueueTaskCreate(checklistId: number, data: CreateTaskPayload): Promise<void> {
  await enqueue('task', 'create', `${checklistId}:new:${Date.now()}`, { checklistId, data })
}

export async function enqueueTaskUpdate(checklistId: number, taskId: number, data: UpdateTaskPayload): Promise<void> {
  await enqueue('task', 'update', `${checklistId}:${taskId}`, { checklistId, taskId, data })
}

export async function enqueueTaskDelete(checklistId: number, taskId: number): Promise<void> {
  await enqueue('task', 'delete', `${checklistId}:${taskId}`, { checklistId, taskId })
}

export async function enqueueTaskClose(checklistId: number, taskId: number): Promise<void> {
  await enqueue('task', 'update', `${checklistId}:${taskId}:close`, { checklistId, taskId, data: { status: 1 } })
}

// Re-export close for the sync engine handler (maps to updateTask with status=1)
export { closeTask }
