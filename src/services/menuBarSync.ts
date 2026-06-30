import { useEffect, useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import { useExecuteLog, type ExecuteLogEntry } from '@/features/tasks/execute/useExecuteLog'
import { useRoutine2Store } from '@/features/tasks/routines2/useRoutine2Store'
import type { RoutineDef, ActiveTimer } from '@/features/tasks/routines/routineTypes'
import { useAuth } from '@/auth/useAuth'
import { storageGetSync, storageSetSync } from '@/platform/storage'
import { fetchChecklists, createChecklist, fetchTasks, createTask, updateTask } from '@/api/endpoints'
import { publishSnapshot as publishDesktopSnapshot } from '@/platform/desktopBridge'
import { useIdleTimer } from '@/features/tasks/list/useIdleTimer'

// Publishes a live snapshot of the global timer (execute / routine / idle) into a dedicated,
// PRIVATE Checkvist list so a macOS menu-bar app can mirror it. Web-only, and read-only against
// the timer stores — it never mutates timer state, only writes a housekeeping task. There is no
// third-party relay: the snapshot lives in one hidden task whose `content` is the base64-encoded
// JSON, written via the same authenticated Checkvist session the app already uses (so no extra
// account and no message caps). The menu-bar reader logs into Checkvist with the user's own
// API key and polls that task. Liveness ("app closed → not tracking") is handled by the snapshot's
// updatedAt staleness check on the reader side. See tools/menubar-app/ for the reader.

export const CHECKVIST_SERVER = 'https://checkvist.com'
const RELAY_LIST_NAME = '⏱ Checkvist Timer State'
// Marks the single relay task and lets the reader find the payload. Base64url JSON follows it.
const CONTENT_PREFIX = 'CVTIMER1 '
const LIST_STORAGE = 'mb_list_id'
const TASK_STORAGE = 'mb_task_id'
const HEARTBEAT_MS = 120_000 // liveness refresh while a timer is active (idle doesn't heartbeat)
const MIN_POST_INTERVAL_MS = 3_000 // hard floor between any two writes, so bursts can't hammer the API
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

export interface RelayCoords {
  listId: number
  taskId: number
}

/** The reader "capability": which Checkvist list + task hold the snapshot. Null until first write. */
export function getRelayCoords(): RelayCoords | null {
  const listId = storageGetSync(LIST_STORAGE)
  const taskId = storageGetSync(TASK_STORAGE)
  if (!listId || !taskId) return null
  return { listId: Number(listId), taskId: Number(taskId) }
}

/** UTF-8-safe base64url (no padding) — keeps the payload free of Checkvist smart-syntax characters. */
function encodeContent(snapshot: TimerSnapshot): string {
  const json = JSON.stringify(snapshot)
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return CONTENT_PREFIX + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Find (or lazily create) the hidden list + single task that holds the snapshot. Mirrors the
 * useRoutineSystem pattern. Caches the ids in local storage so steady-state writes are a single PUT.
 */
async function ensureRelayTarget(): Promise<RelayCoords> {
  const cached = getRelayCoords()
  if (cached) return cached

  const lists = await fetchChecklists()
  const list = lists.find((l) => l.name === RELAY_LIST_NAME) ?? (await createChecklist(RELAY_LIST_NAME))

  const tasks = await fetchTasks(list.id)
  const task =
    tasks.find((t) => t.content.startsWith(CONTENT_PREFIX)) ??
    (await createTask(list.id, { content: CONTENT_PREFIX }))

  storageSetSync(LIST_STORAGE, String(list.id))
  storageSetSync(TASK_STORAGE, String(task.id))
  return { listId: list.id, taskId: task.id }
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
export function computeTimerSnapshot(
  ex: ExecuteState,
  rt: RoutineState,
  idleStart: number | null,
  idleLimitSec: number = IDLE_LIMIT_SEC,
): TimerSnapshot {
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
    targetSec: idleLimitSec,
    isPaused: false,
    isOverrun: elapsed >= idleLimitSec,
    updatedAt: now,
  }
}

// --- Publish liveness (for the in-app setup panel to show whether we're actually writing) ---

export interface PublishStatus {
  lastOkAt: number // epoch of the last successful write (0 = never)
  lastError: boolean // the most recent attempt failed (network / auth / API error)
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

/** Reactive read of the last write result; re-renders when a write succeeds or fails. */
export function useMenuBarPublishStatus(): PublishStatus {
  return useSyncExternalStore(
    subscribeStatus,
    () => publishStatus,
    () => publishStatus,
  )
}

/** Short signature of the fields that warrant an immediate write (vs. the timed heartbeat). */
function signature(s: TimerSnapshot): string {
  return `${s.mode}|${s.label}|${s.sublabel ?? ''}|${s.isPaused}|${s.startedAtMs}|${s.targetSec}`
}

/**
 * Mount once (alongside GlobalTimerBar). Writes the live snapshot on every meaningful change and,
 * while a timer is active, on a 2-minute liveness heartbeat. Writes are throttled to at most one
 * per MIN_POST_INTERVAL_MS so rapid step-advances can't hammer the Checkvist API. Idle never
 * heartbeats — the reader computes the countdown locally and falls back to "not tracking" via its
 * own staleness window. No-ops off web or when signed out.
 */
export function useMenuBarSync(): void {
  useEffect(() => {
    if (Platform.OS !== 'web') return

    let lastSig = ''
    let lastPostMs = 0
    let target: RelayCoords | null = getRelayCoords()
    let ensuring = false
    let writing = false

    async function write(snapshot: TimerSnapshot) {
      if (writing) return
      writing = true
      try {
        if (!target) {
          if (ensuring) return
          ensuring = true
          target = await ensureRelayTarget()
          ensuring = false
        }
        await updateTask(target.listId, target.taskId, { content: encodeContent(snapshot) })
        emitStatus({ lastOkAt: Date.now(), lastError: false })
      } catch {
        ensuring = false
        emitStatus({ lastOkAt: publishStatus.lastOkAt, lastError: true })
      } finally {
        writing = false
      }
    }

    function tick() {
      if (!useAuth.getState().isAuthenticated) return
      const exStore = useExecuteLog.getState()
      const rtStore = useRoutine2Store.getState()
      const ex: ExecuteState = {
        timerRunningKey: exStore.timerRunningKey,
        timerStartedAt: exStore.timerStartedAt,
        entries: exStore.entries,
        taskNames: exStore.taskNames,
      }
      const rt: RoutineState = { activeTimer: rtStore.activeTimer, routines: rtStore.routines }
      const mode = ex.timerRunningKey != null ? 'execute' : rt.activeTimer != null ? 'routine' : 'idle'

      // Idle start + limit come from the shared useIdleTimer store (single source of truth for the
      // main bar AND the floating window). GlobalTimerBar drives ensure/clear; ensure here too so
      // the snapshot is correct even on the first idle tick before its effect runs.
      const idle = useIdleTimer.getState()
      if (mode !== 'idle') idle.clear()
      else idle.ensureStarted()
      const idleNow = useIdleTimer.getState()

      const snapshot = computeTimerSnapshot(ex, rt, idleNow.startedAt, idleNow.limitSec)

      // MacOSElectronApp: push the live snapshot to the in-process IPC hub every tick (cheap,
      // in-memory) so the floating window mirrors this window with no lag. No-op off Electron.
      // This is ADDITIVE — the Checkvist relay write below is left exactly as-is so the existing
      // Swift menu-bar app keeps working.
      publishDesktopSnapshot(snapshot)

      const sig = signature(snapshot)
      const now = Date.now()
      // Write on a meaningful change, or on the liveness heartbeat — but only while something is
      // actively tracked. Idle needs no heartbeat: the reader derives the idle countdown from
      // startedAtMs and falls back to "not tracking" via its own staleness window.
      const heartbeatDue = now - lastPostMs >= HEARTBEAT_MS && snapshot.mode !== 'idle'
      const wantPost = sig !== lastSig || heartbeatDue
      // Throttle: never write more than once per MIN_POST_INTERVAL_MS. lastSig only advances on an
      // actual write, so a change suppressed here is re-sent (with the freshest snapshot) next tick.
      if (wantPost && now - lastPostMs >= MIN_POST_INTERVAL_MS) {
        lastSig = sig
        lastPostMs = now
        void write(snapshot)
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
}
