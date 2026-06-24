/**
 * Log repository — wraps useSystemLog API calls for the sync engine.
 * Execution sessions are persisted locally by useExecuteLog (Zustand),
 * and synced to the hidden "⚙️ Checkvist System Log" checklist via useSystemLog.
 */

import { registerSyncHandler } from '../sync/syncEngine'
import { enqueue } from '../sync/syncQueue'
import type { SyncQueueItem } from '../sync/syncQueue'

// ─── Sync handler ──────────────────────────────────────────────────────────────

registerSyncHandler('session', async (item: SyncQueueItem) => {
  const { useSystemLog } = await import('@/features/tasks/execute/useSystemLog')
  const system = useSystemLog.getState()

  const payload = item.payload as {
    sessionKey: string
    taskName: string
    entry: Parameters<typeof system.syncSession>[2]
  }

  await system.syncSession(payload.sessionKey, payload.taskName, payload.entry, { fromQueue: true })
})

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueSessionSync(
  sessionKey: string,
  taskName: string,
  entry: unknown,
): Promise<void> {
  await enqueue('session', 'create', sessionKey, { sessionKey, taskName, entry })
}
