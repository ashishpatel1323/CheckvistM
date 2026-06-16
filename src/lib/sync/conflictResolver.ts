/**
 * Conflict resolution: latest updatedAt wins.
 * Local dirty/local state is never silently overwritten.
 */

import type { BaseEntity, SyncState } from '@/api/types'

export function resolve<T extends BaseEntity>(local: T, remote: T): T {
  // Never overwrite unsynced local changes
  const unsyncedStates: SyncState[] = ['local', 'dirty', 'syncing']
  if (unsyncedStates.includes(local.syncState)) {
    return local
  }

  // Latest timestamp wins
  if (remote.updatedAt > local.updatedAt) {
    return { ...remote, syncState: 'synced', lastSyncedAt: Date.now() }
  }

  return local
}
