import { useEffect, useRef, useCallback } from 'react'
import { Platform } from 'react-native'
import * as Speech from 'expo-speech'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Frequency presets (seconds between announcements) ────────────────────────
export const TTS_FREQUENCIES = [
  { label: '15s',  value: 15 },
  { label: '30s',  value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
] as const

export type TTSFrequency = typeof TTS_FREQUENCIES[number]['value']

// ── Persistent store ──────────────────────────────────────────────────────────
interface TTSState {
  muted: boolean
  frequencySec: TTSFrequency
  sayElapsedTime: boolean
  setMuted: (v: boolean) => void
  toggleMuted: () => void
  setFrequency: (v: TTSFrequency) => void
  toggleSayElapsedTime: () => void
}

export const useTTSStore = create<TTSState>()(
  persist(
    (set) => ({
      muted: true,
      frequencySec: 60,
      sayElapsedTime: false,
      setMuted: (v) => set({ muted: v }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setFrequency: (v) => set({ frequencySec: v }),
      toggleSayElapsedTime: () => set((s) => ({ sayElapsedTime: !s.sayElapsedTime })),
    }),
    {
      name: 'tts-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
)

// ── Active-item broadcast (written by Execute/Routine views, read by MuteButton) ─
interface TTSActiveState {
  activeName: string | null
  elapsedSeconds: number | null
  setActiveName: (v: string | null) => void
  setElapsedSeconds: (v: number | null) => void
}

export const useTTSActive = create<TTSActiveState>()((set) => ({
  activeName: null,
  elapsedSeconds: null,
  setActiveName: (activeName) => set({ activeName }),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
}))

// ── Low-level speak helper (web: Web Speech API, native: expo-speech) ─────────
function speak(text: string) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const synth = window.speechSynthesis
    // Chrome stall fix: resume in case synth got stuck
    synth.cancel()
    synth.resume()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.95
    utt.pitch = 1
    // Chrome voices-not-loaded fix: wait for voices if empty
    const doSpeak = () => { synth.cancel(); synth.speak(utt) }
    if (synth.getVoices().length > 0) {
      doSpeak()
    } else {
      synth.addEventListener('voiceschanged', doSpeak, { once: true })
    }
  } else {
    Speech.stop()
    Speech.speak(text, { rate: 0.95, pitch: 1.0 })
  }
}

function fmtElapsedForSpeech(seconds: number): string {
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s} second${s !== 1 ? 's' : ''}`
  if (s === 0) return `${m} minute${m !== 1 ? 's' : ''}`
  return `${m} minute${m !== 1 ? 's' : ''} ${s} second${s !== 1 ? 's' : ''}`
}

// ── Hook: drives periodic announcements (used in MuteButton) ─────────────────
export function useTTSAnnouncer() {
  const { muted, frequencySec, sayElapsedTime } = useTTSStore()
  const activeName = useTTSActive((s) => s.activeName)
  const elapsedSeconds = useTTSActive((s) => s.elapsedSeconds)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeNameRef = useRef(activeName)
  const elapsedSecondsRef = useRef(elapsedSeconds)
  const sayElapsedTimeRef = useRef(sayElapsedTime)
  useEffect(() => { activeNameRef.current = activeName }, [activeName])
  useEffect(() => { elapsedSecondsRef.current = elapsedSeconds }, [elapsedSeconds])
  useEffect(() => { sayElapsedTimeRef.current = sayElapsedTime }, [sayElapsedTime])

  const clearTimer = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    clearTimer()
    if (muted || !activeName) return

    function speakCurrent() {
      const name = activeNameRef.current
      if (!name) return
      const elapsed = elapsedSecondsRef.current
      const text = sayElapsedTimeRef.current && elapsed != null
        ? `${name}. ${fmtElapsedForSpeech(elapsed)}`
        : name
      speak(text)
    }

    // Speak immediately on unmute or item change, then on interval
    speakCurrent()
    intervalRef.current = setInterval(speakCurrent, frequencySec * 1000)

    return clearTimer
  }, [muted, activeName, frequencySec, clearTimer])
}

// ── Hook: called from Execute/Routine views to broadcast their active item ────
export function useTTSBroadcast(name: string | null, elapsedSeconds?: number | null) {
  const setActiveName = useTTSActive((s) => s.setActiveName)
  const setElapsedSeconds = useTTSActive((s) => s.setElapsedSeconds)
  useEffect(() => {
    setActiveName(name)
    return () => setActiveName(null)
  }, [name, setActiveName])
  useEffect(() => {
    setElapsedSeconds(elapsedSeconds ?? null)
    return () => setElapsedSeconds(null)
  }, [elapsedSeconds, setElapsedSeconds])
}
