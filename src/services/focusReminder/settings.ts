import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ── Tone presets (synthesized in audioManager — no asset files) ──────────────────
export const EXECUTE_TONES = ['bell', 'gong', 'chime'] as const
export const ROUTINE_TONES = ['beep', 'click', 'chirp'] as const
export type ExecuteTone = typeof EXECUTE_TONES[number]
export type RoutineTone = typeof ROUTINE_TONES[number]
export type ToneId = ExecuteTone | RoutineTone

export const FREQUENCY_OPTIONS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
] as const

// ── Config shapes ────────────────────────────────────────────────────────────────
export interface SoundConfig<T extends ToneId = ToneId> {
  enabled: boolean
  tone: T
  volume: number // 0..1
}

export interface HeartbeatConfig {
  enabled: boolean
  intervalSec: number
  volume: number
}

export interface ModeConfig<T extends ToneId = ToneId> {
  enabled: boolean
  intervalSec: number
  sound: SoundConfig<T>
  heartbeat: HeartbeatConfig
}

export interface EscalationConfig {
  enabled: boolean
  level1: boolean
  level2: boolean
  level3: boolean
  volume: number
}

export interface ResumeConfig {
  enabled: boolean
  volume: number
}

/** Continuous beep once an active timer exceeds its estimate. Shared by Execute + Routine. */
export interface OvertimeConfig {
  enabled: boolean
  volume: number
  intervalSec: number
}

export type ReminderMode = 'execute' | 'routine'

export interface FocusReminderConfig {
  masterEnabled: boolean
  execute: ModeConfig<ExecuteTone>
  routine: ModeConfig<RoutineTone>
  escalation: EscalationConfig
  resume: ResumeConfig
  overtime: OvertimeConfig
}

// ── Defaults ──────────────────────────────────────────────────────────────────────
const DEFAULTS: FocusReminderConfig = {
  masterEnabled: true,
  execute: {
    enabled: true,
    intervalSec: 60,
    sound: { enabled: true, tone: 'bell', volume: 0.7 },
    heartbeat: { enabled: false, intervalSec: 10, volume: 0.12 },
  },
  routine: {
    enabled: true,
    intervalSec: 60,
    sound: { enabled: true, tone: 'beep', volume: 0.7 },
    heartbeat: { enabled: false, intervalSec: 10, volume: 0.12 },
  },
  escalation: {
    enabled: true,
    level1: true,
    level2: true,
    level3: true,
    volume: 0.9,
  },
  resume: {
    enabled: true,
    volume: 0.5,
  },
  overtime: {
    enabled: true,
    volume: 0.6,
    intervalSec: 3,
  },
}

// ── Deep-merge helper for partial updates ───────────────────────────────────────
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as T
  for (const key in patch) {
    const pv = patch[key] as unknown
    const bv = (base as Record<string, unknown>)[key]
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && bv && typeof bv === 'object') {
      ;(out as Record<string, unknown>)[key] = deepMerge(bv, pv as DeepPartial<typeof bv>)
    } else if (pv !== undefined) {
      ;(out as Record<string, unknown>)[key] = pv
    }
  }
  return out
}

// ── Store ───────────────────────────────────────────────────────────────────────
interface FocusReminderState extends FocusReminderConfig {
  /** Deep-merge a partial config (used by the settings UI). */
  patch: (p: DeepPartial<FocusReminderConfig>) => void
  reset: () => void
}

export const useFocusReminderSettings = create<FocusReminderState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      patch: (p) => set((s) => deepMerge<FocusReminderConfig>(stripActions(s), p) as FocusReminderState),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'focus-reminder-settings',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist config, not the action functions.
      partialize: (s) => stripActions(s),
      merge: (persisted, current) =>
        deepMerge<FocusReminderState>(current, (persisted ?? {}) as DeepPartial<FocusReminderState>),
    }
  )
)

function stripActions(s: FocusReminderState): FocusReminderConfig {
  const { masterEnabled, execute, routine, escalation, resume, overtime } = s
  return { masterEnabled, execute, routine, escalation, resume, overtime }
}

/** Non-reactive snapshot for the imperative engine. */
export function getReminderConfig(): FocusReminderConfig {
  return stripActions(useFocusReminderSettings.getState())
}
