import { useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Plus, Minus, Play, Pause, Check, SkipForward, Circle, Timer, Repeat } from 'lucide-react-native'
import { useExecuteLog, liveSeconds } from '@/features/tasks/execute/useExecuteLog'
import { useRoutine2Store } from '@/features/tasks/routines2/useRoutine2Store'
import { useIdleTimer } from './useIdleTimer'
import { useOvertimeBeep } from '@/services/focusReminder'

// One global timer, present on every tab, with three mutually-exclusive states — each its
// own colour:
//   • Execution timer (an Execute task is running)  → indigo
//   • Routine timer   (a routine step is running)   → emerald
//   • Nothing tracked (idle countdown to the alert) → amber, turning red once it overruns
// Execute and routine timers are mutually exclusive (enforced in the stores), so only one of
// the first two can ever be active at a time.

const EXECUTE_COLOR = '#6366F1'
const ROUTINE_COLOR = '#10B981'
const IDLE_COLOR = '#F59E0B'
const OVER_COLOR = '#EF4444'

// Idle window before the "nothing is being tracked" alert, and how much each extend adds.
const IDLE_LIMIT_SEC = 5 * 60
const EXTEND_SEC = 5 * 60

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

interface GlobalTimerBarProps {
  /** Jump to the Execute tab when the execution timer chip is tapped. */
  onOpenExecute?: () => void
}

