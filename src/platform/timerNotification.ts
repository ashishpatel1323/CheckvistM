import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'

const EXECUTE_ID = 'checkvist-execute-timer'
const ROUTINE_ID = 'checkvist-routine-timer'

const EXECUTE_CHANNEL = 'execute-timer'
const ROUTINE_CHANNEL = 'routine-timer'

// Single toggle action per state — keeps the notification clean
const CAT_EXECUTE_RUNNING = 'execute-running'
const CAT_EXECUTE_PAUSED  = 'execute-paused'
const CAT_ROUTINE_RUNNING = 'routine-running'
const CAT_ROUTINE_PAUSED  = 'routine-paused'

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

  // Only show as banner when app is backgrounded (foreground = user is already watching)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    }),
  })

  if (Platform.OS === 'android') {
    // LOW importance = persistent in tray, no sound/vibration, no heads-up pop-up
    await Notifications.setNotificationChannelAsync(EXECUTE_CHANNEL, {
      name: 'Execute Timer',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    })
    await Notifications.setNotificationChannelAsync(ROUTINE_CHANNEL, {
      name: 'Routine Timer',
      importance: Notifications.AndroidImportance.LOW,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    })
  }

  // Single action per state — just the play/pause toggle
  await Notifications.setNotificationCategoryAsync(CAT_EXECUTE_RUNNING, [
    { identifier: 'pause',  buttonTitle: '⏸  Pause',  options: { opensAppToForeground: false } },
  ])
  await Notifications.setNotificationCategoryAsync(CAT_EXECUTE_PAUSED, [
    { identifier: 'resume', buttonTitle: '▶  Resume', options: { opensAppToForeground: false } },
  ])
  await Notifications.setNotificationCategoryAsync(CAT_ROUTINE_RUNNING, [
    { identifier: 'pause',  buttonTitle: '⏸  Pause',  options: { opensAppToForeground: false } },
  ])
  await Notifications.setNotificationCategoryAsync(CAT_ROUTINE_PAUSED, [
    { identifier: 'resume', buttonTitle: '▶  Resume', options: { opensAppToForeground: false } },
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
  const over = estimateMin && elapsedSec > estimateMin * 60
  const progress = estimateMin
    ? over
      ? `+${fmtDuration(elapsedSec - estimateMin * 60)} over ${estimateMin}m`
      : `${elapsed} / ${estimateMin}m`
    : elapsed
  const statusDot = isRunning ? '🟠' : '⏸'

  await Notifications.scheduleNotificationAsync({
    identifier: EXECUTE_ID,
    content: {
      title: `${statusDot}  ${taskName}`,
      body: progress,
      categoryIdentifier: isRunning ? CAT_EXECUTE_RUNNING : CAT_EXECUTE_PAUSED,
      data: { type: 'execute-timer' },
      color: '#E8632A',
      ...(Platform.OS === 'android' && {
        android: {
          channelId: EXECUTE_CHANNEL,
          color: '#E8632A',
          ongoing: true,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
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
  const timeLabel = overrun ? `+${timeStr} over` : `${timeStr} left`
  const progress = `${stepIndex + 1} / ${totalSteps}  ·  ${timeLabel}`
  const statusDot = isRunning ? (overrun ? '🔴' : '🟢') : '⏸'

  await Notifications.scheduleNotificationAsync({
    identifier: ROUTINE_ID,
    content: {
      title: `${statusDot}  ${stepName}`,
      body: progress,
      categoryIdentifier: isRunning ? CAT_ROUTINE_RUNNING : CAT_ROUTINE_PAUSED,
      data: { type: 'routine-timer' },
      color: '#4772FA',
      ...(Platform.OS === 'android' && {
        android: {
          channelId: ROUTINE_CHANNEL,
          color: '#4772FA',
          ongoing: true,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
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
