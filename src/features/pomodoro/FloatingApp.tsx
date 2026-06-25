import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, TextInput } from 'react-native'
import { Play, Pause, SkipForward, Plus, Minus, Check, Coffee, Square, X, RotateCcw } from 'lucide-react-native'
import {
  onDesktopSnapshot,
  getDesktopSnapshot,
  dispatchDesktop,
  setBreakWindow,
  closeSelfWindow,
  type DesktopSnapshot,
} from '@/platform/desktopBridge'
import { usePomodoro, pomoPhaseLenSec, pomoElapsedSec } from './usePomodoro'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'
import { createTask } from '@/api/endpoints'
import { playLoudBeep } from '@/platform/sound'

// The MacOSElectronApp floating window — compact, ~2 dense rows like the old Swift bar. Mirrors the
// main window's global timer over in-memory IPC, drives that timer, collapsible quick-add, and the
// self-contained Pomodoro (with fullscreen break overlay). Frameless: the root is a drag region
// (data-cv-drag) and every control opts out with data-cv-no-drag so clicks/typing still work.

const EXECUTE = '#6366F1'
const ROUTINE = '#10B981'
const IDLE = '#F59E0B'
const OVER = '#EF4444'
const POMO = '#7C3AED'

const IDLE_LIMIT_SEC = 5 * 60 // fallback before the first snapshot arrives

const DRAG = { cvDrag: 'true' } as const
const NODRAG = { cvNoDrag: 'true' } as const

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function FloatingApp() {
  const [snap, setSnap] = useState<DesktopSnapshot | null>(null)
  const [, tick] = useState(0)
  const [showAdd, setShowAdd] = useState(false)

  // Hydrate from the cached snapshot on mount, then live-subscribe.
  useEffect(() => {
    getDesktopSnapshot().then((s) => { if (s) setSnap(s) })
    return onDesktopSnapshot(setSnap)
  }, [])

  // 1 s ticker advances the mirrored elapsed time and the Pomodoro countdown.
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Pomodoro phase advance + break overlay control ─────────────────────────────
  const pomo = usePomodoro()
  const wasBreak = useRef(false)
  const now = Date.now()
  const pomoLen = pomoPhaseLenSec(pomo)
  const pomoElapsed = pomo.phase === 'off' ? 0 : pomoElapsedSec(pomo, now)
  const pomoRemaining = Math.max(0, pomoLen - pomoElapsed)

  useEffect(() => {
    if (pomo.phase === 'off' || pomo.runStartedAt == null) return
    if (pomoElapsed >= pomoLen) {
      playLoudBeep() // Swift played the "Glass" sound on each phase change.
      pomo.advancePhase()
    }
  }, [pomo, pomoElapsed, pomoLen])

  useEffect(() => {
    const onBreak = pomo.phase === 'onBreak'
    if (onBreak !== wasBreak.current) {
      wasBreak.current = onBreak
      setBreakWindow(onBreak)
    }
  }, [pomo.phase])

  if (pomo.phase === 'onBreak') {
    return <BreakOverlay remaining={pomoRemaining} onSkip={() => pomo.advancePhase()} onEnd={() => pomo.stop()} />
  }

  // ── Compact view ───────────────────────────────────────────────────────────────
  const isIdle = !snap || snap.mode === 'idle'
  const elapsed = snap ? snap.baseSec + (snap.isPaused ? 0 : (now - snap.startedAtMs) / 1000) : 0
  // Idle target now comes straight from the shared snapshot (single source of truth), so extend
  // here dispatches the same action as execute/routine — the main window applies it to the store.
  const target = isIdle ? (snap?.targetSec ?? IDLE_LIMIT_SEC) : (snap?.targetSec ?? 0)
  const isOverrun = target > 0 && elapsed > target
  const accent = isOverrun ? OVER : isIdle ? IDLE : snap!.mode === 'execute' ? EXECUTE : ROUTINE
  const pct = target > 0 ? Math.min(1, elapsed / target) : 0

  function extend(dir: 1 | -1) {
    dispatchDesktop({ type: 'extend', minutes: dir * 5 })
  }

  return (
    <View {...{ dataSet: DRAG }} style={{ flex: 1, backgroundColor: '#fff', paddingHorizontal: 9, paddingVertical: 7, gap: 5 }}>
      {/* Row 1: label + ±5 + elapsed/target + close */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Round color={showAdd ? EXECUTE : '#F3F4F6'} onPress={() => setShowAdd((v) => !v)}>
          <Plus size={14} color={showAdd ? '#fff' : '#374151'} />
        </Round>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, fontWeight: '700', color: '#111827' }}>
          {snap?.label ?? 'Nothing is being tracked'}
          {snap?.sublabel ? <Text style={{ fontWeight: '400', color: '#9CA3AF' }}>{`  ${snap.sublabel}`}</Text> : null}
        </Text>
        <Pill onPress={() => extend(-1)}><Minus size={11} color="#374151" /></Pill>
        <Pill onPress={() => extend(1)}><Plus size={11} color="#374151" /></Pill>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, minWidth: 78, justifyContent: 'flex-end' }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: accent, fontVariant: ['tabular-nums'] }}>
            {isIdle && isOverrun ? `+${fmt(elapsed - target)}` : fmt(elapsed)}
          </Text>
          {target > 0 && !(isIdle && isOverrun) ? (
            <Text style={{ fontSize: 9, color: isOverrun ? accent : '#9CA3AF', fontVariant: ['tabular-nums'] }}>/ {fmt(target)}</Text>
          ) : null}
        </View>
        <IconBtn onPress={() => closeSelfWindow()}><X size={13} color="#9CA3AF" /></IconBtn>
      </View>

      {/* Row 2: progress + transport */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1 }}><ProgressBar pct={pct} color={accent} /></View>
        {!isIdle && (
          <>
            <Round color="#F3F4F6" onPress={() => dispatchDesktop({ type: snap?.isPaused ? 'play' : 'pause' })}>
              {snap?.isPaused ? <Play size={13} color="#374151" fill="#374151" /> : <Pause size={13} color="#374151" />}
            </Round>
            <Round color={accent} onPress={() => dispatchDesktop({ type: 'skip' })}>
              <Check size={13} color="#fff" strokeWidth={3} />
            </Round>
          </>
        )}
      </View>

      {showAdd && <QuickAdd onDone={() => setShowAdd(false)} />}

      {/* Row 3: Pomodoro */}
      <PomodoroBar elapsed={pomoElapsed} length={pomoLen} remaining={pomoRemaining} />
    </View>
  )
}

