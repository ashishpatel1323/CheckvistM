/**
 * Global sync state — Zustand store (not persisted, rebuilt from queue on startup).
 * Consumed by SyncButton and any component needing global sync visibility.
 */

import { create } from 'zustand'

export type LastSyncStatus = 'success' | 'failed' | null

export interface SyncHistoryItem {
  id: string
  entityType: string
  operation: 'create' | 'update' | 'delete'
  localId: string
  label: string
  syncedAt: number
  status: 'synced' | 'failed'
}

const MAX_HISTORY = 20

interface SyncStateStore {
  pending: number
  syncing: number
  failed: number
  lastSyncStartedAt: number | null
  lastSyncCompletedAt: number | null
  lastSyncStatus: LastSyncStatus
  history: SyncHistoryItem[]

  setSyncing: (syncing: number) => void
  setPending: (pending: number) => void
  setFailed: (failed: number) => void
  markSyncStarted: () => void
  markSyncCompleted: (status: LastSyncStatus) => void
  refreshFromQueue: (pending: number, syncing: number, failed: number) => void
  addHistoryItem: (item: SyncHistoryItem) => void
}

export const useSyncState = create<SyncStateStore>()((set) => ({
  pending: 0,
  syncing: 0,
  failed: 0,
  lastSyncStartedAt: null,
  lastSyncCompletedAt: null,
  lastSyncStatus: null,
  history: [],

  setSyncing: (syncing) => set({ syncing }),
  setPending: (pending) => set({ pending }),
  setFailed: (failed) => set({ failed }),
  markSyncStarted: () => set({ lastSyncStartedAt: Date.now() }),
  markSyncCompleted: (status) => set({ lastSyncCompletedAt: Date.now(), lastSyncStatus: status }),
  refreshFromQueue: (pending, syncing, failed) => set({ pending, syncing, failed }),
  addHistoryItem: (item) =>
    set((s) => ({ history: [...s.history, item].slice(-MAX_HISTORY) })),
}))
