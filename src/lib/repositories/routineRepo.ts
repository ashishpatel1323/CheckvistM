/**
 * Routine repository — wraps useRoutineSystem API calls for the sync engine.
 *
 * The Zustand store (useRoutineSystem) continues to own local state.
 * This repo registers the sync handler so the engine can replay queued operations.
 */

import { registerSyncHandler } from '../sync/syncEngine'
import { enqueue } from '../sync/syncQueue'
import type { SyncQueueItem } from '../sync/syncQueue'

// ─── Sync handler ──────────────────────────────────────────────────────────────
// Imported lazily to avoid circular deps with the Zustand store

registerSyncHandler('routine', async (item: SyncQueueItem) => {
  // Dynamically import to avoid circular dependency at module init time
  const { useRoutineSystem } = await import('@/features/tasks/routines/useRoutineSystem')
  const system = useRoutineSystem.getState()

  const payload = item.payload as {
    operation: 'save' | 'delete'
    defData?: Parameters<typeof system.saveRoutineDef>[0]
    taskId?: number
  }

  if (payload.operation === 'save' && payload.defData) {
    await system.saveRoutineDef(payload.defData, undefined, { fromQueue: true })
  } else if (payload.operation === 'delete' && payload.taskId != null) {
    await system.deleteRoutineDef(payload.taskId, { fromQueue: true })
  }
})

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueRoutineSave(def: unknown): Promise<void> {
  const taskId = (def as { taskId: number }).taskId
  await enqueue('routine', 'update', String(taskId), { operation: 'save', defData: def })
}

export async function enqueueRoutineDelete(taskId: number): Promise<void> {
  await enqueue('routine', 'delete', String(taskId), { operation: 'delete', taskId })
}
