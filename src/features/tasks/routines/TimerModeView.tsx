import { useState, useEffect, useRef } from 'react'
import { View, Text, Pressable, Modal, Platform, LayoutChangeEvent } from 'react-native'
import { Pause, Play, SkipForward, SkipBack, Check, X, Plus, ChevronDown } from 'lucide-react-native'
import { format } from 'date-fns'
import { useRoutineStore } from './useRoutineStore'
import { ROUTINE_COLORS } from './routineTypes'
import { playBeep, playLoudBeep } from '@/platform/sound'
import {
  setupTimerNotifications,
  showRoutineTimerNotification,
  dismissRoutineTimerNotification,
} from '@/platform/timerNotification'

const EXTEND_SEC = 5 * 60

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function fmtTime12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function CompletionTimeBar({ times, accentColor }: { times: string[]; accentColor: string }) {
  const [barWidth, setBarWidth] = useState(0)

  const now = new Date()
  const currentMin = now.getHours() * 60 + now.getMinutes()
  const currentHHMM = format(now, 'HH:mm')

  if (times.length === 0) return null

  // with only one historical time, show it as a simple label
  if (times.length === 1) {
    return (
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
          Usually at {fmtTime12(times[0])} · Now: {fmtTime12(currentHHMM)}
        </Text>
      </View>
    )
  }

  const sorted = [...times].sort()
  const minMin = toMinutes(sorted[0])
  const maxMin = toMinutes(sorted[sorted.length - 1])

  // Expand display range by 30 min each side for breathing room
  const displayMin = Math.max(0, minMin - 30)
  const displayMax = Math.min(23 * 60 + 59, maxMin + 30)
  const displayRange = displayMax - displayMin

  const pct = (min: number) =>
    displayRange > 0 ? Math.max(0, Math.min(1, (min - displayMin) / displayRange)) : 0.5

  const minPct = pct(minMin)
  const maxPct = pct(maxMin)
  const currentPct = pct(currentMin)

  const onLayout = (e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)

  return (
    <View style={{ marginVertical: 10 }}>
      <Text style={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginBottom: 2 }}>
        Usually between {fmtTime12(sorted[0])} and {fmtTime12(sorted[sorted.length - 1])} · Now: {fmtTime12(currentHHMM)}
      </Text>
      <Text style={{ fontSize: 10, color: '#9CA3AF', textAlign: 'center', marginBottom: 6 }}>
        last {times.length} completions
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 10, color: '#6B7280', width: 56, textAlign: 'right' }}>
          {fmtTime12(sorted[0])}
        </Text>

        {/* Bar */}
        <View
          style={{ flex: 1, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2 }}
          onLayout={onLayout}
        >
          {barWidth > 0 && (
            <>
              {/* Historical range fill */}
              <View
                style={{
                  position: 'absolute',
                  left: barWidth * minPct,
                  width: barWidth * (maxPct - minPct),
                  height: 4,
                  backgroundColor: `${accentColor}55`,
                  borderRadius: 2,
                }}
              />
              {/* Current time dot */}
              <View
                style={{
                  position: 'absolute',
                  left: barWidth * currentPct - 6,
                  top: -4,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: accentColor,
                }}
              />
            </>
          )}
        </View>

        <Text style={{ fontSize: 10, color: '#6B7280', width: 56 }}>
          {fmtTime12(sorted[sorted.length - 1])}
        </Text>
      </View>

      {/* Current time label, centred under the dot */}
      {barWidth > 0 && (
        <View style={{ paddingLeft: 64, paddingRight: 64 }}>
          <Text
            style={{
              fontSize: 11,
              color: accentColor,
              marginLeft: barWidth * currentPct - 24,
              marginTop: 4,
            }}
          >
            {fmtTime12(currentHHMM)}
          </Text>
        </View>
      )}
    </View>
  )
}

