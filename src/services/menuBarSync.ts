import { useEffect, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { useExecuteLog, type ExecuteLogEntry } from '@/features/tasks/execute/useExecuteLog'
import { useRoutineStore, type ActiveTimer } from '@/features/tasks/routines/useRoutineStore'
import type { RoutineDef } from '@/features/tasks/routines/routineTypes'
import { useAuth } from '@/auth/useAuth'
import { storageGetSync, storageSetSync } from '@/platform/storage'

// Publishes a live snapshot of the global timer (execute / routine / idle) to a public ntfy.sh
// topic so a macOS SwiftBar plugin can mirror it in the menu bar. Web-only, read-only: it only
// reads the existing stores and never mutates timer state. No backend/relay of our own — ntfy is
// an open pub/sub service with CORS enabled. The topic name is the only "key" (a capability), so
// it's randomly generated. Liveness ("app closed → not tracking") is handled by the snapshot's
// updatedAt staleness check on the reader side. See tools/swiftbar/ for the menu-bar side.

export const NTFY_SERVER = 'https://ntfy.sh'
const TOPIC_STORAGE = 'mb_topic'
const HEARTBEAT_MS = 120_000 // liveness refresh while a timer is active (idle doesn't heartbeat)
const MIN_POST_INTERVAL_MS = 3_000 // hard floor between any two posts, so bursts can't spam ntfy
const IDLE_LIMIT_SEC = 5 * 60 // mirror GlobalTimerBar's idle window

export interface TimerSnapshot {
  mode: 'execute' | 'routine' | 'idle'
  label: string
  sublabel?: string
  baseSec: number // accumulated seconds at startedAtMs
  startedAtMs: number // epoch when current accrual started ticking
  targetSec: number // estimate / duration / idle limit (0 = none)
  isPaused: boolean
  isOverrun: boolean
  updatedAt: number
}

/** Stable per-user ntfy topic (the capability), generated once and shown in-app to paste into SwiftBar. */
export function getOrCreateMenuBarTopic(): string {
  const existing = storageGetSync(TOPIC_STORAGE)
  if (existing) return existing
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const topic = `checkvist-timer-${rand}`
  storageSetSync(TOPIC_STORAGE, topic)
  return topic
}

interface ExecuteState {
  timerRunningKey: string | null
  timerStartedAt: number | null
  entries: Record<string, ExecuteLogEntry>
  taskNames: Record<string, string>
}

interface RoutineState {
  activeTimer: ActiveTimer | null
  routines: RoutineDef[]
}

/**
 * Build the menu-bar snapshot from the two timer stores plus the locally-tracked idle start.
 * Pure — mirrors the mode/elapsed math in GlobalTimerBar so the menu bar matches the in-app bar.
 */
export function computeTimerSnapshot(ex: ExecuteState, rt: RoutineState, idleStart: number | null): TimerSnapshot {
  const now = Date.now()
  const mode: TimerSnapshot['mode'] =
    ex.timerRunningKey != null ? 'execute' : rt.activeTimer != null ? 'routine' : 'idle'

  if (mode === 'execute' && ex.timerRunningKey) {
    const entry = ex.entries[ex.timerRunningKey]
    const baseSec = entry ? entry.actualSeconds : 0
    const startedAtMs = ex.timerStartedAt ?? now
    const targetSec = entry ? entry.estimateMin * 60 : 0
    const elapsed = baseSec + Math.floor((now - startedAtMs) / 1000)
    const label = (ex.taskNames[ex.timerRunningKey] ?? (entry ? `Task ${entry.taskId}` : 'Task'))
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
    return {
      mode,
      label,
      baseSec,
      startedAtMs,
      targetSec,
      isPaused: false,
      isOverrun: targetSec > 0 && elapsed > targetSec,
      updatedAt: now,
    }
  }

  if (mode === 'routine' && rt.activeTimer) {
    const at = rt.activeTimer
    const routine = rt.routines.find((r) => r.taskId === at.routineTaskId)
    const step = routine?.steps.find((s) => s.id === at.pendingStepIds[at.stepIndex])
    const isPaused = at.pausedAt !== null
    const baseSec = at.stepElapsedSec
    const startedAtMs = at.stepStartedAt
    const targetSec = step ? step.durationMin * 60 + at.extensionSec : 0
    const elapsed = baseSec + (isPaused ? 0 : (now - startedAtMs) / 1000)
    return {
      mode,
      label: step?.name ?? routine?.name ?? 'Routine',
      sublabel: routine ? `${routine.name} · ${at.stepIndex + 1}/${at.pendingStepIds.length}` : undefined,
      baseSec,
      startedAtMs,
      targetSec,
      isPaused,
      isOverrun: !!step && step.durationMin > 0 && elapsed > targetSec && !isPaused,
      updatedAt: now,
    }
  }

  // idle
  const startedAtMs = idleStart ?? now
  const elapsed = (now - startedAtMs) / 1000
  return {
    mode: 'idle',
    label: 'Nothing is being tracked',
    baseSec: 0,
    startedAtMs,
    targetSec: IDLE_LIMIT_SEC,
    isPaused: false,
    isOverrun: elapsed >= IDLE_LIMIT_SEC,
    updatedAt: now,
  }
}

// --- Publish liveness (for the in-app setup panel to show whether we're actually posting) ---

export interface PublishStatus {
  lastOkAt: number // epoch of the last successful POST (0 = never)
  lastError: boolean // the most recent attempt failed (network/CORS/non-2xx)
}

let publishStatus: PublishStatus = { lastOkAt: 0, lastError: false }
const statusListeners = new Set<() => void>()

function emitStatus(next: PublishStatus) {
  publishStatus = next
  statusListeners.forEach((l) => l())
}

function subscribeStatus(cb: () => void): () => void {
  statusListeners.add(cb)
  return () => {
    statusListeners.delete(cb)
  }
}

/** Reactive read of the last publish result; re-renders when a POST succeeds or fails. */
export function useMenuBarPublishStatus(): PublishStatus {
  return useSyncExternalStore(
    subscribeStatus,
    () => publishStatus,
    () => publishStatus,
  )
}

/** Short signature of the fields that warrant an immediate publish (vs. the timed heartbeat). */
function signature(s: TimerSnapshot): string {
  return `${s.mode}|${s.label}|${s.sublabel ?? ''}|${s.isPaused}|${s.startedAtMs}|${s.targetSec}`
}

/**
 * Mount once (alongside GlobalTimerBar). Publishes the live snapshot on every meaningful change
 * and, while a timer is active, on a 2-minute liveness heartbeat. Posts are throttled to at most
 * one per MIN_POST_INTERVAL_MS so rapid step-advances can't hammer ntfy. Idle never heartbeats —
 * the reader computes the countdown locally and falls back to "not tracking" via its own staleness
 * window. No-ops off web or when signed out / no key.
 */
export function useMenuBarSync(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return

    let idleStart: number | null = null
    let lastSig = ''
    let lastPostMs = 0

    function post(snapshot: TimerSnapshot) {
      const topic = storageGetSync(TOPIC_STORAGE)
      if (!topic) return
      // ntfy treats the request body as the message; we publish the snapshot JSON verbatim.
      void fetch(`${NTFY_SERVER}/${topic}`, {
        method: 'POST',
        body: JSON.stringify(snapshot),
        keepalive: true,
      })
        .then((res) => emitStatus({ lastOkAt: res.ok ? Date.now() : publishStatus.lastOkAt, lastError: !res.ok }))
        .catch(() => emitStatus({ lastOkAt: publishStatus.lastOkAt, lastError: true }))
    }

    function tick() {
      if (!useAuth.getState().isAuthenticated) return
      const exStore = useExecuteLog.getState()
      const rtStore = useRoutineStore.getState()
      const ex: ExecuteState = {
        timerRunningKey: exStore.timerRunningKey,
        timerStartedAt: exStore.timerStartedAt,
        entries: exStore.entries,
        taskNames: exStore.taskNames,
      }
      const rt: RoutineState = { activeTimer: rtStore.activeTimer, routines: rtStore.routines }
      const mode = ex.timerRunningKey != null ? 'execute' : rt.activeTimer != null ? 'routine' : 'idle'

      // Track the idle window start the same way GlobalTimerBar does.
      if (mode !== 'idle') idleStart = null
      else if (idleStart == null) idleStart = Date.now()

      const snapshot = computeTimerSnapshot(ex, rt, idleStart)
      const sig = signature(snapshot)
      const now = Date.now()
      // Post on a meaningful change, or on the liveness heartbeat — but only while something is
      // actively tracked. Idle needs no heartbeat: the reader derives the idle countdown from
      // startedAtMs and falls back to "not tracking" via its own staleness window.
      const heartbeatDue = now - lastPostMs >= HEARTBEAT_MS && snapshot.mode !== 'idle'
      const wantPost = sig !== lastSig || heartbeatDue
      // Throttle: never post more than once per MIN_POST_INTERVAL_MS. lastSig only advances on an
      // actual post, so a change suppressed here is re-sent (with the freshest snapshot) next tick.
      if (wantPost && now - lastPostMs >= MIN_POST_INTERVAL_MS) {
        lastSig = sig
        lastPostMs = now
        post(snapshot)
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
}
