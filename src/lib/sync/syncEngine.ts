/**
 * Sync engine — processes the queue sequentially.
 * Each entity type registers a handler that performs the actual API call.
 * On success: removes item from queue, records in history.
 * On failure: increments retry count, moves to back of queue, records in history.
 */

import {
  dequeue,
  remove,
  incrementRetry,
  hasPending,
  getAll,
  type SyncQueueItem,
} from './syncQueue'
import { useSyncState, type SyncHistoryItem } from './syncState'

export type SyncHandler = (item: SyncQueueItem) => Promise<void>

const MAX_RETRIES = 3

const handlers: Map<string, SyncHandler> = new Map()

let running = false

/** Register a handler for a given entityType. Called by each repository on init. */
export function registerSyncHandler(entityType: string, handler: SyncHandler): void {
  handlers.set(entityType, handler)
}

export function isRunning(): boolean {
  return running
}

function humanLabel(item: SyncQueueItem): string {
  const map: Record<string, Record<string, string>> = {
    task:    { create: 'Task created',        update: 'Task updated',       delete: 'Task deleted' },
    routine: { create: 'Routine created',     update: 'Routine saved',      delete: 'Routine deleted' },
    checkin: { create: 'Routine check-in synced', update: 'Check-in updated', delete: 'Check-in deleted' },
    session: { create: 'Log session synced',  update: 'Log session updated', delete: 'Log session deleted' },
    tracker: { create: 'Tracker created',     update: 'Tracker updated',    delete: 'Tracker deleted' },
    entry:   { create: 'Progress entry added', update: 'Progress entry updated', delete: 'Progress entry deleted' },
    map:     { create: 'Map item synced',      update: 'Map item updated',   delete: 'Map item deleted' },
  }
  return map[item.entityType]?.[item.operation] ?? `${item.entityType} ${item.operation}`
}

function recordHistory(item: SyncQueueItem, status: 'synced' | 'failed'): void {
  const historyItem: SyncHistoryItem = {
    id: item.id,
    entityType: item.entityType,
    operation: item.operation,
    localId: item.localId,
    label: humanLabel(item),
    syncedAt: Date.now(),
    status,
  }
  useSyncState.getState().addHistoryItem(historyItem)
}

function refreshCounts(): void {
  const all = getAll()
  useSyncState.getState().refreshFromQueue(
    all.length,
    running ? 1 : 0,
    all.filter((i) => i.retryCount >= MAX_RETRIES).length,
  )
}

/** Run the queue to completion. Noop if already running. */
export async function run(): Promise<void> {
  if (running) return
  if (!hasPending()) return

  running = true
  useSyncState.getState().markSyncStarted()
  useSyncState.getState().setSyncing(1)
  let anyFailed = false

  try {
    while (hasPending()) {
      const item = dequeue()
      if (!item) break

      if (item.retryCount >= MAX_RETRIES) {
        anyFailed = true
        break
      }

      const handler = handlers.get(item.entityType)
      if (!handler) {
        await incrementRetry(item.id)
        continue
      }

      try {
        await handler(item)
        await remove(item.id)
        recordHistory(item, 'synced')
      } catch (err) {
        console.warn(`[syncEngine] Failed to sync ${item.entityType}:${item.localId}`, err)
        await incrementRetry(item.id)
        recordHistory(item, 'failed')
        anyFailed = true
      }
    }
  } finally {
    running = false
    useSyncState.getState().setSyncing(0)
    useSyncState.getState().markSyncCompleted(anyFailed ? 'failed' : 'success')
    refreshCounts()
  }
}