export function TimerModeView() {
  const {
    activeTimer, routines,
    pauseTimer, resumeTimer, advanceStep, goBack, stopTimer, extendStep,
    getLast7CompletionTimes, minimizeTimer,
  } = useRoutineStore()
  const [tick, setTick] = useState(0)
  const [celebrated, setCelebrated] = useState(false)
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const minuteBeepRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastNotifTickRef = useRef(-99)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Loud beep every 60 s while timer is running ─────────────────────────────
  useEffect(() => {
    minuteBeepRef.current = setInterval(() => playLoudBeep(), 60_000)
    return () => {
      if (minuteBeepRef.current) clearInterval(minuteBeepRef.current)
    }
  }, [])

  // ── Notification setup / teardown ──────────────────────────────────────────
  useEffect(() => {
    const handler = (type: 'execute' | 'routine', action: import('@/platform/timerNotification').TimerNotifAction) => {
      if (type !== 'routine') return
      const store = useRoutineStore.getState()
      if (action === 'pause') store.pauseTimer()
      else if (action === 'resume') store.resumeTimer()
      else if (action === 'skip') store.advanceStep('skip')
      else if (action === 'stop') store.stopTimer()
    }
    let unsub = () => {}
    if (Platform.OS !== 'web') {
      setupTimerNotifications(handler).then((fn) => { unsub = fn }).catch(() => {})
    }
    return () => { unsub(); dismissRoutineTimerNotification().catch(() => {}) }
  }, [])

  // ── Update notification every ~5 ticks ─────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web' || !activeTimer) return
    if (tick - lastNotifTickRef.current < 5 && tick !== 0) return
    lastNotifTickRef.current = tick
    const rt = routines.find((r) => r.taskId === activeTimer.routineTaskId)
    if (!rt) return
    const { pendingStepIds, stepIndex } = activeTimer
    if (stepIndex >= pendingStepIds.length) return
    const st = rt.steps.find((s) => s.id === pendingStepIds[stepIndex])
    if (!st) return
    const paused = activeTimer.pausedAt !== null
    const elapsed = activeTimer.stepElapsedSec + (paused ? 0 : (Date.now() - activeTimer.stepStartedAt) / 1000)
    const durSec = st.durationMin * 60 + activeTimer.extensionSec
    showRoutineTimerNotification({
      stepName: `${st.emoji ?? ''} ${st.name}`.trim(),
      stepIndex,
      totalSteps: pendingStepIds.length,
      remainingSec: durSec - elapsed,
      isRunning: !paused,
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, activeTimer])

  if (!activeTimer) return null

  const routine = routines.find((r) => r.taskId === activeTimer.routineTaskId)
  if (!routine) return null

  const { pendingStepIds, stepIndex, completedStepIds: timerDone, skippedStepIds: timerSkipped } = activeTimer
  const isComplete = stepIndex >= pendingStepIds.length

  useEffect(() => {
    if (isComplete) setCelebrated(true)
  }, [isComplete])

  // Back button is available for any previous step not marked Done (skipped = can retry)
  const hasPrevUndone = pendingStepIds
    .slice(0, stepIndex)
    .some((id) => !timerDone.includes(id))

  // Resolve current/prev/next steps from pendingStepIds
  const currentStepId = !isComplete ? pendingStepIds[stepIndex] : null
  // "Previous" display: find the nearest earlier step that was actually completed/skipped this session
  const prevStepId = (() => {
    for (let i = stepIndex - 1; i >= 0; i--) {
      if (timerDone.includes(pendingStepIds[i]) || timerSkipped.includes(pendingStepIds[i])) {
        return pendingStepIds[i]
      }
    }
    return null
  })()
  // "Next" display: next step that hasn't been done or skipped yet (after current)
  const nextStepId = (() => {
    for (let i = stepIndex + 1; i < pendingStepIds.length; i++) {
      if (!timerDone.includes(pendingStepIds[i]) && !timerSkipped.includes(pendingStepIds[i])) {
        return pendingStepIds[i]
      }
    }
    return null
  })()

  const step = currentStepId ? routine.steps.find((s) => s.id === currentStepId) ?? null : null
  // Historical completion times for the CURRENT step (used by the time bar)
  const completionTimes = currentStepId ? getLast7CompletionTimes(activeTimer.routineTaskId, currentStepId) : []
  const prevStep = prevStepId ? routine.steps.find((s) => s.id === prevStepId) ?? null : null
  const nextStep = nextStepId ? routine.steps.find((s) => s.id === nextStepId) ?? null : null

  const isPaused = activeTimer.pausedAt !== null
  const stepElapsedSec = activeTimer.stepElapsedSec + (
    isPaused ? 0 : (Date.now() - activeTimer.stepStartedAt) / 1000
  )
  const stepDurationSec = step ? step.durationMin * 60 + activeTimer.extensionSec : 0
  const remainingSec = Math.max(0, stepDurationSec - stepElapsedSec)
  const isOverrun = !!step && remainingSec <= 0
  const progressPct = stepDurationSec > 0 ? Math.min(1, stepElapsedSec / stepDurationSec) : 0

  // Beep every 5s while a step has overrun its (extended) duration and isn't paused
  useEffect(() => {
    if (isOverrun && !isPaused) {
      playBeep()
      beepIntervalRef.current = setInterval(() => playBeep(), 5000)
    }
    return () => {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current)
        beepIntervalRef.current = null
      }
    }
  }, [isOverrun, isPaused, currentStepId])

  const fmtCountdown = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const accentColor = ROUTINE_COLORS[routine.color]

  // Celebration screen
  if (isComplete || celebrated) {
    const totalSec = Math.round(activeTimer.totalElapsedSec)
    const totalMin = Math.floor(totalSec / 60)
    const completedCount = activeTimer.completedStepIds.length
    const skippedCount = activeTimer.skippedStepIds.length

    return (
      <Modal visible animationType="fade" presentationStyle="fullScreen">
        <View style={{ flex: 1, backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 60 }}>🎉</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 16, textAlign: 'center' }}>
            {skippedCount === 0 ? 'Amazing Job!' : 'Round Done!'}
          </Text>
          <Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)', marginTop: 8, textAlign: 'center' }}>
            {routine.name} complete
          </Text>

          <View style={{ flexDirection: 'row', gap: 32, marginTop: 32 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff' }}>{totalMin}m</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Duration</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff' }}>{completedCount}</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Done</Text>
            </View>
            {skippedCount > 0 && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>{skippedCount}</Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Skipped</Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={() => { setCelebrated(false); stopTimer() }}
            style={{
              marginTop: 48, backgroundColor: '#fff', borderRadius: 16,
              paddingVertical: 16, paddingHorizontal: 40,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: accentColor }}>Done</Text>
          </Pressable>
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
          }}
        >
          <Pressable onPress={stopTimer} hitSlop={8}>
            <X size={22} color="#6B7280" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>{routine.name}</Text>
            <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
              {stepIndex + 1} / {pendingStepIds.length} pending
            </Text>
          </View>
          <Pressable onPress={minimizeTimer} hitSlop={8}>
            <ChevronDown size={22} color="#6B7280" />
          </Pressable>
        </View>

        {/* Progress dots — only pending steps */}
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', paddingHorizontal: 20, marginBottom: 24 }}>
          {pendingStepIds.map((_, i) => {
            const done = i < stepIndex
            const current = i === stepIndex
            return (
              <View
                key={i}
                style={{
                  height: 6,
                  flex: 1, maxWidth: 32,
                  borderRadius: 3,
                  backgroundColor: done ? accentColor : current ? accentColor : '#E5E7EB',
                  opacity: current ? 1 : done ? 0.7 : 0.4,
                }}
              />
            )
          })}
        </View>

        {/* Previous step */}
        {prevStep && (
          <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginBottom: 8 }}>
            Previous: {prevStep.emoji} {prevStep.name}
          </Text>
        )}

        {/* Current step info */}
        <View style={{ alignItems: 'center', paddingHorizontal: 24, flex: 1, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 8 }}>
            Now — {step?.durationMin} min scheduled
          </Text>

          {/* Countdown */}
          <Text
            style={{
              fontSize: 72, fontWeight: '700', color: remainingSec < 30 ? '#EF4444' : accentColor,
              fontVariant: ['tabular-nums'], marginBottom: 16,
            }}
          >
            {fmtCountdown(remainingSec)}
          </Text>

          {/* Extend control — shown once the step has overrun its time */}
          {isOverrun && (
            <Pressable
              onPress={() => extendStep(EXTEND_SEC)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: '#FEF2F2', borderRadius: 20,
                paddingVertical: 8, paddingHorizontal: 16, marginBottom: 16,
              }}
            >
              <Plus size={16} color="#EF4444" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>Extend +5 min</Text>
            </Pressable>
          )}

          {/* Step name */}
          <Text style={{ fontSize: 32 }}>{step?.emoji}</Text>
          <Text
            style={{
              fontSize: 22, fontWeight: '700', color: '#111', textAlign: 'center',
              marginTop: 8, marginBottom: 24,
            }}
          >
            {step?.name}
          </Text>

          {/* Progress bar */}
          <View style={{ width: '100%', height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, marginBottom: 16 }}>
            <View
              style={{
                height: 6, borderRadius: 3,
                backgroundColor: accentColor,
                width: `${Math.round(progressPct * 100)}%`,
              }}
            />
          </View>

          {/* Completion time range bar */}
          {completionTimes.length >= 1 && (
            <View style={{ width: '100%', marginBottom: 12 }}>
              <CompletionTimeBar times={completionTimes} accentColor={accentColor} />
            </View>
          )}

          {/* Next step */}
          {nextStep ? (
            <Text style={{ fontSize: 13, color: '#9CA3AF' }}>
              Next: {nextStep.emoji} {nextStep.name}
            </Text>
          ) : (
            <Text style={{ fontSize: 13, color: '#9CA3AF' }}>Last step</Text>
          )}
        </View>

        {/* Controls */}
        <View
          style={{
            flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center',
            paddingHorizontal: 24, paddingBottom: 48, paddingTop: 16,
            borderTopWidth: 1, borderTopColor: '#F0F0F0',
          }}
        >
          {/* Back — go to nearest previous undone step (hidden when none exists) */}
          <Pressable
            onPress={hasPrevUndone ? goBack : undefined}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: hasPrevUndone ? '#F3F4F6' : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <SkipBack size={20} color={hasPrevUndone ? '#374151' : 'transparent'} />
          </Pressable>

          {/* Pause / Resume */}
          <Pressable
            onPress={isPaused ? resumeTimer : pauseTimer}
            style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isPaused
              ? <Play size={22} color="#374151" fill="#374151" />
              : <Pause size={22} color="#374151" />
            }
          </Pressable>

          {/* Done */}
          <Pressable
            onPress={() => advanceStep('done')}
            style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center',
              shadowColor: accentColor, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
            }}
          >
            <Check size={30} color="#fff" strokeWidth={3} />
          </Pressable>

          {/* Skip — marks as failed */}
          <Pressable
            onPress={() => advanceStep('skip')}
            style={{
              width: 56, height: 56, borderRadius: 28,
              backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <SkipForward size={22} color="#374151" />
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

/** Compact bar shown when the timer is minimized — persists across tab switches. */
export function MiniTimerBar() {
  const { activeTimer, routines, timerMinimized, expandTimer, pauseTimer, resumeTimer, advanceStep } = useRoutineStore()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (!activeTimer || !timerMinimized) return null

  const routine = routines.find((r) => r.taskId === activeTimer.routineTaskId)
  if (!routine) return null

  const { pendingStepIds, stepIndex } = activeTimer
  const isComplete = stepIndex >= pendingStepIds.length
  if (isComplete) return null

  const step = routine.steps.find((s) => s.id === pendingStepIds[stepIndex])
  const isPaused = activeTimer.pausedAt !== null
  const elapsed = activeTimer.stepElapsedSec + (isPaused ? 0 : (Date.now() - activeTimer.stepStartedAt) / 1000)
  const durSec = step ? step.durationMin * 60 + activeTimer.extensionSec : 0
  const remaining = Math.max(0, durSec - elapsed)
  const isOverrun = !!step && remaining <= 0
  const accentColor = ROUTINE_COLORS[routine.color]

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  void tick // consumed for re-render

  return (
    <Pressable
      onPress={expandTimer}
      style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff',
        borderTopWidth: 2, borderTopColor: accentColor,
        paddingHorizontal: 16, paddingVertical: 10,
        shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 8,
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 22 }}>{step?.emoji ?? '⏱'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }} numberOfLines={1}>
          {step?.name ?? routine.name}
        </Text>
        <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
          {routine.name} · {stepIndex + 1}/{pendingStepIds.length}
        </Text>
      </View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: isOverrun ? '#EF4444' : accentColor, fontVariant: ['tabular-nums'] }}>
        {fmt(remaining)}
      </Text>
      {/* Pause/resume inline */}
      <Pressable
        onPress={(e) => { e.stopPropagation?.(); isPaused ? resumeTimer() : pauseTimer() }}
        hitSlop={8}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
      >
        {isPaused ? <Play size={16} color="#374151" fill="#374151" /> : <Pause size={16} color="#374151" />}
      </Pressable>
      {/* Done inline */}
      <Pressable
        onPress={(e) => { e.stopPropagation?.(); void advanceStep('done') }}
        hitSlop={8}
        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center' }}
      >
        <Check size={16} color="#fff" strokeWidth={3} />
      </Pressable>
    </Pressable>
  )
}
