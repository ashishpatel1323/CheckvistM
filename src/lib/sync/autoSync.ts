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
let unsubscribeNetInfo: (() => void) | null = null

async function isOnline(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  }
  // Use NetInfo on native to detect actual network connectivity
  try {
    const NetInfo = await import('@react-native-community/netinfo')
    const state = await NetInfo.default.fetch()
    return state.isConnected ?? true
  } catch {
    return true // Fallback to online if NetInfo fails
  }
}

async function maybeSyncNow(): Promise<void> {
  if (isRunning()) return
  if (!hasPending()) return
  const online = await isOnline()
  if (!online) return
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

  // Sync on network restore (web)
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', () => { maybeSyncNow().catch(console.warn) })
  }

  // Sync on network restore (native)
  if (Platform.OS !== 'web') {
    try {
      const NetInfo = await import('@react-native-community/netinfo')
      unsubscribeNetInfo = NetInfo.default.addEventListener((state) => {
        if (state.isConnected && !isRunning() && hasPending()) {
          maybeSyncNow().catch(console.warn)
        }
      })
    } catch {
      // NetInfo unavailable, fall back to interval-only sync
    }
  }
}

export function stopAutoSync(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo()
    unsubscribeNetInfo = null
  }
}
