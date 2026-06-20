import type { EscalationConfig } from './settings'
import { playSound, type SoundName } from './audioManager'

// Maps the number of consecutive missed intervals (while the user is away from the app) to
// an escalation sound. Stages, per spec:
//   1st missed interval  → level 1 (double beep)
//   3rd missed interval  → level 2 (strong alert)
//   5th+ missed interval → level 3 (urgent, repeats every interval thereafter)

export interface EscalationStep {
  level: 1 | 2 | 3 | null
  sound: SoundName | null
}

/** Pure mapping: given how many intervals have been missed, which escalation step fires. */
export function escalationStepFor(missedCount: number): EscalationStep {
  if (missedCount >= 5) return { level: 3, sound: 'escalation3' }
  if (missedCount >= 3) return { level: 2, sound: 'escalation2' }
  if (missedCount >= 1) return { level: 1, sound: 'escalation1' }
  return { level: null, sound: null }
}

function levelEnabled(cfg: EscalationConfig, level: 1 | 2 | 3): boolean {
  if (level === 1) return cfg.level1
  if (level === 2) return cfg.level2
  return cfg.level3
}

/**
 * Tracks escalation across missed intervals and plays the appropriate sound.
 * Call `tick()` once per missed interval while the user is away; call `reset()` when they return.
 */
export class EscalationTracker {
  private missed = 0

  reset(): void {
    this.missed = 0
  }

  get missedCount(): number {
    return this.missed
  }

  /** Advance one missed interval and play the matching escalation sound (if enabled). */
  tick(cfg: EscalationConfig): void {
    this.missed += 1
    if (!cfg.enabled) return
    const step = escalationStepFor(this.missed)
    if (step.level == null || step.sound == null) return
    if (!levelEnabled(cfg, step.level)) return
    playSound(step.sound, cfg.volume)
  }
}