export function GlobalTimerBar({ onOpenExecute }: GlobalTimerBarProps) {
  // Execute timer state
  const timerRunningKey = useExecuteLog((s) => s.timerRunningKey)
  const timerStartedAt = useExecuteLog((s) => s.timerStartedAt)
  const entries = useExecuteLog((s) => s.entries)
  const taskNames = useExecuteLog((s) => s.taskNames)
  const pauseExecute = useExecuteLog((s) => s.pause)
  const setEstimate = useExecuteLog((s) => s.setEstimate)

  // Routine timer state
  const activeTimer = useRoutine2Store((s) => s.activeTimer)
  const routines = useRoutine2Store((s) => s.routines)
  const pauseRoutine = useRoutine2Store((s) => s.pauseTimer)
  const resumeRoutine = useRoutine2Store((s) => s.resumeTimer)
  const advanceStep = useRoutine2Store((s) => s.advanceStep)
  const expandTimer = useRoutine2Store((s) => s.expandTimer)
  const extendStep = useRoutine2Store((s) => s.extendStep)

  const mode: 'execute' | 'routine' | 'idle' =
    timerRunningKey != null ? 'execute' : activeTimer != null ? 'routine' : 'idle'

  // ── Idle window bookkeeping (shared store — single source of truth for main + floating) ──
  const idleStart = useIdleTimer((s) => s.startedAt)
  const idleLimitSec = useIdleTimer((s) => s.limitSec)

  useEffect(() => {
    if (mode !== 'idle') useIdleTimer.getState().clear()
    else useIdleTimer.getState().ensureStarted()
  }, [mode])

  // ── 1 s ticker so live elapsed advances in every state ───────────────────────
  const [, forceTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Derive everything for the current mode (no hooks below this comment except the
  //    single useOvertimeBeep call, so hook order stays stable across renders) ─────
  const routine = mode === 'routine' && activeTimer
    ? routines.find((r) => r.taskId === activeTimer.routineTaskId)
    : undefined

  let beepActive = false
  if (mode === 'execute' && timerRunningKey) {
    const entry = entries[timerRunningKey]
    const elapsed = entry ? liveSeconds(entry, timerRunningKey, timerStartedAt, timerRunningKey) : 0
    const estSec = entry ? entry.estimateMin * 60 : 0
    beepActive = !!entry && estSec > 0 && elapsed > estSec
  } else if (mode === 'routine' && activeTimer && routine) {
    const { pendingStepIds, stepIndex } = activeTimer
    const step = routine.steps.find((s) => s.id === pendingStepIds[stepIndex])
    const isPaused = activeTimer.pausedAt !== null
    const elapsed = activeTimer.stepElapsedSec + (isPaused ? 0 : (Date.now() - activeTimer.stepStartedAt) / 1000)
    const durSec = step ? step.durationMin * 60 + activeTimer.extensionSec : 0
    const finished = stepIndex >= pendingStepIds.length
    beepActive = !finished && !!step && step.durationMin > 0 && elapsed > durSec && !isPaused
  } else {
    // idle
    const elapsedSec = idleStart == null ? 0 : (Date.now() - idleStart) / 1000
    beepActive = idleStart != null && elapsedSec >= idleLimitSec
  }

  // Single, unconditional alert hook — the shared overtime beep used by Execute & Routine.
  useOvertimeBeep(beepActive)

  // ── Render: Execution timer ──────────────────────────────────────────────────
  if (mode === 'execute' && timerRunningKey) {
    const entry = entries[timerRunningKey]
    const elapsed = entry ? liveSeconds(entry, timerRunningKey, timerStartedAt, timerRunningKey) : 0
    const estSec = entry ? entry.estimateMin * 60 : 0
    const isOverrun = !!entry && estSec > 0 && elapsed > estSec
    const accent = isOverrun ? OVER_COLOR : EXECUTE_COLOR
    const name = (taskNames[timerRunningKey] ?? (entry ? `Task ${entry.taskId}` : 'Task'))
      .replace(/\*\*/g, '').replace(/\*/g, '')

    return (
      <Wrapper accent={accent} bg={isOverrun ? '#FEF2F2' : '#EEF2FF'} border={isOverrun ? '#FECACA' : '#E0E7FF'} pct={estSec > 0 ? Math.min(1, elapsed / estSec) : 0}>
        <Pressable onPress={onOpenExecute} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Timer size={13} color={accent} />
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: isOverrun ? '#B91C1C' : '#3730A3' }} numberOfLines={1}>
            {name}
          </Text>
        </Pressable>
        <Time accent={accent} value={fmt(elapsed)} sub={estSec > 0 ? `/ ${fmt(estSec)}` : undefined} overLabel={isOverrun} />
        {entry && estSec > 0 && (
          <>
            <AdjustPill color={accent} delta={-5} onPress={() => setEstimate(timerRunningKey, entry.estimateMin - 5)} />
            <AdjustPill color={accent} delta={5} onPress={() => setEstimate(timerRunningKey, entry.estimateMin + 5)} />
          </>
        )}
        <RoundBtn color={accent} onPress={pauseExecute}><Pause size={15} color="#fff" /></RoundBtn>
      </Wrapper>
    )
  }

  // ── Render: Routine timer ────────────────────────────────────────────────────
  if (mode === 'routine' && activeTimer && routine) {
    const { pendingStepIds, stepIndex } = activeTimer
    if (stepIndex >= pendingStepIds.length) return null
    const step = routine.steps.find((s) => s.id === pendingStepIds[stepIndex])
    const isPaused = activeTimer.pausedAt !== null
    const elapsed = activeTimer.stepElapsedSec + (isPaused ? 0 : (Date.now() - activeTimer.stepStartedAt) / 1000)
    const durSec = step ? step.durationMin * 60 + activeTimer.extensionSec : 0
    const isOverrun = !!step && step.durationMin > 0 && elapsed > durSec
    const accent = isOverrun ? OVER_COLOR : ROUTINE_COLOR

    return (
      <Wrapper accent={accent} bg={isOverrun ? '#FEF2F2' : '#ECFDF5'} border={isOverrun ? '#FECACA' : '#A7F3D0'} pct={durSec > 0 ? Math.min(1, elapsed / durSec) : 0}>
        <Pressable onPress={expandTimer} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          {step?.emoji ? <Text style={{ fontSize: 15 }}>{step.emoji}</Text> : <Repeat size={13} color={accent} />}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: isOverrun ? '#B91C1C' : '#065F46' }} numberOfLines={1}>
              {step?.name ?? routine.name}
            </Text>
            <Text style={{ fontSize: 10, color: '#9CA3AF' }} numberOfLines={1}>
              {routine.name} · {stepIndex + 1}/{pendingStepIds.length}
            </Text>
          </View>
        </Pressable>
        <Time accent={accent} value={fmt(elapsed)} sub={durSec > 0 ? `/ ${fmt(durSec)}` : undefined} overLabel={isOverrun} />
        {!!step && step.durationMin > 0 && (
          <>
            <AdjustPill color={accent} delta={-5} onPress={() => extendStep(-EXTEND_SEC)} />
            <AdjustPill color={accent} delta={5} onPress={() => extendStep(EXTEND_SEC)} />
          </>
        )}
        <RoundBtn color="#F3F4F6" onPress={() => (isPaused ? resumeRoutine() : pauseRoutine())}>
          {isPaused ? <Play size={14} color="#374151" fill="#374151" /> : <Pause size={14} color="#374151" />}
        </RoundBtn>
        <RoundBtn color={accent} onPress={() => void advanceStep('done')}><Check size={15} color="#fff" strokeWidth={3} /></RoundBtn>
        <RoundBtn color="#F3F4F6" onPress={() => void advanceStep('skip')}><SkipForward size={14} color="#374151" /></RoundBtn>
      </Wrapper>
    )
  }

  // ── Render: Idle ─────────────────────────────────────────────────────────────
  if (idleStart == null) return null
  const elapsedSec = (Date.now() - idleStart) / 1000
  const isOverrun = elapsedSec >= idleLimitSec
  const accent = isOverrun ? OVER_COLOR : IDLE_COLOR
  const overrunSec = Math.max(0, elapsedSec - idleLimitSec)

  return (
    <Wrapper accent={accent} bg={isOverrun ? '#FEF2F2' : '#FFFBEB'} border={isOverrun ? '#FECACA' : '#FDE68A'} pct={idleLimitSec > 0 ? Math.min(1, elapsedSec / idleLimitSec) : 0}>
      <Circle size={10} color={accent} fill={accent} />
      <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: isOverrun ? '#B91C1C' : '#92400E' }} numberOfLines={1}>
        {isOverrun ? 'Nothing tracked — start a task or routine' : 'Nothing is being tracked'}
      </Text>
      {isOverrun && (
        <View style={{ backgroundColor: '#FEE2E2', borderRadius: 9, paddingVertical: 1, paddingHorizontal: 7 }}>
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 }}>OVERTIME</Text>
        </View>
      )}
      <Time accent={accent} value={isOverrun ? `+${fmt(overrunSec)}` : fmt(elapsedSec)} sub={isOverrun ? undefined : `/ ${fmt(idleLimitSec)}`} overLabel={isOverrun} />
      {isOverrun && (
        <AdjustPill color={accent} delta={5} onPress={() => useIdleTimer.getState().extend(EXTEND_SEC)} />
      )}
    </Wrapper>
  )
}

// ── Small shared pieces ────────────────────────────────────────────────────────
function Wrapper({ accent, bg, border, pct, children }: { accent: string; bg: string; border: string; pct: number; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>
      <View style={{ height: 3, backgroundColor: border, borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
        <View style={{ height: '100%', width: `${pct * 100}%`, borderRadius: 2, backgroundColor: accent }} />
      </View>
    </View>
  )
}

function Time({ accent, value, sub, overLabel }: { accent: string; value: string; sub?: string; overLabel?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: accent, fontVariant: ['tabular-nums'] }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 10, color: overLabel ? accent : '#9CA3AF', fontVariant: ['tabular-nums'] }}>{sub}</Text> : null}
    </View>
  )
}

function AdjustPill({ color, delta, onPress }: { color: string; delta: number; onPress: () => void }) {
  const Icon = delta < 0 ? Minus : Plus
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: color, paddingVertical: 3, paddingHorizontal: 8 }}
    >
      <Icon size={11} color={color} />
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>5 min</Text>
    </Pressable>
  )
}

function RoundBtn({ color, onPress, children }: { color: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  )
}
