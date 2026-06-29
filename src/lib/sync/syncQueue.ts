/**
 * Persistent sync queue for local-first writes.
 * Items survive app restart via platform storage.
 * The queue is processed sequentially by syncEngine.
 */

import { storageGet, storageSet, storageRemove } from '@/platform/storage'

const STORAGE_KEY = 'sync_queue'

export type SyncOperation = 'create' | 'update' | 'delete'

export interface SyncQueueItem {
  id: string               // unique queue entry id
  entityType: string       // 'task' | 'routine' | 'checkin' | 'habitlog' | 'tracker' | 'entry' | 'session'
  operation: SyncOperation
  localId: string          // local entity id
  payload: unknown
  createdAt: number
  retryCount: number
}

// In-memory queue (hydrated from storage on restore)
let queue: SyncQueueItem[] = []

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function persist(): Promise<void> {
  await storageSet(STORAGE_KEY, JSON.stringify(queue))
}

export async function restoreQueue(): Promise<void> {
  const raw = await storageGet(STORAGE_KEY)
  if (raw) {
    try {
      queue = JSON.parse(raw) as SyncQueueItem[]
    } catch {
      queue = []
    }
  }
}

export async function enqueue(
  entityType: string,
  operation: SyncOperation,
  localId: string,
  payload: unknown
): Promise<SyncQueueItem> {
  // Deduplicate: if an item for this entityType+localId already exists in the queue,
  // update it in place rather than adding a duplicate.
  const existing = queue.findIndex(
    (item) => item.entityType === entityType && item.localId === localId && item.operation !== 'delete'
  )

  if (existing >= 0 && operation === 'update') {
    queue[existing] = { ...queue[existing], payload, retryCount: 0 }
    await persist()
    return queue[existing]
  }

  const item: SyncQueueItem = {
    id: generateId(),
    entityType,
    operation,
    localId,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
  }
  queue.push(item)
  await persist()
  return item
}

export function dequeue(): SyncQueueItem | undefined {
  return queue[0]
}

export function getAll(): SyncQueueItem[] {
  return [...queue]
}

export function hasPending(): boolean {
  return queue.length > 0
}

export async function remove(id: string): Promise<void> {
  queue = queue.filter((item) => item.id !== id)
  await persist()
}

export async function incrementRetry(id: string): Promise<void> {
  const item = queue.find((i) => i.id === id)
  if (item) {
    // Move to back of queue so other items can proceed
    queue = queue.filter((i) => i.id !== id)
    item.retryCount += 1
    queue.push(item)
    await persist()
  }
}

export async function clearQueue(): Promise<void> {
  queue = []
  await storageRemove(STORAGE_KEY)
}
