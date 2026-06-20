import { Platform } from 'react-native'
import type { ToneId } from './settings'

// Web Audio synthesis for the Focus Reminder engine. All sounds are generated at runtime
// with oscillators + gain envelopes — no asset files, tiny CPU, fully reliable. Web only;
// every export is a safe no-op on native.

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  return audioCtx
}

/** Resume the AudioContext. Must be reachable from a user gesture (browser autoplay rule). */
export function unlockAudio(): void {
  const ctx = getCtx()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

/** Install a one-time first-gesture unlock so non-gesture interval ticks can play. */
let unlockInstalled = false
export function installAudioUnlock(): () => void {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || unlockInstalled) return () => {}
  unlockInstalled = true
  const handler = () => unlockAudio()
  window.addEventListener('pointerdown', handler, { capture: true })
  window.addEventListener('keydown', handler, { capture: true })
  window.addEventListener('touchstart', handler, { capture: true })
  return () => {
    unlockInstalled = false
    window.removeEventListener('pointerdown', handler, true)
    window.removeEventListener('keydown', handler, true)
    window.removeEventListener('touchstart', handler, true)
  }
}

// ── Low-level note helper ────────────────────────────────────────────────────────
interface Note {
  freq: number
  type?: OscillatorType
  start: number      // seconds offset from now
  duration: number   // seconds
  peak?: number      // 0..1 relative to the channel volume
}

function playNotes(notes: Note[], volume: number): void {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  const v = Math.max(0, Math.min(1, volume))
  if (v <= 0) return
  const now = ctx.currentTime
  for (const n of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = n.type ?? 'sine'
    osc.frequency.value = n.freq
    const t = now + n.start
    const peak = Math.max(0.0001, (n.peak ?? 1) * v)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + n.duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + n.duration + 0.02)
  }
}

// ── Tone recipes ──────────────────────────────────────────────────────────────────
type Recipe = (volume: number) => void

const RECIPES: Record<string, Recipe> = {
  // Execute reminder tones
  bell: (v) => playNotes([
    { freq: 880, type: 'sine', start: 0, duration: 0.9, peak: 0.9 },
    { freq: 1320, type: 'sine', start: 0, duration: 0.7, peak: 0.35 },
  ], v),
  gong: (v) => playNotes([
    { freq: 196, type: 'sine', start: 0, duration: 1.4, peak: 0.9 },
    { freq: 261, type: 'triangle', start: 0, duration: 1.2, peak: 0.4 },
    { freq: 392, type: 'sine', start: 0, duration: 0.9, peak: 0.2 },
  ], v),
  chime: (v) => playNotes([
    { freq: 1047, type: 'sine', start: 0, duration: 0.5, peak: 0.8 },
    { freq: 1319, type: 'sine', start: 0.12, duration: 0.5, peak: 0.7 },
    { freq: 1568, type: 'sine', start: 0.24, duration: 0.6, peak: 0.6 },
  ], v),

  // Routine reminder tones
  beep: (v) => playNotes([
    { freq: 880, type: 'square', start: 0, duration: 0.18, peak: 0.5 },
  ], v),
  click: (v) => playNotes([
    { freq: 1500, type: 'square', start: 0, duration: 0.05, peak: 0.5 },
  ], v),
  chirp: (v) => playNotes([
    { freq: 1200, type: 'sine', start: 0, duration: 0.12, peak: 0.6 },
    { freq: 1800, type: 'sine', start: 0.08, duration: 0.12, peak: 0.5 },
  ], v),

  // Escalation tones (increasing urgency)
  escalation1: (v) => playNotes([
    { freq: 660, type: 'square', start: 0, duration: 0.2, peak: 0.7 },
    { freq: 660, type: 'square', start: 0.28, duration: 0.2, peak: 0.7 },
  ], v),
  escalation2: (v) => playNotes([
    { freq: 784, type: 'sawtooth', start: 0, duration: 0.22, peak: 0.85 },
    { freq: 988, type: 'sawtooth', start: 0.26, duration: 0.22, peak: 0.85 },
    { freq: 1175, type: 'sawtooth', start: 0.52, duration: 0.28, peak: 0.9 },
  ], v),
  escalation3: (v) => playNotes([
    { freq: 1047, type: 'sawtooth', start: 0, duration: 0.18, peak: 1 },
    { freq: 1047, type: 'sawtooth', start: 0.22, duration: 0.18, peak: 1 },
    { freq: 1047, type: 'sawtooth', start: 0.44, duration: 0.18, peak: 1 },
    { freq: 1319, type: 'sawtooth', start: 0.66, duration: 0.3, peak: 1 },
  ], v),

  // Return / resume
  resume: (v) => playNotes([
    { freq: 784, type: 'sine', start: 0, duration: 0.35, peak: 0.7 },
    { freq: 1047, type: 'sine', start: 0.16, duration: 0.4, peak: 0.6 },
  ], v),

  // Heartbeat ambient tick
  heartbeat: (v) => playNotes([
    { freq: 140, type: 'sine', start: 0, duration: 0.09, peak: 0.5 },
  ], v),

  // Overtime alert — an insistent double-beep, repeated on an interval while overrun.
  overtime: (v) => playNotes([
    { freq: 988, type: 'square', start: 0, duration: 0.16, peak: 0.8 },
    { freq: 988, type: 'square', start: 0.22, duration: 0.16, peak: 0.8 },
  ], v),
}

export type SoundName = ToneId | 'escalation1' | 'escalation2' | 'escalation3' | 'resume' | 'heartbeat' | 'overtime'

/** Play a synthesized sound by name at the given volume (0..1). No-op on native / unknown. */
export function playSound(name: SoundName, volume: number): void {
  const recipe = RECIPES[name]
  if (recipe) recipe(volume)
}

/** Preview helper for the settings UI — unlocks then plays. */
export function previewSound(name: SoundName, volume: number): void {
  unlockAudio()
  playSound(name, volume)
}