function QuickAdd({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('')
  const activeChecklistId = useActiveChecklist((s) => s.activeChecklistId)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const content = text.trim()
    if (!content || activeChecklistId == null || busy) return
    setBusy(true)
    try {
      await createTask(activeChecklistId, { content })
      setText('')
      dispatchDesktop({ type: 'tasksChanged' }) // tell the main window to refetch its list
      onDone()
    } catch {
      /* leave text so the user can retry */
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TextInput
        {...{ dataSet: NODRAG }}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        autoFocus
        placeholder={activeChecklistId == null ? 'Open a list to add' : 'Quick add task…'}
        editable={activeChecklistId != null}
        placeholderTextColor="#9CA3AF"
        style={{ flex: 1, fontSize: 12, color: '#111827', backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}
      />
      <Round color={EXECUTE} onPress={submit}><Plus size={14} color="#fff" /></Round>
    </View>
  )
}

function PomodoroBar({ elapsed, length, remaining }: { elapsed: number; length: number; remaining: number }) {
  const phase = usePomodoro((s) => s.phase)
  const runStartedAt = usePomodoro((s) => s.runStartedAt)
  const workMin = usePomodoro((s) => s.workMin)
  const breakMin = usePomodoro((s) => s.breakMin)
  const start = usePomodoro((s) => s.start)
  const stop = usePomodoro((s) => s.stop)
  const reset = usePomodoro((s) => s.reset)
  const pause = usePomodoro((s) => s.pause)
  const resume = usePomodoro((s) => s.resume)
  const setWorkMin = usePomodoro((s) => s.setWorkMin)
  const setBreakMin = usePomodoro((s) => s.setBreakMin)

  const paused = phase !== 'off' && runStartedAt == null
  const pct = length > 0 ? elapsed / length : 0

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 5 }}>
      <Coffee size={13} color={phase === 'off' ? '#9CA3AF' : POMO} />
      {phase === 'off' ? (
        <>
          <Stepper label="W" value={workMin} onDec={() => setWorkMin(workMin - 5)} onInc={() => setWorkMin(workMin + 5)} />
          <Stepper label="B" value={breakMin} onDec={() => setBreakMin(breakMin - 1)} onInc={() => setBreakMin(breakMin + 1)} />
          <View style={{ flex: 1 }} />
          <Round color={POMO} onPress={start}><Play size={13} color="#fff" fill="#fff" /></Round>
        </>
      ) : (
        <>
          <Text style={{ fontSize: 13, fontWeight: '800', color: POMO, fontVariant: ['tabular-nums'] }}>{fmt(remaining)}</Text>
          <View style={{ flex: 1 }}><ProgressBar pct={pct} color={POMO} /></View>
          <Round color="#F3F4F6" onPress={() => (paused ? resume() : pause())}>
            {paused ? <Play size={12} color="#374151" fill="#374151" /> : <Pause size={12} color="#374151" />}
          </Round>
          <Round color="#F3F4F6" onPress={reset}><RotateCcw size={12} color="#374151" /></Round>
          <Round color="#F3F4F6" onPress={stop}><Square size={11} color="#374151" fill="#374151" /></Round>
        </>
      )}
    </View>
  )
}

function Stepper({ label, value, onDec, onInc }: { label: string; value: number; onDec: () => void; onInc: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#9CA3AF' }}>{label}</Text>
      <Pill onPress={onDec}><Minus size={10} color="#374151" /></Pill>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151', minWidth: 16, textAlign: 'center' }}>{value}</Text>
      <Pill onPress={onInc}><Plus size={10} color="#374151" /></Pill>
    </View>
  )
}

function BreakOverlay({ remaining, onSkip, onEnd }: { remaining: number; onSkip: () => void; onEnd: () => void }) {
  return (
    <View {...{ dataSet: DRAG }} style={{ flex: 1, backgroundColor: ROUTINE, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: 1 }}>BREAK</Text>
      <Text style={{ fontSize: 88, fontWeight: '900', color: '#fff', fontVariant: ['tabular-nums'] }}>{fmt(remaining)}</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Pressable {...{ dataSet: NODRAG }} onPress={onSkip} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 }}>
          <SkipForward size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Skip break</Text>
        </Pressable>
        <Pressable {...{ dataSet: NODRAG }} onPress={onEnd} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 }}>
          <Square size={16} color="#fff" fill="#fff" />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>End</Text>
        </Pressable>
      </View>
    </View>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={{ height: 4, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.max(0, Math.min(1, pct)) * 100}%`, backgroundColor: color, borderRadius: 2 }} />
    </View>
  )
}

function Pill({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable {...{ dataSet: NODRAG }} onPress={onPress} hitSlop={6} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  )
}

function Round({ color, onPress, children }: { color: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable {...{ dataSet: NODRAG }} onPress={onPress} hitSlop={6} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  )
}

function IconBtn({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable {...{ dataSet: NODRAG }} onPress={onPress} hitSlop={8} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </Pressable>
  )
}
