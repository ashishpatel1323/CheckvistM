import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

// Notification IDs
const EXECUTE_ID = 'checkvist-execute-timer'
const ROUTINE_ID = 'checkvist-routine-timer'

// Android channel IDs
const EXECUTE_CHANNEL = 'execute-timer'
const ROUTINE_CHANNEL = 'routine-timer'

// Category identifiers for action buttons
const CAT_EXECUTE_RUNNING = 'execute-running'
const CAT_EXECUTE_PAUSED = 'execute-paused'
const CAT_ROUTINE_RUNNING = 'routine-running'
const CAT_ROUTINE_PAUSED = 'routine-paused'

export type TimerNotifAction = 'pause' | 'resume' | 'complete' | 'skip' | 'stop'
type ActionHandler = (type: 'execute' | 'routine', action: TimerNotifAction) => void

let _responseListener: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | null = null
let _initialized = false
const _handlers = new Set<ActionHandler>()

async function _ensureInitialized(): Promise<boolean> {
  if (_initialized) return true
  if (Platform.OS === 'web') return false

  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return false

  // Show notifications as banners when app is in foreground too
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(EXECUTE_CHANNEL, {
      name: 'Execute Timer',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    })
    await Notifications.setNotificationChannelAsync(ROUTINE_CHANNEL, {
      name: 'Routine Timer',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    })
  }

  await Notifications.setNotificationCategoryAsync(CAT_EXECUTE_RUNNING, [
    { identifier: 'pause',    buttonTitle: '⏸ Pause',    options: { opensAppToForeground: false } },
    { identifier: 'complete', buttonTitle: '✓ Done',     options: { opensAppToForeground: true  } },
  ])
  await Notifications.setNotificationCategoryAsync(CAT_EXECUTE_PAUSED, [
    { identifier: 'resume',   buttonTitle: '▶ Resume',   options: { opensAppToForeground: false } },
    { identifier: 'complete', buttonTitle: '✓ Done',     options: { opensAppToForeground: true  } },
  ])
  await Notifications.setNotificationCategoryAsync(CAT_ROUTINE_RUNNING, [
    { identifier: 'pause',    buttonTitle: '⏸ Pause',    options: { opensAppToForeground: false } },
    { identifier: 'skip',     buttonTitle: '⏭ Skip',     options: { opensAppToForeground: false } },
    { identifier: 'stop',     buttonTitle: '⏹ Stop',     options: { opensAppToForeground: true  } },
  ])
  await Notifications.setNotificationCategoryAsync(CAT_ROUTINE_PAUSED, [
    { identifier: 'resume',   buttonTitle: '▶ Resume',   options: { opensAppToForeground: false } },
    { identifier: 'skip',     buttonTitle: '⏭ Skip',     options: { opensAppToForeground: false } },
    { identifier: 'stop',     buttonTitle: '⏹ Stop',     options: { opensAppToForeground: true  } },
  ])

  _responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    const notifId = response.notification.request.identifier
    const action = response.actionIdentifier as TimerNotifAction
    if (!action || action === (Notifications.DEFAULT_ACTION_IDENTIFIER as string)) return
    const type = notifId === EXECUTE_ID ? 'execute' : notifId === ROUTINE_ID ? 'routine' : null
    if (!type) return
    _handlers.forEach((h) => h(type, action))
  })

  _initialized = true
  return true
}

/** Register a handler for notification action buttons. Returns an unsubscribe function. */
export async function setupTimerNotifications(onAction: ActionHandler): Promise<() => void> {
  const ok = await _ensureInitialized()
  if (!ok) return () => {}
  _handlers.add(onAction)
  return () => teardownTimerNotifications(onAction)
}

export function teardownTimerNotifications(handler: ActionHandler): void {
  _handlers.delete(handler)
}

// ─── Execute timer ─────────────────────────────────────────────────────────────

export async function showExecuteTimerNotification({
  taskName,
  elapsedSec,
  estimateMin,
  isRunning,
}: {
  taskName: string
  elapsedSec: number
  estimateMin: number | null
  isRunning: boolean
}): Promise<void> {
  if (Platform.OS === 'web') return

  const elapsed = fmtDuration(elapsedSec)
  const progress = estimateMin ? `${elapsed} / ${estimateMin}m` : elapsed
  const icon = isRunning ? '▶' : '⏸'

  await Notifications.scheduleNotificationAsync({
    identifier: EXECUTE_ID,
    content: {
      title: taskName,
      body: `${icon}  ${progress}`,
      categoryIdentifier: isRunning ? CAT_EXECUTE_RUNNING : CAT_EXECUTE_PAUSED,
      data: { type: 'execute-timer' },
      ...(Platform.OS === 'android' && {
        color: '#E8632A',
        android: {
          channelId: EXECUTE_CHANNEL,
          color: '#E8632A',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
      }),
    } as Notifications.NotificationContentInput,
    trigger: null,
  })
}

export async function dismissExecuteTimerNotification(): Promise<void> {
  if (Platform.OS === 'web') return
  await Notifications.dismissNotificationAsync(EXECUTE_ID).catch(() => {})
}

// ─── Routine timer ─────────────────────────────────────────────────────────────

export async function showRoutineTimerNotification({
  stepName,
  stepIndex,
  totalSteps,
  remainingSec,
  isRunning,
}: {
  stepName: string
  stepIndex: number
  totalSteps: number
  remainingSec: number
  isRunning: boolean
}): Promise<void> {
  if (Platform.OS === 'web') return

  const overrun = remainingSec < 0
  const timeStr = fmtDuration(Math.abs(remainingSec))
  const timeLabel = overrun ? `+${timeStr} overtime` : `${timeStr} left`
  const icon = isRunning ? '▶' : '⏸'

  await Notifications.scheduleNotificationAsync({
    identifier: ROUTINE_ID,
    content: {
      title: stepName,
      body: `${icon}  ${timeLabel}  ·  ${stepIndex + 1}/${totalSteps}`,
      categoryIdentifier: isRunning ? CAT_ROUTINE_RUNNING : CAT_ROUTINE_PAUSED,
      data: { type: 'routine-timer' },
      ...(Platform.OS === 'android' && {
        color: '#4772FA',
        android: {
          channelId: ROUTINE_CHANNEL,
          color: '#4772FA',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
      }),
    } as Notifications.NotificationContentInput,
    trigger: null,
  })
}

export async function dismissRoutineTimerNotification(): Promise<void> {
  if (Platform.OS === 'web') return
  await Notifications.dismissNotificationAsync(ROUTINE_ID).catch(() => {})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(totalSec: number): string {
  const sec = Math.floor(Math.abs(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
