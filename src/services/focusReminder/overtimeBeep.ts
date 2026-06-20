import { useEffect } from 'react'
import { Platform } from 'react-native'
import { playBeep } from '@/platform/sound'
import { playSound, unlockAudio, installAudioUnlock } from './audioManager'
import { getReminderConfig, useFocusReminderSettings } from './settings'

// Shared "overtime" continuous-beep utility for both the Execute and Routine timers.
// Singleton: only ever one active beep loop, so two timers (or re-renders) can never stack
// overlapping audio. Web uses the configurable synth tone; native falls back to playBeep()
// (which buzzes via haptics). Background tabs keep ticking — setInterval is only throttled,
// and a running AudioContext keeps playing.

let beepTimer: ReturnType<typeof setInterval> | null = null

function emit(): void {
  const cfg = getReminderConfig().overtime
  if (!cfg.enabled) return
  if (Platform.OS === 'web') playSound('overtime', cfg.volume)
  else playBeep()
}

/** Begin the overtime beep loop. No-op if already running (single instance). */
export function startOvertimeBeep(): void {
  if (beepTimer != null) return
  const cfg = getReminderConfig().overtime
  if (!cfg.enabled) return
  installAudioUnlock()
  unlockAudio()
  emit() // beep immediately, then on the configured interval
  beepTimer = setInterval(emit, Math.max(1, cfg.intervalSec) * 1000)
}

/** Stop the overtime beep loop. Safe to call when not running. */
export function stopOvertimeBeep(): void {
  if (beepTimer != null) {
    clearInterval(beepTimer)
    beepTimer = null
  }
}

/**
 * Drives the shared beep from a timer's overrun state.
 * `active` should be true only when: timer running, past its (extended) estimate, the item
 * has an estimate, and it isn't paused/complete/skipped/not-applicable. All stop conditions
 * (extend, complete, skip, fail) flow through `active` flipping to false.
 */
export function useOvertimeBeep(active: boolean): void {
  const enabled = useFocusReminderSettings((s) => s.overtime.enabled)
  useEffect(() => {
    if (active && enabled) startOvertimeBeep()
    else stopOvertimeBeep()
    return () => stopOvertimeBeep()
  }, [active, enabled])
}
