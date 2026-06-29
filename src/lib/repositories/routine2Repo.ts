/**
 * Routine 2 repository — wraps useRoutine2System per-habit writes for the sync
 * engine. Mirrors routineRepo.ts. The Zustand store owns local state; this repo
 * registers the sync handler so the engine can replay queued habit-log writes.
 */

import { registerSyncHandler } from '../sync/syncEngine'
import { enqueue } from '../sync/syncQueue'
import type { SyncQueueItem } from '../sync/syncQueue'

// ─── Sync handler ──────────────────────────────────────────────────────────────

registerSyncHandler('habitlog', async (item: SyncQueueItem) => {
  // Dynamically import to avoid circular dependency at module init time
  const { useRoutine2System } = await import('@/features/tasks/routines2/useRoutine2System')
  const system = useRoutine2System.getState()

  const payload = item.payload as {
    history: Parameters<typeof system.saveHabitLog>[0]
    routineName: string
  }

  if (payload) {
    await system.saveHabitLog(payload.history, payload.routineName, { fromQueue: true })
  }
})

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueHabitLog(history: unknown, routineName: string): Promise<void> {
  const habitId = (history as { habitId: string }).habitId ?? String(Date.now())
  await enqueue('habitlog', 'update', habitId, { history, routineName })
}
