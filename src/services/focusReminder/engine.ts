import { Platform } from 'react-native'
import { getReminderConfig, type ReminderMode } from './settings'
import { playSound, installAudioUnlock, unlockAudio } from './audioManager'
import { EscalationTracker } from './escalationManager'

// Global singleton reminder engine. Lives at module scope so it survives route changes and
// never spawns duplicate timers. Web only — all exports no-op on native.

type Timer = ReturnType<typeof setInterval>

let activeMode: ReminderMode | null = null
let paused = false
let overrideIntervalSec: number | null = null
let mainTimer: Timer | null = null
let heartbeatTimer: Timer | null = null
let awayState = false
let listenersAttached = false
const escalation = new EscalationTracker()

function isWeb(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined'
}

/** Is the user actively looking at the app (tab visible AND window focused)? */
function isActive(): boolean {
  if (typeof document === 'undefined') return true
  const visible = document.visibilityState === 'visible'
  const focused = typeof document.hasFocus === 'function' ? document.hasFocus() : true
  return visible && focused
}

// ── Timer plumbing ────────────────────────────────────────────────────────────────
function clearMain() {
  if (mainTimer != null) { clearInterval(mainTimer); mainTimer = null }
}
function clearHeartbeat() {
  if (heartbeatTimer != null) { clearInterval(heartbeatTimer); heartbeatTimer = null }
}

function onMainTick() {
  if (paused || !activeMode) return
  const cfg = getReminderConfig()
  if (!cfg.masterEnabled) return
  const mode = cfg[activeMode]
  if (!mode.enabled) return

  if (isActive()) {
    // User is here → ordinary focus reminder.
    if (mode.sound.enabled) playSound(mode.sound.tone, mode.sound.volume)
  } else {
    // User has wandered off → escalate.
    escalation.tick(cfg.escalation)
  }
}

function onHeartbeatTick() {
  if (paused || !activeMode || !isActive()) return
  const cfg = getReminderConfig()
  if (!cfg.masterEnabled) return
  const mode = cfg[activeMode]
  if (!mode.enabled || !mode.heartbeat.enabled) return
  playSound('heartbeat', mode.heartbeat.volume)
}

function restartTimers() {
  clearMain()
  clearHeartbeat()
  if (paused || !activeMode) return
  const cfg = getReminderConfig()
  if (!cfg.masterEnabled || !cfg[activeMode].enabled) return

  const intervalSec = overrideIntervalSec ?? cfg[activeMode].intervalSec
  mainTimer = setInterval(onMainTick, Math.max(1, intervalSec) * 1000)

  const hb = cfg[activeMode].heartbeat
  if (hb.enabled) {
    heartbeatTimer = setInterval(onHeartbeatTick, Math.max(1, hb.intervalSec) * 1000)
  }
}

// ── Visibility / focus transitions ─────────────────────────────────────────────────
function onVisibilityShift() {
  if (!activeMode || paused) return
  const active = isActive()
  if (active && awayState) {
    // Returned after being away.
    awayState = false
    const cfg = getReminderConfig()
    if (cfg.masterEnabled && cfg.resume.enabled) playSound('resume', cfg.resume.volume)
    escalation.reset()
  } else if (!active && !awayState) {
    awayState = true
  }
}

function attachListeners() {
  if (!isWeb() || listenersAttached) return
  listenersAttached = true
  document.addEventListener('visibilitychange', onVisibilityShift)
  window.addEventListener('focus', onVisibilityShift)
  window.addEventListener('blur', onVisibilityShift)
}

function detachListeners() {
  if (!isWeb() || !listenersAttached) return
  listenersAttached = false
  document.removeEventListener('visibilitychange', onVisibilityShift)
  window.removeEventListener('focus', onVisibilityShift)
  window.removeEventListener('blur', onVisibilityShift)
}

// ── Public API ──────────────────────────────────────────────────────────────────────
export interface StartReminderOptions {
  mode: ReminderMode
  /** Optional override of the configured interval (seconds). */
  interval?: number
}

export function startFocusReminder(opts: StartReminderOptions): void {
  if (!isWeb()) return
  installAudioUnlock()
  unlockAudio() // succeeds immediately if called from a user gesture (e.g. play button)

  activeMode = opts.mode
  paused = false
  overrideIntervalSec = opts.interval ?? null
  awayState = !isActive()
  escalation.reset()
  attachListeners()
  restartTimers()
}

export function stopFocusReminder(): void {
  clearMain()
  clearHeartbeat()
  detachListeners()
  activeMode = null
  paused = false
  overrideIntervalSec = null
  awayState = false
  escalation.reset()
}

export function pauseFocusReminder(): void {
  if (!activeMode) return
  paused = true
  clearMain()
  clearHeartbeat()
}

export function resumeFocusReminder(): void {
  if (!activeMode || !paused) return
  paused = false
  awayState = !isActive()
  escalation.reset()
  restartTimers()
}

/** Re-read settings and apply (call after the user changes config while running). */
export function updateReminderConfig(): void {
  if (!activeMode || paused) return
  restartTimers()
}

export function isReminderActive(): boolean {
  return activeMode != null && !paused
}
