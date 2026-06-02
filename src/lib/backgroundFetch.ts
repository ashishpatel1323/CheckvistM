import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { Platform } from 'react-native'
import { getTokenAsync } from '@/auth/tokenStore'
import { fetchChecklists, fetchTasks } from '@/api/endpoints'
import { cacheLists, cacheTasks } from '@/lib/taskCache'

const TASK_NAME = 'cv-background-refresh'

// Runs in the background (iOS 15 min minimum interval, Android ~15 min).
// Fetches all checklists + their tasks and writes them to the persistent
// taskCache layer so the next foreground launch reads from disk instantly.
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const token = await getTokenAsync()
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData

    const lists = await fetchChecklists()
    await cacheLists(lists)

    const allTasks = await Promise.all(lists.map((l) => fetchTasks(l.id)))
    await cacheTasks(allTasks.flat())

    return BackgroundFetch.BackgroundFetchResult.NewData
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed
  }
})

export async function registerBackgroundFetch(): Promise<void> {
  // Background fetch is native-only; skip on web
  if (Platform.OS === 'web') return

  try {
    const status = await BackgroundFetch.getStatusAsync()
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME)
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,   // keep running after app is closed (Android)
        startOnBoot: true,        // restart after device reboot (Android)
      })
    }
  } catch {
    // Background fetch registration can fail in Expo Go — silently ignore
  }
}
