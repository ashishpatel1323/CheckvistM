import { Platform } from 'react-native'
import { hapticMedium } from './haptics'

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web') return null
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  return audioCtx
}

/** Short beep tone — used for timer overrun alerts. Falls back to haptics on native. */
export function playBeep(): void {
  if (Platform.OS !== 'web') {
    void hapticMedium()
    return
  }
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = 880
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + 0.3)
}

/** Loud double-beep — used for the every-minute timer reminder. */
export function playLoudBeep(): void {
  if (Platform.OS !== 'web') {
    void hapticMedium()
    setTimeout(() => hapticMedium(), 300)
    return
  }
  const ctx = getAudioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const pulses = [0, 0.35] // two beeps, 350 ms apart
  for (const offset of pulses) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 660
    const t = ctx.currentTime + offset
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.8, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.5)
  }
}
