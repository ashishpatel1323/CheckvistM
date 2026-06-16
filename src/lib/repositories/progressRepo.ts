/**
 * Progress repository — wraps useProgressSystem API calls for the sync engine.
 * Trackers and entries are persisted locally by useProgressSystem (Zustand),
 * and synced to the hidden "⚙️ Checkvist Progress" checklist.
 */

import { registerSyncHandler } from '../sync/syncEngine'
import { enqueue } from '../sync/syncQueue'
import type { SyncQueueItem } from '../sync/syncQueue'

// ─── Sync handler ──────────────────────────────────────────────────────────────

registerSyncHandler('tracker', async (item: SyncQueueItem) => {
  const { useProgressSystem } = await import('@/features/progress/hooks/useProgressSystem')
  const system = useProgressSystem.getState()

  const payload = item.payload as {
    operation: 'create' | 'update' | 'delete'
    taskId?: number
    name?: string
    meta?: unknown
  }

  if (payload.operation === 'create' && payload.name && payload.meta) {
    await system.createTracker(payload.name, payload.meta as Parameters<typeof system.createTracker>[1])
  } else if (payload.operation === 'update' && payload.taskId != null && payload.name && payload.meta) {
    await system.updateTracker(payload.taskId, payload.name, payload.meta as Parameters<typeof system.updateTracker>[2])
  } else if (payload.operation === 'delete' && payload.taskId != null) {
    await system.deleteTracker(payload.taskId)
  }
})

registerSyncHandler('entry', async (item: SyncQueueItem) => {
  const { useProgressSystem } = await import('@/features/progress/hooks/useProgressSystem')
  const system = useProgressSystem.getState()

  const payload = item.payload as {
    operation: 'create' | 'update' | 'delete'
    trackerId: number
    entryTaskId?: number
    meta?: unknown
    date?: string
  }

  if (payload.operation === 'create' && payload.meta) {
    await system.createEntry(
      payload.trackerId,
      payload.meta as Parameters<typeof system.createEntry>[1],
      new Date(payload.date ?? Date.now()),
    )
  } else if (payload.operation === 'update' && payload.entryTaskId != null && payload.meta) {
    // updateEntry signature: (taskId, trackerId, meta, date)
    await system.updateEntry(
      payload.entryTaskId,
      payload.trackerId,
      payload.meta as Parameters<typeof system.updateEntry>[2],
      new Date(payload.date ?? Date.now()),
    )
  } else if (payload.operation === 'delete' && payload.entryTaskId != null) {
    // deleteEntry signature: (taskId)
    await system.deleteEntry(payload.entryTaskId)
  }
})

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueTrackerCreate(name: string, meta: unknown): Promise<void> {
  await enqueue('tracker', 'create', `tracker:new:${Date.now()}`, { operation: 'create', name, meta })
}

export async function enqueueTrackerUpdate(taskId: number, name: string, meta: unknown): Promise<void> {
  await enqueue('tracker', 'update', `tracker:${taskId}`, { operation: 'update', taskId, name, meta })
}

export async function enqueueTrackerDelete(taskId: number): Promise<void> {
  await enqueue('tracker', 'delete', `tracker:${taskId}`, { operation: 'delete', taskId })
}

export async function enqueueEntryCreate(trackerId: number, meta: unknown, date: Date): Promise<void> {
  await enqueue('entry', 'create', `entry:${trackerId}:${date.toISOString()}`, {
    operation: 'create', trackerId, meta, date: date.toISOString(),
  })
}

export async function enqueueEntryUpdate(trackerId: number, entryTaskId: number, meta: unknown, date: Date): Promise<void> {
  await enqueue('entry', 'update', `entry:${entryTaskId}`, {
    operation: 'update', trackerId, entryTaskId, meta, date: date.toISOString(),
  })
}

export async function enqueueEntryDelete(trackerId: number, entryTaskId: number): Promise<void> {
  await enqueue('entry', 'delete', `entry:${entryTaskId}`, { operation: 'delete', trackerId, entryTaskId })
}
