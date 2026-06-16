/**
 * Automatic background sync — runs every 15 minutes when pending items exist.
 * Also triggers on network restore.
 * Must be started after auth is initialized.
 */

import { Platform } from 'react-native'
import { run, isRunning } from './syncEngine'
import { hasPending, restoreQueue } from './syncQueue'

const INTERVAL_MS = 15 * 60 * 1000

let intervalId: ReturnType<typeof setInterval> | null = null

function isOnline(): boolean {
  // navigator.onLine is only available on web; assume online on native
  if (Platform.OS !== 'web') return true
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

async function maybeSyncNow(): Promise<void> {
  if (isRunning()) return
  if (!hasPending()) return
  if (!isOnline()) return
  await run()
}

export async function initAutoSync(): Promise<void> {
  // Restore any persisted queue from previous session
  await restoreQueue()

  // Run immediately if there are pending items
  await maybeSyncNow()

  // Periodic sync every 15 minutes
  if (intervalId) clearInterval(intervalId)
  intervalId = setInterval(() => { maybeSyncNow().catch(console.warn) }, INTERVAL_MS)

  // Sync on network restore (web only)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => { maybeSyncNow().catch(console.warn) })
  }
}

export function stopAutoSync(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
