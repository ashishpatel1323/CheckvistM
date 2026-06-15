import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { View, Text, Pressable, ScrollView, Platform, TextInput, Animated, Modal, useWindowDimensions } from 'react-native'
import { Play, Pause, Minus, Plus, Check, RotateCcw, CheckCircle2, GripVertical, Calendar, Pencil, X, ChevronLeft, ChevronRight, AlignLeft, Maximize2, Network, Clock, Timer, Target, Zap, EyeOff, List, ArrowDown, Sunrise } from 'lucide-react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate, classifyTask, GROUP_LABELS, type DateGroup } from '@/lib/dateSort'
import { classifyPriority, PRIORITY_META } from '@/features/tasks/list/PriorityDateView'
import { classifyTime, TIME_QUADRANTS } from '@/features/tasks/list/EisenhowerMatrixView'
import {
  useExecuteLog,
  entryKey,
  liveSeconds,
  DEFAULT_ESTIMATE,
  ESTIMATE_STEP,
  type ExecuteLogEntry,
} from './useExecuteLog'
import { priorityTextColor, priorityDisplay, priorityRowBg, PriorityPicker } from '@/features/tasks/shared/PriorityPicker'
import { useSystemLog, type SyncedSession } from './useSystemLog'
import { hapticMedium } from '@/platform/haptics'
import { playBeep } from '@/platform/sound'
import {
  setupTimerNotifications,
  teardownTimerNotifications,
  showExecuteTimerNotification,
  dismissExecuteTimerNotification,
} from '@/platform/timerNotification'
import { useUpdateTask } from '@/features/tasks/list/useTasksQuery'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { humanizeDueDate, parseApiDate } from '@/lib/dateUtils'
import { InlineMarkdown, stripMarkdown } from '@/components/InlineMarkdown'
import { useTTSBroadcast, speak as ttsSpeak, useTTSStore, fmtElapsedForSpeech } from '@/features/tasks/shared/useTTS'
import { MuteButton } from '@/features/tasks/shared/MuteButton'
import { BottomSheet } from '@/components/BottomSheet'
import { isToday, isPast, format, addDays } from 'date-fns'

const BLUE = '#6366F1'
const INDIGO = '#6366F1'

const DATE_GROUP_THEME: Record<DateGroup, { bgLight: string; stroke: string; text: string }> = {
  overdue:   { bgLight: '#fff1f1', stroke: '#ef4444', text: '#7f1d1d' },
  today:     { bgLight: '#eff6ff', stroke: '#3b82f6', text: '#1e3a8a' },
  tomorrow:  { bgLight: '#f5f3ff', stroke: '#7c3aed', text: '#3b0764' },
  thisWeek:  { bgLight: '#f0fdf4', stroke: '#22c55e', text: '#14532d' },
  later:     { bgLight: '#fffbeb', stroke: '#f59e0b', text: '#78350f' },
  noDueDate: { bgLight: '#f8fafc', stroke: '#94a3b8', text: '#334155' },
}

// Desktop column layout: fixed-width slots so time/due/priority line up vertically
const COL_TAGS = 110
const COL_TIME = 52
const COL_DATE = 84
const COL_PRI = 40
const COLUMN_MODE_MIN_WIDTH = 620

// ─── Group header helpers ──────────────────────────────────────────────────────

const DATE_ACCENT: Record<DateGroup, string> = {
  overdue:   '#EF4444',
  today:     '#4772FA',
  tomorrow:  '#8B5CF6',
  thisWeek:  '#059669',
  later:     '#6B7280',
  noDueDate: '#D1D5DB',
}

const PRIORITY_LABEL: Record<'high' | 'medium' | 'low' | 'tbd', string> = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
  tbd:    'TBD',
}

const PRIORITY_COLOR: Record<'high' | 'medium' | 'low' | 'tbd', string> = {
  high:   '#b91c1c',
  medium: '#b45309',
  low:    '#15803d',
  tbd:    '#7c3aed',
}

