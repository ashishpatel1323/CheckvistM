import { useEffect } from 'react'
import { startFocusReminder, stopFocusReminder, updateReminderConfig } from './engine'
import { useFocusReminderSettings, type ReminderMode } from './settings'

/**
 * Drives the global reminder engine from a view's timer state.
 *   - `active` true  → engine running for `mode`
 *   - `active` false → engine stopped
 * Live-applies settings changes while running, and keeps the singleton alive across
 * task/habit switches (the engine is module-scoped; only `active` toggling stops it).
 */
export function useFocusReminderControl(mode: ReminderMode, active: boolean): void {
  // Subscribe so config edits re-run the apply effect below.
  const config = useFocusReminderSettings()

  useEffect(() => {
    if (active) startFocusReminder({ mode })
    else stopFocusReminder()
    return () => stopFocusReminder()
  }, [active, mode])

  useEffect(() => {
    if (active) updateReminderConfig()
  }, [active, config])
}
