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
  setMuted: (v: boolean) => void
  toggleMuted: () => void
  setFrequency: (v: TTSFrequency) => void
}

export const useTTSStore = create<TTSState>()(
  persist(
    (set) => ({
      muted: true,
      frequencySec: 60,
      setMuted: (v) => set({ muted: v }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setFrequency: (v) => set({ frequencySec: v }),
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
  setActiveName: (v: string | null) => void
}

export const useTTSActive = create<TTSActiveState>()((set) => ({
  activeName: null,
  setActiveName: (activeName) => set({ activeName }),
}))

// ── Low-level speak helper (web: Web Speech API, native: expo-speech) ─────────
function speak(text: string) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = 0.95
    utt.pitch = 1
    window.speechSynthesis.speak(utt)
  } else {
    Speech.stop()
    Speech.speak(text, { rate: 0.95, pitch: 1.0 })
  }
}

// ── Hook: drives periodic announcements (used in MuteButton) ─────────────────
export function useTTSAnnouncer() {
  const { muted, frequencySec } = useTTSStore()
  const activeName = useTTSActive((s) => s.activeName)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeNameRef = useRef(activeName)
  useEffect(() => { activeNameRef.current = activeName }, [activeName])

  const clearTimer = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    clearTimer()
    if (muted || !activeName) return

    // Speak immediately on unmute or item change, then on interval
    speak(activeName)
    intervalRef.current = setInterval(() => {
      if (activeNameRef.current) speak(activeNameRef.current)
    }, frequencySec * 1000)

    return clearTimer
  }, [muted, activeName, frequencySec, clearTimer])
}

// ── Hook: called from Execute/Routine views to broadcast their active item ────
export function useTTSBroadcast(name: string | null) {
  const setActiveName = useTTSActive((s) => s.setActiveName)
  useEffect(() => {
    setActiveName(name)
    return () => setActiveName(null)
  }, [name, setActiveName])
}