function groupKey(task: TaskNode): string {
  return `${classifyTask(task)}__${classifyPriority(task.priority)}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// ─── Flip clock ───────────────────────────────────────────────────────────────

function FlipDigit({ digit, size }: { digit: string; size: 'sm' | 'md' | 'lg' | 'xl' }) {
  const prevDigit = useRef(digit)
  const flipAnim = useRef(new Animated.Value(0)).current
  const [flipping, setFlipping] = useState(false)
  const [displayPrev, setDisplayPrev] = useState(digit)
  const [displayNext, setDisplayNext] = useState(digit)

  useEffect(() => {
    if (digit === prevDigit.current) return
    setDisplayPrev(prevDigit.current)
    setDisplayNext(digit)
    prevDigit.current = digit
    flipAnim.setValue(0)
    setFlipping(true)
    Animated.timing(flipAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setFlipping(false))
  }, [digit, flipAnim])

  const cardW = size === 'xl' ? 80 : size === 'lg' ? 52 : size === 'md' ? 36 : 28
  const cardH = size === 'xl' ? 110 : size === 'lg' ? 72 : size === 'md' ? 50 : 40
  const fontSize = size === 'xl' ? 68 : size === 'lg' ? 44 : size === 'md' ? 28 : 24

  // Top half rotates away (0 → -90deg), bottom half reveals (90 → 0deg)
  const topRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] })
  const btmRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] })
  const topOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] })
  const btmOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] })

  const card = {
    width: cardW, height: cardH, borderRadius: 8,
    backgroundColor: '#1a1a1a',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  }

  const digitText = (val: string) => (
    <Text style={{ fontSize, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] as never }}>
      {val}
    </Text>
  )

  return (
    <View style={{ width: cardW, height: cardH, position: 'relative' }}>
      {/* Static card (current digit) */}
      <View style={card}>{digitText(flipping ? displayPrev : digit)}</View>

      {/* Divider line */}
      <View style={{
        position: 'absolute', left: 0, right: 0,
        top: cardH / 2 - 0.5, height: 1,
        backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 10,
      }} />

      {flipping && (
        <>
          {/* Top flap (prev digit rotating away) */}
          <Animated.View style={[card, {
            position: 'absolute', top: 0,
            transform: [{ perspective: 400 }, { rotateX: topRotate }],
            transformOrigin: 'bottom',
            opacity: topOpacity,
            overflow: 'hidden',
            zIndex: 5,
          }]}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: cardH }}>
              {digitText(displayPrev)}
            </View>
          </Animated.View>

          {/* Bottom flap (next digit revealing) */}
          <Animated.View style={[card, {
            position: 'absolute', top: 0,
            transform: [{ perspective: 400 }, { rotateX: btmRotate }],
            transformOrigin: 'top',
            opacity: btmOpacity,
            overflow: 'hidden',
            zIndex: 5,
          }]}>
            {digitText(displayNext)}
          </Animated.View>
        </>
      )}
    </View>
  )
}

function FlipClock({ totalSeconds, color, size = 'lg' }: { totalSeconds: number; color?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  const m0 = String(Math.floor(m / 10))
  const m1 = String(m % 10)
  const s0 = String(Math.floor(s / 10))
  const s1 = String(s % 10)
  const gap = size === 'xl' ? 8 : size === 'lg' ? 5 : size === 'md' ? 4 : 3
  const sepSize = size === 'xl' ? 44 : size === 'lg' ? 28 : size === 'md' ? 20 : 16
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <FlipDigit digit={m0} size={size} />
      <FlipDigit digit={m1} size={size} />
      <Text style={{ fontSize: sepSize, fontWeight: '900', color: color ?? '#1a1a1a', marginHorizontal: 2 }}>:</Text>
      <FlipDigit digit={s0} size={size} />
      <FlipDigit digit={s1} size={size} />
    </View>
  )
}

function fmtMins(seconds: number): string {
  const m = Math.round(seconds / 60)
  return `${m}m`
}

function fmtDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60)
  if (totalMin < 60) return `${totalMin}m`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function summarizeTodaySessionsFromLogSource(
  entries: Record<string, ExecuteLogEntry>,
  remoteSessions: Record<string, SyncedSession>,
  timerRunningKey: string | null,
  timerStartedAt: number | null,
): { sessionCount: number; sessionTotalSeconds: number } {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const seen = new Set<string>()
  let sessionCount = 0
  let sessionTotalSeconds = 0

  for (const [key, entry] of Object.entries(entries)) {
    const parts = key.split(':')
    if (parts.length < 3 || parts[1] !== todayStr || !entry.startedAt) continue
    seen.add(key)
    sessionCount += 1
    sessionTotalSeconds += liveSeconds(entry, timerRunningKey, timerStartedAt, key)
  }

  for (const [key, session] of Object.entries(remoteSessions)) {
    if (seen.has(key) || !session.startedAt) continue
    const parts = key.split(':')
    if (parts.length < 3 || parts[1] !== todayStr) continue
    sessionCount += 1
    sessionTotalSeconds += session.actualSeconds
  }

  return { sessionCount, sessionTotalSeconds }
}

// ─── Full-screen counter modal ────────────────────────────────────────────────

function FullScreenCounterModal({ onClose }: { onClose: () => void }) {
  const { currentTask, currentEntry, currentSeconds, isRunning, togglePlay, adjust, complete, resetCurrent } = useExecCtx()

  const estimateSeconds = (currentEntry?.estimateMin ?? DEFAULT_ESTIMATE) * 60
  const isOverrun = isRunning && currentSeconds >= estimateSeconds
  const beepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Beep every 5s once the running timer overruns its estimate, until extended or stopped
  useEffect(() => {
    if (isOverrun) {
      playBeep()
      beepIntervalRef.current = setInterval(() => playBeep(), 5000)
    }
    return () => {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current)
        beepIntervalRef.current = null
      }
    }
  }, [isOverrun])

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
        {/* Close */}
        <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16 }}>
          <Pressable hitSlop={8} onPress={onClose}>
            <X size={22} color="#6B7280" />
          </Pressable>
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24 }}>
          {/* Task name */}
          {currentTask && (
            <Text style={{ fontSize: 17, color: '#374151', textAlign: 'center', paddingHorizontal: 24, lineHeight: 24 }} numberOfLines={2}>
              <InlineMarkdown content={currentTask.content} />
            </Text>
          )}

          {/* Giant flip clock */}
          <FlipClock totalSeconds={currentSeconds} color={isRunning ? BLUE : '#DC2626'} size="xl" />

          {/* Extend control — shown once the running timer overruns its estimate */}
          {isOverrun && (
            <Pressable
              onPress={() => adjust(ESTIMATE_STEP)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                backgroundColor: '#FEF2F2', borderRadius: 20,
                paddingVertical: 8, paddingHorizontal: 16,
              }}
            >
              <Plus size={16} color="#EF4444" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>Extend +{ESTIMATE_STEP} min</Text>
            </Pressable>
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
          <Pressable
            hitSlop={10} onPress={resetCurrent}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
          >
            <RotateCcw size={20} color="#374151" />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => adjust(-ESTIMATE_STEP)}>
            <Minus size={24} color="#9CA3AF" />
          </Pressable>
          <Pressable
            onPress={togglePlay}
            style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: isRunning ? BLUE : '#111827',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: isRunning ? BLUE : '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
            }}
          >
            {isRunning ? <Pause size={30} color="white" /> : <Play size={30} color="white" />}
          </Pressable>
          <Pressable hitSlop={10} onPress={() => adjust(ESTIMATE_STEP)}>
            <Plus size={24} color="#9CA3AF" />
          </Pressable>
          <Pressable
            hitSlop={10}
            onPress={() => { complete(); onClose() }}
            style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }}
          >
            <Check size={22} color="white" strokeWidth={3} />
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr]
  const [item] = result.splice(from, 1)
  result.splice(to > from ? to - 1 : to, 0, item)
  return result
}

type TaskNode = ReturnType<typeof buildTaskTree>['allNodes'][number]

// ─── Context ──────────────────────────────────────────────────────────────────

interface ExecCtxValue {
  // Data
  orderedTasks: TaskNode[]
  orderedIds: number[]
  setOrderedIds: Dispatch<SetStateAction<number[]>>
  currentIndex: number
  setCurrentIndex: Dispatch<SetStateAction<number>>
  currentTask: TaskNode | undefined
  currentKey: string | null
  currentEntry: ExecuteLogEntry | undefined
  isRunning: boolean
  currentSeconds: number
  completedCount: number
  totalActualSeconds: number
  totalEstimateSeconds: number
  getEntry: (taskId: number) => ExecuteLogEntry | undefined
  entries: Record<string, ExecuteLogEntry>
  timerRunningKey: string | null
  timerStartedAt: number | null
  // Edit state
  editingTitle: boolean
  setEditingTitle: Dispatch<SetStateAction<boolean>>
  titleDraft: string
  setTitleDraft: Dispatch<SetStateAction<string>>
  showDatePicker: boolean
  setShowDatePicker: Dispatch<SetStateAction<boolean>>
  showPriorityPicker: boolean
  setShowPriorityPicker: Dispatch<SetStateAction<boolean>>
  // Actions
  togglePlay: () => void
  playTask: (index: number) => void
  adjust: (delta: number) => void
  setEstimateDirect: (mins: number) => void
  complete: () => void
  resetCurrent: () => void
  jumpTo: (index: number) => void
  prevTask: () => void
  nextTask: () => void
  persistOrder: (newIds: number[]) => void
  updateTask: ReturnType<typeof useUpdateTask>['mutate']
  confirmSwitch: () => void
  cancelSwitch: () => void
  // Stats
  completedStreak: number
  pendingSwitch: { index: number; andPlay: boolean } | null
  // Config
  checklistId: number
  onJumpToRaw?: (taskId: number) => void
  onJumpToMindmap?: (taskId: number) => void
}

const ExecCtx = createContext<ExecCtxValue | null>(null)

export function useExecCtx(): ExecCtxValue {
  const ctx = useContext(ExecCtx)
  if (!ctx) throw new Error('useExecCtx must be used inside ExecuteStateProvider')
  return ctx
}

// ─── State Provider ───────────────────────────────────────────────────────────

interface ProviderProps {
  tasks: CheckvistTask[]
  checklistId: number
  onJumpToRaw?: (taskId: number) => void
  onJumpToMindmap?: (taskId: number) => void
  children: ReactNode
}

export function ExecuteStateProvider({ tasks, checklistId, onJumpToRaw, onJumpToMindmap, children }: ProviderProps) {
  const todayTasks = useMemo(() => {
    const { allNodes } = buildTaskTree(tasks)
    const groups = groupTasksByDate(allNodes)
    return groups.find((g) => g.group === 'today')?.tasks ?? []
  }, [tasks])

  const todayByPriority = useMemo(
    () => [...todayTasks].sort((a, b) => {
      const pa = a.priority > 0 ? a.priority : Infinity
      const pb = b.priority > 0 ? b.priority : Infinity
      if (pa !== pb) return pa - pb
      return a.position - b.position
    }),
    [todayTasks]
  )

  const [orderedIds, setOrderedIds] = useState<number[]>([])
  useEffect(() => {
    setOrderedIds((prev) => {
      const newIds = todayByPriority.map((t) => t.id)
      const kept = prev.filter((id) => newIds.includes(id))
      const added = newIds.filter((id) => !prev.includes(id))
      return [...kept, ...added]
    })
  }, [todayByPriority])

  const orderedTasks = useMemo(
    () => orderedIds.map((id) => todayTasks.find((t) => t.id === id)).filter(Boolean) as TaskNode[],
    [orderedIds, todayTasks]
  )

  const { entries, timerRunningKey, timerStartedAt, seed, setEstimate, play, pause, markCompleted, reset, setTaskName, hydrateFromRemote } = useExecuteLog()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [tick, setTick] = useState(0)
  const [now, setNow] = useState(new Date())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    clockRef.current = setInterval(() => setNow(new Date()), 60_000)
    return () => { if (clockRef.current) clearInterval(clockRef.current) }
  }, [])

  const { mutate: updateTask } = useUpdateTask(checklistId)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [completedStreak, setCompletedStreak] = useState(0)
  const [pendingSwitch, setPendingSwitch] = useState<{ index: number; andPlay: boolean } | null>(null)

  useEffect(() => {
    for (const t of todayTasks) {
      const key = entryKey(checklistId, t.id)
      seed(key, t.id, t.duration?.minutes ?? DEFAULT_ESTIMATE)
      setTaskName(key, t.content)
    }
  }, [todayTasks, checklistId, seed, setTaskName])

  // Hydrate Execute tab from API so sessions are consistent across devices/browsers
  useEffect(() => {
    useSystemLog.getState().fetchTodaySessions().then(() => {
      const remote = useSystemLog.getState().remoteSessions
      const hydrated: Record<string, { startedAt: string; actualSeconds: number; completedAt: string | null }> = {}
      for (const [key, session] of Object.entries(remote)) {
        if (session.startedAt) {
          hydrated[key] = { startedAt: session.startedAt, actualSeconds: session.actualSeconds, completedAt: session.completedAt }
        }
      }
      hydrateFromRemote(hydrated)
    }).catch(() => {})
  }, [checklistId, hydrateFromRemote])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timerRunningKey) {
      intervalRef.current = setInterval(() => setTick((n) => n + 1), 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerRunningKey])

  // ── Notification setup / teardown ──────────────────────────────────────────
  useEffect(() => {
    const handler = (type: 'execute' | 'routine', action: import('@/platform/timerNotification').TimerNotifAction) => {
      if (type !== 'execute') return
      const store = useExecuteLog.getState()
      if (action === 'pause') store.pause()
      else if (action === 'resume') { if (store.timerRunningKey) store.play(store.timerRunningKey) }
      else if (action === 'complete') { if (store.timerRunningKey) store.markCompleted(store.timerRunningKey) }
    }
    let unsub = () => {}
    setupTimerNotifications(handler).then((fn) => { unsub = fn }).catch(() => {})
    return () => { unsub(); dismissExecuteTimerNotification().catch(() => {}) }
  }, [])

  const currentTask = orderedTasks[currentIndex]
  const currentKey = currentTask ? entryKey(checklistId, currentTask.id) : null
  const isRunning = timerRunningKey === currentKey && currentKey !== null

  const getEntry = (taskId: number): ExecuteLogEntry | undefined =>
    entries[entryKey(checklistId, taskId)]

  const currentEntry = currentTask ? getEntry(currentTask.id) : undefined
  const currentSeconds = currentEntry && currentKey
    ? liveSeconds(currentEntry, timerRunningKey, timerStartedAt, currentKey)
    : 0

  // ── Update notification every ~5 ticks while timer is active ───────────────
  const lastNotifTickRef = useRef(-99)
  useEffect(() => {
    if (Platform.OS === 'web') return
    if (!currentTask) {
      if (!timerRunningKey) dismissExecuteTimerNotification().catch(() => {})
      return
    }
    if (tick - lastNotifTickRef.current < 1 && tick !== 0) return
    lastNotifTickRef.current = tick
    showExecuteTimerNotification({
      taskName: currentTask.content,
      elapsedSec: currentSeconds,
      estimateMin: currentEntry?.estimateMin ?? null,
      isRunning,
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, isRunning, timerRunningKey])

  const completedCount = orderedTasks.filter((t) => getEntry(t.id)?.completedAt).length
  const totalActualSeconds = orderedTasks.reduce((sum, t) => {
    const e = getEntry(t.id)
    if (!e) return sum
    return sum + liveSeconds(e, timerRunningKey, timerStartedAt, entryKey(checklistId, t.id))
  }, 0)
  const totalEstimateSeconds = orderedTasks.reduce((sum, t) => {
    const e = getEntry(t.id)
    return sum + (e?.estimateMin ?? DEFAULT_ESTIMATE) * 60
  }, 0)

  function persistOrder(newIds: number[]) {
    const sortedPositions = todayByPriority.map((t) => t.position).sort((a, b) => a - b)
    newIds.forEach((id, idx) => {
      const task = todayTasks.find((t) => t.id === id)
      const newPos = sortedPositions[idx]
      if (task && task.position !== newPos) {
        updateTask({ taskId: id, payload: { position: newPos } })
      }
    })
  }

  const { muted: ttsMuted, sayElapsedTime } = useTTSStore()
  const currentTaskRef = useRef(currentTask)
  useEffect(() => { currentTaskRef.current = currentTask }, [currentTask])
  const currentSecondsRef = useRef(currentSeconds)
  useEffect(() => { currentSecondsRef.current = currentSeconds }, [currentSeconds])

  const togglePlay = () => {
    if (!currentKey) return
    if (isRunning) {
      pause()
    } else {
      play(currentKey)
      // Chrome requires speech synthesis to be called within a user gesture.
      // Calling speak() here (synchronously in the click handler) unlocks it
      // for all subsequent interval-based announcements.
      if (!ttsMuted && currentTaskRef.current && Platform.OS === 'web') {
        const name = stripMarkdown(currentTaskRef.current.content)
        const elapsed = currentSecondsRef.current
        const text = sayElapsedTime && elapsed != null
          ? `${name}. ${fmtElapsedForSpeech(elapsed)}`
          : name
        ttsSpeak(text)
      }
    }
  }
  const playTask = (index: number) => {
    if (isRunning && index !== currentIndex) { setPendingSwitch({ index, andPlay: true }); return }
    setCurrentIndex(index)
    const taskId = orderedIds[index]
    if (!taskId) return
    const key = entryKey(checklistId, taskId)
    pause()
    play(key)
  }
  const adjust = (delta: number) => { if (!currentKey || !currentEntry) return; setEstimate(currentKey, currentEntry.estimateMin + delta) }
  const setEstimateDirect = (mins: number) => { if (!currentKey) return; setEstimate(currentKey, Math.max(1, mins)) }
  const complete = () => {
    if (!currentKey) return
    markCompleted(currentKey)
    dismissExecuteTimerNotification().catch(() => {})
    const completedId = orderedIds[currentIndex]
    const newIds = [completedId, ...orderedIds.filter((id) => id !== completedId)]
    setOrderedIds(newIds)
    persistOrder(newIds)
    setCompletedStreak(s => s + 1)
    setCurrentIndex((ci) => Math.min(ci, orderedTasks.length - 2 > 0 ? orderedTasks.length - 2 : 0))
  }
  const resetCurrent = () => { if (!currentKey) return; reset(currentKey) }
  const jumpTo = (index: number) => {
    if (isRunning && index !== currentIndex) { setPendingSwitch({ index, andPlay: false }); return }
    setCurrentIndex(index)
  }
  const prevTask = () => {
    const next = Math.max(0, currentIndex - 1)
    if (isRunning && next !== currentIndex) { setPendingSwitch({ index: next, andPlay: false }); return }
    setCurrentIndex(next)
  }
  const nextTask = () => {
    const next = Math.min(orderedTasks.length - 1, currentIndex + 1)
    if (isRunning && next !== currentIndex) { setPendingSwitch({ index: next, andPlay: false }); return }
    setCurrentIndex(next)
  }
  const confirmSwitch = () => {
    if (!pendingSwitch) return
    const { index, andPlay } = pendingSwitch
    setCompletedStreak(0)
    setPendingSwitch(null)
    setCurrentIndex(index)
    if (andPlay) {
      const taskId = orderedIds[index]
      if (taskId) { pause(); play(entryKey(checklistId, taskId)) }
    }
  }
  const cancelSwitch = () => setPendingSwitch(null)

  const value: ExecCtxValue = {
    orderedTasks, orderedIds, setOrderedIds, currentIndex, setCurrentIndex,
    currentTask, currentKey, currentEntry, isRunning, currentSeconds,
    completedCount, totalActualSeconds, totalEstimateSeconds, getEntry,
    entries, timerRunningKey, timerStartedAt,
    editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    togglePlay, playTask, adjust, setEstimateDirect, complete, resetCurrent, jumpTo, prevTask, nextTask, persistOrder, updateTask,
    confirmSwitch, cancelSwitch, completedStreak, pendingSwitch,
    checklistId, onJumpToRaw, onJumpToMindmap,
  }

  return <ExecCtx.Provider value={value}>{children}</ExecCtx.Provider>
}

// ─── Horizontal Control Bar (desktop split view) ──────────────────────────────

export function ExecuteControlBar({ onClose }: { onClose?: () => void }) {
  const {
    currentTask, currentSeconds, isRunning, currentEntry,
    editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    completedCount, orderedTasks, totalActualSeconds, totalEstimateSeconds,
    currentIndex,
    togglePlay, adjust, setEstimateDirect, complete, resetCurrent, prevTask, nextTask, updateTask, checklistId,
  } = useExecCtx()

  // Broadcast active task name and elapsed time to TTS system
  useTTSBroadcast(isRunning && currentTask ? stripMarkdown(currentTask.content) : null, isRunning ? currentSeconds : null)

  const [editingEstimate, setEditingEstimate] = useState(false)
  const [estimateDraft, setEstimateDraft] = useState('')
  const [showFullScreen, setShowFullScreen] = useState(false)

  function commitEstimate() {
    const v = parseInt(estimateDraft, 10)
    if (!isNaN(v) && v > 0) setEstimateDirect(v)
    setEditingEstimate(false)
  }

  const timerColor = isRunning ? INDIGO : '#94A3B8'
  const dueDateColor = currentTask?.due
    ? (isPast(parseApiDate(currentTask.due)!) && !isToday(parseApiDate(currentTask.due)!) ? '#DC2626' : '#374151')
    : '#9ca3af'

  return (
    <View style={{
      backgroundColor: '#FFFFFF',
      borderBottomWidth: 1,
      borderBottomColor: '#F0F0F0',
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 }}>

        {/* Nav: prev/index/next */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          <Pressable hitSlop={10} onPress={prevTask} style={{ opacity: currentIndex === 0 ? 0.2 : 1, padding: 4 }}>
            <ChevronLeft size={18} color="#6B7280" />
          </Pressable>
          <Text style={{ fontSize: 11, color: '#9ca3af', minWidth: 32, textAlign: 'center', fontWeight: '500' }}>
            {orderedTasks.length > 0 ? `${currentIndex + 1}/${orderedTasks.length}` : '—'}
          </Text>
          <Pressable hitSlop={10} onPress={nextTask} style={{ opacity: currentIndex >= orderedTasks.length - 1 ? 0.2 : 1, padding: 4 }}>
            <ChevronRight size={18} color="#6B7280" />
          </Pressable>
        </View>

        {/* Timer + fullscreen toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{
            backgroundColor: isRunning ? '#EEF2FF' : '#F8FAFC',
            borderRadius: 10,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}>
            <FlipClock totalSeconds={currentSeconds} color={timerColor} size="sm" />
          </View>
          <Pressable hitSlop={10} onPress={() => setShowFullScreen(true)} style={{ padding: 4, opacity: 0.45 }}>
            <Maximize2 size={13} color="#374151" />
          </Pressable>
        </View>

        {showFullScreen && <FullScreenCounterModal onClose={() => setShowFullScreen(false)} />}

        {/* Task title */}
        <View style={{ flex: 1, minWidth: 0 }}>
          {currentTask ? (
            editingTitle ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  autoFocus blurOnSubmit
                  onSubmitEditing={() => { setEditingTitle(false); const c = titleDraft.trim(); if (c && c !== currentTask.content) updateTask({ taskId: currentTask.id, payload: { content: c } }) }}
                  onBlur={() => { setEditingTitle(false); const c = titleDraft.trim(); if (c && c !== currentTask.content) updateTask({ taskId: currentTask.id, payload: { content: c } }) }}
                  style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111', borderBottomWidth: 1.5, borderBottomColor: BLUE, paddingBottom: 2 }}
                />
                <Pressable hitSlop={8} onPress={() => { setEditingTitle(false); setTitleDraft(currentTask.content) }}>
                  <X size={13} color="#9ca3af" />
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 2 }}>
                <Pressable onPress={() => { setTitleDraft(currentTask.content); setEditingTitle(true) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 20 }}>
                    <InlineMarkdown content={currentTask.content} />
                  </Text>
                  <Pencil size={11} color="#D1D5DB" />
                </Pressable>
                {/* Sub-row: chips */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                  {/* Est */}
                  {currentEntry && (
                    editingEstimate ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: BLUE }}>
                        <Text style={{ fontSize: 10, color: '#6B7280' }}>Est </Text>
                        <TextInput value={estimateDraft} onChangeText={setEstimateDraft} keyboardType="number-pad" autoFocus selectTextOnFocus onSubmitEditing={commitEstimate} onBlur={commitEstimate} style={{ fontSize: 10, fontWeight: '600', color: '#111', minWidth: 18, maxWidth: 36 }} />
                        <Text style={{ fontSize: 10, color: '#6B7280' }}>m</Text>
                      </View>
                    ) : (
                      <Pressable onPress={() => { setEstimateDraft(String(currentEntry.estimateMin)); setEditingEstimate(true) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}>
                        <Text style={{ fontSize: 10, color: '#6B7280' }}>Est {currentEntry.estimateMin}m</Text>
                      </Pressable>
                    )
                  )}
                  {/* Date */}
                  {currentTask && (
                    <Pressable onPress={() => { setShowDatePicker(v => !v); setShowPriorityPicker(false) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: showDatePicker ? BLUE : '#E5E7EB', backgroundColor: showDatePicker ? '#EEF2FF' : 'transparent' }}>
                      <Calendar size={9} color={dueDateColor} />
                      <Text style={{ fontSize: 10, color: dueDateColor, fontWeight: '500' }}>{currentTask.due ? humanizeDueDate(currentTask.due) : 'Date'}</Text>
                    </Pressable>
                  )}
                  {/* Priority */}
                  {currentTask && (
                    <Pressable onPress={() => { setShowPriorityPicker(v => !v); setShowDatePicker(false) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: currentTask.priority > 0 && currentTask.priority <= 10 ? (priorityRowBg(currentTask.priority) ?? '#F3F4F6') : '#F3F4F6', borderWidth: 1, borderColor: showPriorityPicker ? BLUE : 'transparent' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: currentTask.priority > 0 && currentTask.priority <= 10 ? priorityTextColor(currentTask.priority) : '#9ca3af' }}>
                        {currentTask.priority > 0 && currentTask.priority <= 10 ? priorityDisplay(currentTask.priority) : 'P?'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )
          ) : (
            <Text style={{ fontSize: 13, color: '#9ca3af' }}>No tasks today</Text>
          )}
        </View>

        {/* Controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable hitSlop={10} onPress={resetCurrent} style={{ padding: 6 }}>
            <RotateCcw size={16} color="#C4C4C4" />
          </Pressable>
          <Pressable hitSlop={10} onPress={() => adjust(-ESTIMATE_STEP)} style={{ padding: 4 }}>
            <Minus size={20} color="#9CA3AF" />
          </Pressable>
          <Pressable onPress={togglePlay} style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: isRunning ? INDIGO : '#1E293B',
            alignItems: 'center', justifyContent: 'center',
            shadowColor: isRunning ? INDIGO : '#000',
            shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
            elevation: 4,
          }}>
            {isRunning ? <Pause size={20} color="white" /> : <Play size={20} color="white" />}
          </Pressable>
          <Pressable hitSlop={10} onPress={() => adjust(ESTIMATE_STEP)} style={{ padding: 4 }}>
            <Plus size={20} color="#9CA3AF" />
          </Pressable>
          {currentTask && (
            <>
              <Pressable
                hitSlop={8}
                onPress={() => { updateTask({ taskId: currentTask.id, payload: { due_date: format(addDays(new Date(), 1), 'yyyy-MM-dd') } }); nextTask() }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}
              >
                <Sunrise size={12} color="#8B5CF6" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#8B5CF6' }}>Tomorrow</Text>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => { updateTask({ taskId: currentTask.id, payload: { priority: 9 } }); nextTask() }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}
              >
                <ArrowDown size={12} color="#7c3aed" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>De-pri</Text>
              </Pressable>
            </>
          )}
          {onClose && (
            <Pressable hitSlop={10} onPress={onClose} style={{ padding: 4, marginLeft: 2 }}>
              <X size={16} color="#C4C4C4" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Pickers */}
      {showDatePicker && currentTask && (
        <QuickDatePicker
          taskId={currentTask.id}
          onSelect={(d) => { setShowDatePicker(false); updateTask({ taskId: currentTask.id, payload: { due_date: d } }) }}
          onClose={() => setShowDatePicker(false)}
          isMobile
        />
      )}
      {showPriorityPicker && currentTask && (
        <BottomSheet open onClose={() => setShowPriorityPicker(false)} title="Set Priority">
          <PriorityPicker value={currentTask.priority} onChange={(p) => { setShowPriorityPicker(false); updateTask({ taskId: currentTask.id, payload: { priority: p } }) }} />
        </BottomSheet>
      )}
    </View>
  )
}

// ─── Today's sessions summary card ───────────────────────────────────────────

export function TodaySessionsCard() {
  const { entries, timerRunningKey, timerStartedAt } = useExecCtx()
  const remoteSessions = useSystemLog((s) => s.remoteSessions)
  const { sessionCount, sessionTotalSeconds } = useMemo(() => {
    return summarizeTodaySessionsFromLogSource(entries, remoteSessions, timerRunningKey, timerStartedAt)
  }, [entries, remoteSessions, timerRunningKey, timerStartedAt])

  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', gap: 8, borderWidth: 1, borderColor: '#F1F5F9' }}>
      <Clock size={13} color={INDIGO} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>
        {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
      </Text>
      <Text style={{ fontSize: 12, color: '#94A3B8' }}>·</Text>
      <Text style={{ fontSize: 12, color: '#64748B' }}>{fmtDuration(sessionTotalSeconds)}</Text>
    </View>
  )
}

// ─── Task list panel (shared between mobile and desktop) ─────────────────────

export function ExecuteTaskList() {
  const {
    orderedTasks, orderedIds, setOrderedIds, currentIndex, setCurrentIndex,
    isRunning, getEntry, entries, timerRunningKey, timerStartedAt,
    togglePlay, playTask, jumpTo, persistOrder, checklistId, onJumpToRaw, onJumpToMindmap, updateTask,
  } = useExecCtx()

  // Per-row date/priority picker state — local to this panel
  const [dateEditTaskId, setDateEditTaskId] = useState<number | null>(null)
  const [priorityEditTaskId, setPriorityEditTaskId] = useState<number | null>(null)
  const dateEditTask = orderedTasks.find((t) => t.id === dateEditTaskId) ?? null
  const priorityEditTask = orderedTasks.find((t) => t.id === priorityEditTaskId) ?? null

  // Drag state — local to this panel
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [insertIdx, setInsertIdx] = useState<number | null>(null)
  const draggingIdxRef = useRef<number | null>(null)
  const insertIdxRef = useRef<number | null>(null)
  const cardDomRefs = useRef<Map<number, HTMLElement>>(new Map())
  const nativeRowRefs = useRef<Map<number, View>>(new Map())

  // Multi-select state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const lastClickedIdx = useRef<number | null>(null)

  // Focusable left-panel ref (web only)
  const leftPanelRef = useRef<HTMLDivElement | null>(null)

  const focusLeftPanel = () => {
    if (Platform.OS === 'web') leftPanelRef.current?.focus()
  }

  // Column mode: align chips into fixed columns when the list panel is wide (desktop, no side panel)
  const [panelWidth, setPanelWidth] = useState(0)
  const columnMode = Platform.OS === 'web' && panelWidth >= COLUMN_MODE_MIN_WIDTH
  const col = (w: number, node: ReactNode): ReactNode =>
    columnMode ? <View style={{ width: w, alignItems: 'flex-start' }}>{node}</View> : node

  function moveSelectionUp(ids: number[], sel: Set<number>): number[] {
    const sorted = [...sel].sort((a, b) => a - b)
    if (sorted[0] === 0) return ids
    const result = [...ids]
    const displaced = result.splice(sorted[0] - 1, 1)[0]
    result.splice(sorted[sorted.length - 1], 0, displaced)
    return result
  }

  function moveSelectionDown(ids: number[], sel: Set<number>): number[] {
    const sorted = [...sel].sort((a, b) => a - b)
    if (sorted[sorted.length - 1] === ids.length - 1) return ids
    const result = [...ids]
    const displaced = result.splice(sorted[sorted.length - 1] + 1, 1)[0]
    result.splice(sorted[0], 0, displaced)
    return result
  }

  function handleCardMouseDown(e: React.MouseEvent, index: number) {
    focusLeftPanel()
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      setSelectedIndices((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      })
      lastClickedIdx.current = index
    } else if (e.shiftKey && lastClickedIdx.current !== null) {
      e.preventDefault()
      const from = Math.min(lastClickedIdx.current, index)
      const to = Math.max(lastClickedIdx.current, index)
      setSelectedIndices(new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i)))
    } else {
      setSelectedIndices(new Set())
      lastClickedIdx.current = index
    }
  }

  function onLeftPanelKeyDown(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

    if (e.key === 'Escape') { setSelectedIndices(new Set()); return }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()

    if (selectedIndices.size > 0) {
      const sorted = [...selectedIndices].sort((a, b) => a - b)
      if (e.key === 'ArrowUp') {
        if (sorted[0] === 0) return
        const newIds = moveSelectionUp(orderedIds, selectedIndices)
        setOrderedIds(newIds)
        persistOrder(newIds)
        setSelectedIndices(new Set([...selectedIndices].map((i) => i - 1)))
        setCurrentIndex((ci) => (selectedIndices.has(ci) ? ci - 1 : ci))
      } else {
        if (sorted[sorted.length - 1] === orderedTasks.length - 1) return
        const newIds = moveSelectionDown(orderedIds, selectedIndices)
        setOrderedIds(newIds)
        persistOrder(newIds)
        setSelectedIndices(new Set([...selectedIndices].map((i) => i + 1)))
        setCurrentIndex((ci) => (selectedIndices.has(ci) ? ci + 1 : ci))
      }
    } else if (e.metaKey || e.ctrlKey) {
      const delta = e.key === 'ArrowUp' ? -1 : 1
      const next = currentIndex + delta
      if (next < 0 || next >= orderedTasks.length) return
      const newIds = [...orderedIds]
      ;[newIds[currentIndex], newIds[next]] = [newIds[next], newIds[currentIndex]]
      setOrderedIds(newIds)
      persistOrder(newIds)
      setCurrentIndex(next)
    } else {
      setCurrentIndex((ci) => {
        const delta = e.key === 'ArrowUp' ? -1 : 1
        const next = ci + delta
        return next < 0 || next >= orderedTasks.length ? ci : next
      })
    }
  }

  function commitReorder() {
    const from = draggingIdxRef.current
    const to = insertIdxRef.current
    draggingIdxRef.current = null
    insertIdxRef.current = null
    setDraggingIdx(null)
    setInsertIdx(null)
    if (from === null || to === null || from === to) return
    const newIds = reorder(orderedIds, from, to)
    setOrderedIds(newIds)
    persistOrder(newIds)
    setCurrentIndex((ci) => {
      const len = orderedTasks.length
      const idxMap = reorder(Array.from({ length: len }, (_, i) => i), from, to)
      const ni = idxMap.indexOf(ci)
      return ni >= 0 ? ni : ci
    })
  }

  function onGripPointerDown(e: React.PointerEvent, idx: number) {
    e.preventDefault()
    draggingIdxRef.current = idx
    insertIdxRef.current = idx
    setDraggingIdx(idx)
    setInsertIdx(idx)

    function onMove(ev: PointerEvent) {
      const els = document.elementsFromPoint(ev.clientX, ev.clientY)
      for (const el of els) {
        const raw = (el as HTMLElement).dataset?.executeIdx
        if (raw === undefined) continue
        const cardIdx = parseInt(raw)
        const rect = (el as HTMLElement).getBoundingClientRect()
        const ni = ev.clientY < rect.top + rect.height / 2 ? cardIdx : cardIdx + 1
        insertIdxRef.current = ni
        setInsertIdx(ni)
        return
      }
    }

    function onUp() {
      commitReorder()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function computeInsertFromAbsoluteY(absoluteY: number, measurements: Array<{ y: number; h: number }>) {
    for (let i = 0; i < measurements.length; i++) {
      if (absoluteY < measurements[i].y + measurements[i].h / 2) return i
    }
    return measurements.length
  }

  function makeNativeGesture(idx: number) {
    return Gesture.Pan()
      .activateAfterLongPress(400)
      .runOnJS(true)
      .onStart((e) => {
        hapticMedium()
        draggingIdxRef.current = idx
        insertIdxRef.current = idx
        setDraggingIdx(idx)
        setInsertIdx(idx)
        const len = nativeRowRefs.current.size
        const measurements: Array<{ y: number; h: number }> = Array(len).fill({ y: 0, h: 0 })
        const promises = Array.from({ length: len }, (_, i) => new Promise<void>((resolve) => {
          const ref = nativeRowRefs.current.get(i)
          if (!ref) { resolve(); return }
          ref.measureInWindow((_x, y, _w, h) => { measurements[i] = { y, h }; resolve() })
        }))
        Promise.all(promises).then(() => {
          const ni = computeInsertFromAbsoluteY(e.absoluteY, measurements)
          insertIdxRef.current = ni
          setInsertIdx(ni)
          ;(makeNativeGesture as unknown as { _meas: typeof measurements })._meas = measurements
        })
      })
      .onUpdate((e) => {
        const meas = (makeNativeGesture as unknown as { _meas: Array<{ y: number; h: number }> })._meas
        if (!meas) return
        const ni = computeInsertFromAbsoluteY(e.absoluteY, meas)
        insertIdxRef.current = ni
        setInsertIdx(ni)
      })
      .onEnd(() => commitReorder())
      .onFinalize(() => {
        if (draggingIdxRef.current !== null) {
          draggingIdxRef.current = null
          insertIdxRef.current = null
          setDraggingIdx(null)
          setInsertIdx(null)
        }
      })
  }

  // Group-by toggle
  const [groupBy, setGroupBy] = useState<'priority' | 'time'>('priority')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  // Build priority groups preserving flat orderedTasks indices for drag/keyboard
  type PriBucket = 'high' | 'medium' | 'low' | 'tbd'
  const PRI_BUCKETS: PriBucket[] = ['high', 'medium', 'low', 'tbd']
  const priorityGroups = useMemo(() => {
    const buckets: Record<PriBucket, { task: TaskNode; index: number }[]> = { high: [], medium: [], low: [], tbd: [] }
    orderedTasks.forEach((t, index) => buckets[classifyPriority(t.priority)].push({ task: t, index }))
    return PRI_BUCKETS.filter((b) => buckets[b].length > 0).map((b) => ({ bucket: b, items: buckets[b] }))
  }, [orderedTasks])

  // Build time groups
  const timeGroups = useMemo(() => {
    const bucketMap = new Map<string, { task: TaskNode; index: number }[]>()
    for (const q of TIME_QUADRANTS) bucketMap.set(q.bucket, [])
    orderedTasks.forEach((t, index) => {
      const b = classifyTime(t)
      bucketMap.get(b)?.push({ task: t, index })
    })
    return TIME_QUADRANTS.filter((q) => (bucketMap.get(q.bucket)?.length ?? 0) > 0)
      .map((q) => ({ ...q, items: bucketMap.get(q.bucket)! }))
  }, [orderedTasks])

  // Shared group header renderer
  function renderGroupHeader(key: string, label: string, sublabel: string, color: string, bg: string, count: number) {
    const collapsed = collapsedGroups.has(key)
    if (Platform.OS === 'web') {
      return (
        <div
          key={`hdr-${key}`}
          style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', userSelect: 'none', backgroundColor: bg, borderBottom: collapsed ? 'none' : '1px solid #F3F4F6' }}
          onClick={() => toggleGroup(key)}
        >
          <div style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: '0.2px' }}>{label.toUpperCase()}</span>
            <span style={{ fontSize: 11, color, opacity: 0.65 }}>{sublabel}</span>
          </span>
          <span style={{ fontSize: 13, color: '#9ca3af', marginRight: 4 }}>{count}</span>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>{collapsed ? '›' : '⌄'}</span>
        </div>
      )
    }
    return (
      <Pressable
        key={`hdr-${key}`}
        onPress={() => toggleGroup(key)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: bg, borderBottomWidth: collapsed ? 0 : 1, borderBottomColor: '#F3F4F6' }}
      >
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color, letterSpacing: 0.2 }}>{label.toUpperCase()}</Text>
          <Text style={{ fontSize: 11, color, opacity: 0.65 }}>{sublabel}</Text>
        </View>
        <Text style={{ fontSize: 13, color: '#9ca3af', marginRight: 4 }}>{count}</Text>
        <ChevronRight size={13} color="#9ca3af" style={{ transform: [{ rotate: collapsed ? '0deg' : '90deg' }] }} />
      </Pressable>
    )
  }

  // Group-by toggle strip
  const groupByToggle = (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 14 }}>
      {(['priority', 'time'] as const).map((v) => {
        const active = groupBy === v
        return (
          <Pressable
            key={v}
            onPress={() => { setGroupBy(v); setCollapsedGroups(new Set()) }}
            style={{ paddingVertical: 8, paddingHorizontal: 2, marginRight: 16, borderBottomWidth: 2, borderBottomColor: active ? '#E8632A' : 'transparent' }}
          >
            <Text style={{ fontSize: 12, fontWeight: active ? '600' : '400', color: active ? '#E8632A' : '#6B7280' }}>
              {v === 'priority' ? 'By Priority' : 'By Time'}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )

  const listContent = (
    <ScrollView
      contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
      scrollEnabled={draggingIdx === null}
      style={{ backgroundColor: '#FAFAFA' }}
      onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}
    >
      {(groupBy === 'time'
        ? timeGroups.map(({ bucket, label, sublabel, color, bg, items }) => ({ key: bucket, label, sublabel, color, bg, items }))
        : priorityGroups.map(({ bucket, items }) => ({
            key: bucket,
            label: PRIORITY_LABEL[bucket],
            sublabel: PRIORITY_META[bucket].sublabel,
            color: PRIORITY_COLOR[bucket],
            bg: PRIORITY_META[bucket].bg,
            items,
          }))
      ).map(({ key, label, sublabel, color, bg, items }) => {
        const collapsed = collapsedGroups.has(key)
        const header = renderGroupHeader(key, label, sublabel, color, bg, items.length)
        const rows = collapsed ? null : items.map(({ task: t, index }) => {
          const entry = getEntry(t.id)
          const isDone = !!entry?.completedAt
          const hasExecution = !!entry && (entry.actualSeconds > 0 || !!entry.completedAt)
          const isCurrent = index === currentIndex
          const isSelected = selectedIndices.has(index)
          const isDragging = draggingIdx === index
          const showDropBefore = insertIdx !== null && insertIdx === index && draggingIdx !== null && draggingIdx !== index && draggingIdx !== index - 1

          const dueGroup = classifyTask(t)
          const dueTheme = DATE_GROUP_THEME[dueGroup]
          const bgColor = isCurrent ? '#E0E7FF' : dueTheme.bgLight
          const k = entryKey(checklistId, t.id)
          const elapsed = entry ? liveSeconds(entry, timerRunningKey, timerStartedAt, k) : 0
          const timeLabel = isDone || elapsed > 0 ? fmtMins(elapsed) : `${entry?.estimateMin ?? DEFAULT_ESTIMATE}m`

          const cardInner = (
            <Pressable
              onPress={() => { if (draggingIdx === null) jumpTo(index) }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 10, paddingVertical: 7,
                borderRadius: 8, marginHorizontal: 4, marginVertical: 2,
                backgroundColor: bgColor, opacity: isDragging ? 0.3 : 1,
                borderLeftWidth: 3, borderLeftColor: isCurrent ? BLUE : dueTheme.stroke,
              }}
            >
              {/* Drag handle */}
              {Platform.OS === 'web' ? (
                <div onPointerDown={(e) => onGripPointerDown(e, index)} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', opacity: 0.3 }}>
                  <GripVertical size={13} color="#9CA3AF" />
                </div>
              ) : (
                <GestureDetector gesture={makeNativeGesture(index)}>
                  <View hitSlop={8} style={{ opacity: 0.3 }}><GripVertical size={13} color="#9CA3AF" /></View>
                </GestureDetector>
              )}
              {/* Play/pause button */}
              <Pressable
                hitSlop={6}
                onPress={(e) => {
                  e.stopPropagation?.()
                  if (isCurrent) togglePlay()
                  else playTask(index)
                }}
                style={{
                  width: 26, height: 26, borderRadius: 13,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isCurrent ? BLUE : (hasExecution && !isDone ? '#EEF2FF' : '#F3F4F6'),
                }}
              >
                {isCurrent && isRunning
                  ? <Pause size={11} color="white" fill="white" />
                  : <Play size={11} color={isCurrent ? 'white' : (hasExecution && !isDone ? BLUE : '#D1D5DB')} fill={isCurrent ? 'white' : (hasExecution && !isDone ? BLUE : '#D1D5DB')} />
                }
              </Pressable>
              {/* Row index */}
              <Text style={{ fontSize: 10, color: '#C4C4C4', fontWeight: '500', width: 16, textAlign: 'right' }}>{index + 1}</Text>
              {/* Status icon — only show when done */}
              {isDone && <CheckCircle2 size={15} color="#22c55e" />}
              {/* Title */}
              <Text style={{
                flex: 1, fontSize: 13, lineHeight: 18,
                color: isDone ? '#C4C4C4' : isCurrent ? '#111827' : '#4B5563',
                textDecorationLine: isDone ? 'line-through' : 'none',
                fontWeight: isCurrent ? '600' : '400',
              }}>
                <InlineMarkdown content={t.content} />
              </Text>
              {/* Tags column (desktop only) */}
              {columnMode && (
                <View style={{ width: COL_TAGS }}>
                  {t.tags_as_text ? (
                    <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '500', color: BLUE }}>
                      {t.tags_as_text.split(/\s+/).filter(Boolean).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')}
                    </Text>
                  ) : null}
                </View>
              )}
              {/* Time badge */}
              {col(COL_TIME, (
                <View style={{
                  paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
                  backgroundColor: isDone ? '#F0FDF4' : elapsed > 0 ? '#EEF2FF' : '#F9FAFB',
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: isDone ? '#16A34A' : elapsed > 0 ? BLUE : '#9CA3AF' }}>
                    {timeLabel}
                  </Text>
                </View>
              ))}
              {/* Date chip */}
              {col(COL_DATE, (
                <Pressable
                  hitSlop={6}
                  onPress={(e) => { e.stopPropagation?.(); setPriorityEditTaskId(null); setDateEditTaskId(t.id) }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 2,
                    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
                    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
                  }}
                >
                  <Calendar
                    size={9}
                    color={t.due ? (isPast(parseApiDate(t.due)!) && !isToday(parseApiDate(t.due)!) ? '#DC2626' : '#6B7280') : '#9ca3af'}
                  />
                  <Text style={{
                    fontSize: 9, fontWeight: '500',
                    color: t.due ? (isPast(parseApiDate(t.due)!) && !isToday(parseApiDate(t.due)!) ? '#DC2626' : '#6B7280') : '#9ca3af',
                  }}>
                    {t.due ? humanizeDueDate(t.due) : 'Date'}
                  </Text>
                </Pressable>
              ))}
              {/* Priority chip */}
              {col(COL_PRI, (
                <Pressable
                  hitSlop={6}
                  onPress={(e) => { e.stopPropagation?.(); setDateEditTaskId(null); setPriorityEditTaskId(t.id) }}
                  style={{
                    borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
                    backgroundColor: t.priority > 0 && t.priority <= 10 ? (priorityRowBg(t.priority) ?? '#F3F4F6') : '#F3F4F6',
                  }}
                >
                  <Text style={{
                    fontSize: 9, fontWeight: '700',
                    color: t.priority > 0 && t.priority <= 10 ? priorityTextColor(t.priority) : '#9ca3af',
                  }}>
                    {t.priority > 0 && t.priority <= 10 ? priorityDisplay(t.priority) : 'P?'}
                  </Text>
                </Pressable>
              ))}
              {onJumpToRaw && (
                <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); onJumpToRaw(t.id) }}>
                  <AlignLeft size={12} color="#D1D5DB" />
                </Pressable>
              )}
              {onJumpToMindmap && (
                <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); onJumpToMindmap(t.id) }}>
                  <Network size={12} color="#D1D5DB" />
                </Pressable>
              )}
            </Pressable>
          )

          if (Platform.OS === 'web') {
            return (
              <div
                key={t.id}
                data-execute-idx={index}
                ref={(el) => { if (el) cardDomRefs.current.set(index, el); else cardDomRefs.current.delete(index) }}
                onMouseDown={(e) => handleCardMouseDown(e, index)}
              >
                {showDropBefore && <div className="execute-drop-indicator" />}
                {cardInner}
              </div>
            )
          }

          return (
            <View key={t.id} ref={(r) => { if (r) nativeRowRefs.current.set(index, r); else nativeRowRefs.current.delete(index) }}>
              {showDropBefore && <View style={{ height: 2, backgroundColor: BLUE, borderRadius: 1, marginBottom: 6 }} />}
              {cardInner}
            </View>
          )
        })

        if (Platform.OS === 'web') {
          return <div key={key}>{header}{rows}</div>
        }
        return <View key={key}>{header}{rows}</View>
      })}

      {insertIdx === orderedTasks.length && draggingIdx !== null && draggingIdx !== orderedTasks.length - 1 && (
        <View style={{ height: 2, backgroundColor: BLUE, borderRadius: 1, marginHorizontal: 4, marginTop: 10 }} />
      )}
    </ScrollView>
  )

  const pickers = (
    <>
      {dateEditTask && (
        <QuickDatePicker
          taskId={dateEditTask.id}
          onSelect={(d) => { setDateEditTaskId(null); updateTask({ taskId: dateEditTask.id, payload: { due_date: d } }) }}
          onClose={() => setDateEditTaskId(null)}
          isMobile
        />
      )}
      {priorityEditTask && (
        <BottomSheet open onClose={() => setPriorityEditTaskId(null)} title="Set Priority">
          <PriorityPicker
            value={priorityEditTask.priority}
            onChange={(p) => { setPriorityEditTaskId(null); updateTask({ taskId: priorityEditTask.id, payload: { priority: p } }) }}
          />
        </BottomSheet>
      )}
    </>
  )

  const columnLabelStyle = { fontSize: 9, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 } as const
  const columnHeader = (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 10, marginHorizontal: 4, paddingTop: 8, paddingBottom: 5,
      backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#EDEFF2',
    }}>
      {/* Spacers mirroring each row's leading controls so labels sit above their columns */}
      <View style={{ width: 13 }} />
      <View style={{ width: 26 }} />
      <View style={{ width: 16 }} />
      <View style={{ width: 15 }} />
      <Text style={[columnLabelStyle, { flex: 1 }]}>TASK</Text>
      <View style={{ width: COL_TAGS }}><Text style={columnLabelStyle}>TAGS</Text></View>
      <View style={{ width: COL_TIME }}><Text style={columnLabelStyle}>TIME</Text></View>
      <View style={{ width: COL_DATE }}><Text style={columnLabelStyle}>DUE</Text></View>
      <View style={{ width: COL_PRI }}><Text style={columnLabelStyle}>PRI</Text></View>
      {onJumpToRaw && <View style={{ width: 12 }} />}
      {onJumpToMindmap && <View style={{ width: 12 }} />}
    </View>
  )

  if (Platform.OS === 'web') {
    return (
      <>
        <div
          ref={leftPanelRef}
          tabIndex={0}
          onKeyDown={onLeftPanelKeyDown}
          className="execute-left-panel"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {groupByToggle}
          {columnMode && columnHeader}
          {listContent}
        </div>
        {pickers}
      </>
    )
  }

  return <>{groupByToggle}{listContent}{pickers}</>
}

// ─── Full standalone view (mobile / non-split desktop) ───────────────────────

interface ExecuteModeViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  onClose: () => void
  onJumpToRaw?: (taskId: number) => void
  onJumpToMindmap?: (taskId: number) => void
  onSwitchToLog?: () => void
}

// ─── Animated day progress bar ────────────────────────────────────────────────

export function ExecuteModeView({ tasks, checklistId, onClose, onJumpToRaw, onJumpToMindmap, onSwitchToLog }: ExecuteModeViewProps) {
  return (
    <ExecuteStateProvider tasks={tasks} checklistId={checklistId} onJumpToRaw={onJumpToRaw} onJumpToMindmap={onJumpToMindmap}>
      <ExecuteViewContent onClose={onClose} onSwitchToLog={onSwitchToLog} />
    </ExecuteStateProvider>
  )
}

const POMO_WORK_SECS = 25 * 60
const POMO_BREAK_SECS = 5 * 60

export function ExecuteViewContent({ onClose, onSwitchToLog }: { onClose: () => void; onSwitchToLog?: () => void }) {
  const {
    currentTask, currentSeconds, isRunning, currentEntry, orderedTasks,
    currentIndex, jumpTo,
    editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    togglePlay, adjust, setEstimateDirect, complete, resetCurrent, prevTask, nextTask, updateTask, checklistId,
    onJumpToRaw, onJumpToMindmap, entries, timerRunningKey, timerStartedAt,
    confirmSwitch, cancelSwitch, completedStreak, pendingSwitch,
  } = useExecCtx()
  const remoteSessions = useSystemLog((s) => s.remoteSessions)
  useTTSBroadcast(isRunning && currentTask ? stripMarkdown(currentTask.content) : null, isRunning ? currentSeconds : null)

  const { width } = useWindowDimensions()
  const isMobile = width < 768

  const { sessionCount, sessionTotalSeconds } = useMemo(() => {
    return summarizeTodaySessionsFromLogSource(entries, remoteSessions, timerRunningKey, timerStartedAt)
  }, [entries, remoteSessions, timerRunningKey, timerStartedAt])

  const [editingEstimate, setEditingEstimate] = useState(false)
  const [estimateDraft, setEstimateDraft] = useState('')
  const [showFullScreen, setShowFullScreen] = useState(false)

  // ── Intention (feature #5) ─────────────────────────────────────────────────
  const todayKey = useMemo(() => `focus_intention_${format(new Date(), 'yyyy-MM-dd')}`, [])
  const [showIntention, setShowIntention] = useState(() => {
    try { return !localStorage.getItem(`focus_intention_${format(new Date(), 'yyyy-MM-dd')}`) } catch { return false }
  })
  const [intentionDraft, setIntentionDraft] = useState('')
  const savedIntention = (() => { try { return localStorage.getItem(todayKey) ?? '' } catch { return '' } })()

  function submitIntention() {
    const text = intentionDraft.trim()
    try { if (text) localStorage.setItem(todayKey, text) } catch { /* ignore */ }
    setShowIntention(false)
    if (text) {
      const idx = orderedTasks.findIndex(t => t.content.toLowerCase().includes(text.toLowerCase()))
      if (idx >= 0) jumpTo(idx)
    }
  }

  // ── Focus mode (feature #2) ────────────────────────────────────────────────
  const [focusMode, setFocusMode] = useState(false)

  // ── Pomodoro (feature #1) ──────────────────────────────────────────────────
  const [pomodoroOn, setPomodoroOn] = useState(false)
  const [pomodoroSecs, setPomodoroSecs] = useState(POMO_WORK_SECS)
  const [pomodoroIsBreak, setPomodoroIsBreak] = useState(false)
  const isRunningRef = useRef(isRunning)
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])
  const togglePlayRef = useRef(togglePlay)
  useEffect(() => { togglePlayRef.current = togglePlay }, [togglePlay])

  // Tick down when work+running or during break
  useEffect(() => {
    if (!pomodoroOn || (!pomodoroIsBreak && !isRunning)) return
    const id = setInterval(() => setPomodoroSecs(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [pomodoroOn, pomodoroIsBreak, isRunning])

  // Phase transition when countdown hits 0
  useEffect(() => {
    if (!pomodoroOn || pomodoroSecs > 0) return
    if (!pomodoroIsBreak) {
      if (isRunningRef.current) togglePlayRef.current()
      setPomodoroIsBreak(true)
      setPomodoroSecs(POMO_BREAK_SECS)
    } else {
      setPomodoroIsBreak(false)
      setPomodoroSecs(POMO_WORK_SECS)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoroSecs, pomodoroOn])

  function togglePomodoro() {
    if (pomodoroOn) { setPomodoroIsBreak(false); setPomodoroSecs(POMO_WORK_SECS) }
    setPomodoroOn(p => !p)
  }
  function skipBreak() { setPomodoroIsBreak(false); setPomodoroSecs(POMO_WORK_SECS) }

  function commitEstimate() {
    const v = parseInt(estimateDraft, 10)
    if (!isNaN(v) && v > 0) setEstimateDirect(v)
    setEditingEstimate(false)
  }

  if (orderedTasks.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-2 p-8" style={{ backgroundColor: '#F0F2F5' }}>
        <Text className="text-sm text-gray-400">No tasks due today.</Text>
      </View>
    )
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F2F5' }}>
      {/* Fixed header card */}
      <View>
        <View
          style={{
            marginHorizontal: 12,
            marginTop: 8,
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 10,
            gap: 6,
            backgroundColor: 'white',
            borderWidth: 1.5,
            borderColor: isRunning ? INDIGO : '#E5E7EB',
            shadowColor: isRunning ? INDIGO : '#000',
            shadowOpacity: isRunning ? 0.10 : 0.03,
            shadowRadius: isRunning ? 8 : 3,
            shadowOffset: { width: 0, height: 2 },
            elevation: isRunning ? 3 : 1,
          }}
        >
          {/* Row 1: nav + clock + title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable hitSlop={12} onPress={prevTask} style={{ opacity: currentIndex === 0 ? 0.25 : 1 }}>
              <ChevronLeft size={18} color="#6B7280" />
            </Pressable>

            {/* Clock (compact) */}
            <Pressable onPress={() => setShowFullScreen(true)}>
              <View style={{ backgroundColor: isRunning ? '#EEF2FF' : '#F8FAFC', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
                <FlipClock totalSeconds={currentSeconds} color={isRunning ? INDIGO : '#94A3B8'} size="sm" />
              </View>
            </Pressable>

            {/* Title */}
            <View style={{ flex: 1, minWidth: 0 }}>
              {currentTask && (
                editingTitle ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TextInput
                      value={titleDraft}
                      onChangeText={setTitleDraft}
                      autoFocus
                      blurOnSubmit
                      onSubmitEditing={() => {
                        setEditingTitle(false)
                        const content = titleDraft.trim()
                        if (content && content !== currentTask.content) {
                          updateTask({ taskId: currentTask.id, payload: { content } })
                        }
                      }}
                      onBlur={() => {
                        setEditingTitle(false)
                        const content = titleDraft.trim()
                        if (content && content !== currentTask.content) {
                          updateTask({ taskId: currentTask.id, payload: { content } })
                        }
                      }}
                      style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#222', borderBottomWidth: 1, borderBottomColor: BLUE, paddingBottom: 1 }}
                    />
                    <Pressable hitSlop={8} onPress={() => { setEditingTitle(false); setTitleDraft(currentTask.content) }}>
                      <X size={14} color="#9ca3af" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => { setTitleDraft(currentTask.content); setEditingTitle(true) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 19 }} numberOfLines={2}>
                      <InlineMarkdown content={currentTask.content} />
                    </Text>
                    <Pencil size={11} color="#D1D5DB" />
                  </Pressable>
                )
              )}
            </View>

            {/* Position pill + next */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#9ca3af' }}>{currentIndex + 1}/{orderedTasks.length}</Text>
              <Pressable hitSlop={12} onPress={nextTask} style={{ opacity: currentIndex >= orderedTasks.length - 1 ? 0.25 : 1 }}>
                <ChevronRight size={18} color="#6B7280" />
              </Pressable>
            </View>
          </View>

          {showFullScreen && <FullScreenCounterModal onClose={() => setShowFullScreen(false)} />}

          {/* Row 2: chips + controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Chips (scrollable) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, flexDirection: 'row', alignItems: 'center' }} style={{ flex: 1 }}>

              {/* Estimate */}
              {currentEntry && (
                editingEstimate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: BLUE }}>
                    <TextInput
                      value={estimateDraft}
                      onChangeText={setEstimateDraft}
                      keyboardType="number-pad"
                      autoFocus
                      selectTextOnFocus
                      onSubmitEditing={commitEstimate}
                      onBlur={commitEstimate}
                      style={{ fontSize: 11, fontWeight: '600', color: '#1a1a1a', minWidth: 20, maxWidth: 36 }}
                    />
                    <Text style={{ fontSize: 11, color: '#6B7280' }}>m</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => { setEstimateDraft(String(currentEntry.estimateMin)); setEditingEstimate(true) }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '500', color: '#6B7280' }}>{currentEntry.estimateMin}m</Text>
                  </Pressable>
                )
              )}

              {/* Date chip */}
              {currentTask && (
                <Pressable
                  onPress={() => { setShowDatePicker((v) => !v); setShowPriorityPicker(false) }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: showDatePicker ? BLUE : '#D1D5DB', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 }}
                >
                  <Calendar size={10} color={currentTask.due ? (isPast(parseApiDate(currentTask.due)!) && !isToday(parseApiDate(currentTask.due)!) ? '#DC2626' : '#374151') : '#9ca3af'} />
                  <Text style={{ fontSize: 11, fontWeight: '500', color: currentTask.due ? (isPast(parseApiDate(currentTask.due)!) && !isToday(parseApiDate(currentTask.due)!) ? '#DC2626' : '#374151') : '#9ca3af' }}>
                    {currentTask.due ? humanizeDueDate(currentTask.due) : 'Date'}
                  </Text>
                </Pressable>
              )}

              {/* Priority chip */}
              {currentTask && (
                <Pressable
                  onPress={() => { setShowPriorityPicker((v) => !v); setShowDatePicker(false) }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: currentTask.priority > 0 && currentTask.priority <= 10 ? (priorityRowBg(currentTask.priority) ?? '#f3f4f6') : '#f3f4f6', borderWidth: 1, borderColor: showPriorityPicker ? BLUE : 'transparent' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: currentTask.priority > 0 && currentTask.priority <= 10 ? priorityTextColor(currentTask.priority) : '#9ca3af' }}>
                    {currentTask.priority > 0 && currentTask.priority <= 10 ? priorityDisplay(currentTask.priority) : 'P?'}
                  </Text>
                </Pressable>
              )}

              {/* Tags inline */}
              {currentTask?.tags_as_text && currentTask.tags_as_text.split(/\s+/).filter(Boolean).map((tag) => (
                <Text key={tag} style={{ fontSize: 11, color: BLUE, fontWeight: '500' }}>
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </Text>
              ))}

              {/* List / Focus toggle */}
              <Pressable
                onPress={() => setFocusMode(f => !f)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: focusMode ? '#FEF3C7' : '#F3F4F6', borderWidth: 1, borderColor: focusMode ? '#D97706' : 'transparent' }}
              >
                {focusMode ? <EyeOff size={10} color="#D97706" /> : <List size={10} color="#9ca3af" />}
                <Text style={{ fontSize: 11, fontWeight: '600', color: focusMode ? '#D97706' : '#9ca3af' }}>
                  {focusMode ? 'Focus' : 'List'}
                </Text>
              </Pressable>

              {/* Pomodoro */}
              <Pressable
                onPress={togglePomodoro}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: pomodoroOn ? '#EEF2FF' : '#F3F4F6', borderWidth: 1, borderColor: pomodoroOn ? BLUE : 'transparent' }}
              >
                <Timer size={10} color={pomodoroOn ? BLUE : '#9ca3af'} />
                {pomodoroOn
                  ? <Text style={{ fontSize: 11, fontWeight: '600', color: pomodoroIsBreak ? '#16A34A' : BLUE }}>{pomodoroIsBreak ? 'Break' : 'Focus'} {fmtClock(pomodoroSecs)}</Text>
                  : <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af' }}>25m</Text>
                }
              </Pressable>

              {/* Tomorrow */}
              {currentTask && (
                <Pressable
                  onPress={() => { const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd'); updateTask({ taskId: currentTask.id, payload: { due_date: tomorrow } }); nextTask() }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F5F3FF' }}
                >
                  <Sunrise size={10} color="#8B5CF6" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#8B5CF6' }}>Tomorrow</Text>
                </Pressable>
              )}

              {/* De-pri */}
              {currentTask && (
                <Pressable
                  onPress={() => { updateTask({ taskId: currentTask.id, payload: { priority: 9 } }); nextTask() }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F5F3FF' }}
                >
                  <ArrowDown size={10} color="#7c3aed" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>De-pri</Text>
                </Pressable>
              )}

              {/* Raw / MindMap */}
              {onJumpToRaw && currentTask && (
                <Pressable onPress={() => onJumpToRaw(currentTask.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                  <AlignLeft size={10} color="#6366F1" />
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#475569' }}>Raw</Text>
                </Pressable>
              )}
              {onJumpToMindmap && currentTask && (
                <Pressable onPress={() => onJumpToMindmap(currentTask.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                  <Network size={10} color="#6366F1" />
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#475569' }}>Map</Text>
                </Pressable>
              )}
            </ScrollView>

            {/* Timer controls (fixed right side) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable hitSlop={8} onPress={resetCurrent}><RotateCcw size={14} color="#C4C4C4" /></Pressable>
              <Pressable hitSlop={8} onPress={() => adjust(-ESTIMATE_STEP)}><Minus size={18} color="#9CA3AF" /></Pressable>
              <Pressable onPress={togglePlay} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isRunning ? INDIGO : '#1E293B', alignItems: 'center', justifyContent: 'center', shadowColor: isRunning ? INDIGO : '#000', shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 }}>
                {isRunning ? <Pause size={15} color="white" /> : <Play size={15} color="white" />}
              </Pressable>
              <Pressable hitSlop={8} onPress={() => adjust(ESTIMATE_STEP)}><Plus size={18} color="#9CA3AF" /></Pressable>
              <MuteButton />
            </View>
          </View>



          {showDatePicker && currentTask && (
            <QuickDatePicker
              taskId={currentTask.id}
              onSelect={(dateStr) => {
                setShowDatePicker(false)
                updateTask({ taskId: currentTask.id, payload: { due_date: dateStr } })
              }}
              onClose={() => setShowDatePicker(false)}
              isMobile
            />
          )}

          {showPriorityPicker && currentTask && (
            <BottomSheet open onClose={() => setShowPriorityPicker(false)} title="Set Priority">
              <PriorityPicker
                value={currentTask.priority}
                onChange={(p) => {
                  setShowPriorityPicker(false)
                  updateTask({ taskId: currentTask.id, payload: { priority: p } })
                }}
              />
            </BottomSheet>
          )}
        </View>

        {/* Compact sessions strip */}
        <Pressable
          onPress={onSwitchToLog}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9' }}
        >
          <Clock size={13} color={INDIGO} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>
            {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}
          </Text>
          <Text style={{ fontSize: 12, color: '#94A3B8' }}>·</Text>
          <Text style={{ fontSize: 12, color: '#64748B' }}>{fmtDuration(sessionTotalSeconds)}</Text>
          <View style={{ flex: 1 }} />
          {completedStreak > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Zap size={10} color="#F59E0B" fill="#F59E0B" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B' }}>{completedStreak}</Text>
            </View>
          )}
          {savedIntention ? (
            <Pressable onPress={() => setShowIntention(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 100 }}>
              <Target size={10} color="#16A34A" />
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#16A34A' }} numberOfLines={1}>{savedIntention}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setShowIntention(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}>
              <Target size={10} color="#CBD5E1" />
              <Text style={{ fontSize: 10, color: '#CBD5E1' }}>intention</Text>
            </Pressable>
          )}
        </Pressable>
      </View>

      {/* Scrollable task list (hidden in focus mode) */}
      {focusMode ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.4 }}>
          <EyeOff size={28} color="#9ca3af" />
          <Text style={{ fontSize: 12, color: '#9ca3af' }}>Task list hidden — stay focused</Text>
        </View>
      ) : (
        <ExecuteTaskList />
      )}

      {/* ── Intention prompt (feature #5) ──────────────────────────────────── */}
      <Modal visible={showIntention} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, gap: 20 }}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                <Target size={24} color={BLUE} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center' }}>
                What's your ONE task today?
              </Text>
              <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 }}>
                Pick the single task that would make today a success. Everything else is secondary.
              </Text>
            </View>
            <TextInput
              value={intentionDraft}
              onChangeText={setIntentionDraft}
              placeholder="Type your most important task..."
              placeholderTextColor="#C4C4C4"
              autoFocus
              onSubmitEditing={submitIntention}
              style={{ fontSize: 15, fontWeight: '500', color: '#111827', borderWidth: 1.5, borderColor: BLUE, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}
            />
            <Pressable onPress={submitIntention} style={{ backgroundColor: BLUE, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Start focused session →</Text>
            </Pressable>
            <Pressable onPress={() => setShowIntention(false)} style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#9ca3af' }}>Skip for now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Switch friction (feature #3) ───────────────────────────────────── */}
      <Modal visible={pendingSwitch !== null} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 360, gap: 16 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: '#111827' }}>Stay on track 🧠</Text>
            <Text style={{ fontSize: 14, color: '#4B5563', lineHeight: 20 }}>
              You've been focused for {Math.floor(currentSeconds / 60)}m {currentSeconds % 60}s.{'\n'}Switching now breaks your momentum.
            </Text>
            {pendingSwitch && orderedTasks[pendingSwitch.index] && (
              <View style={{ backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Switching to:</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }} numberOfLines={2}>
                  {stripMarkdown(orderedTasks[pendingSwitch.index].content)}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={cancelSwitch} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, backgroundColor: BLUE, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Stay focused</Text>
              </Pressable>
              <Pressable onPress={confirmSwitch} style={{ flex: 1, borderRadius: 10, paddingVertical: 12, backgroundColor: '#F3F4F6', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#6B7280' }}>Switch anyway</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Pomodoro break overlay (feature #1) ────────────────────────────── */}
      <Modal visible={pomodoroOn && pomodoroIsBreak} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, width: '100%', maxWidth: 360, gap: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 40 }}>🧘</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>Break time</Text>
            <FlipClock totalSeconds={pomodoroSecs} color="#16A34A" size="lg" />
            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>
              Look away from the screen.{'\n'}Take slow breaths or close your eyes.{'\n'}Let your brain consolidate the work.
            </Text>
            <Pressable onPress={skipBreak} style={{ paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#F3F4F6', borderRadius: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280' }}>Skip break</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}
