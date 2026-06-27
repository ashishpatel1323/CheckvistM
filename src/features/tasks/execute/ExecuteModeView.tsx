import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { View, Text, Pressable, ScrollView, Platform, TextInput, Animated, Modal, useWindowDimensions } from 'react-native'
import { Play, Pause, Minus, Plus, Check, RotateCcw, CheckCircle2, GripVertical, Calendar, Pencil, X, ChevronLeft, ChevronRight, ChevronDown, AlignLeft, Maximize2, Network, Clock, Timer, Target, Zap, EyeOff, List, ArrowDown, Sunrise, Search, Layers } from 'lucide-react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree, computeHierarchyGroup, type HierarchyGroup } from '@/lib/taskTree'
import { groupTasksByDate, classifyTask, GROUP_LABELS, type DateGroup } from '@/lib/dateSort'
import { classifyPriority, PRIORITY_META, bucketTasksByPriority } from '@/features/tasks/list/PriorityDateView'
import { classifyTime, TIME_QUADRANTS } from '@/features/tasks/list/EisenhowerMatrixView'
import {
  useExecuteLog,
  entryKey,
  liveSeconds,
  summarizeDaySessions,
  DEFAULT_ESTIMATE,
  ESTIMATE_STEP,
  type ExecuteLogEntry,
  type SessionLogEntry,
} from './useExecuteLog'
import { priorityTextColor, priorityDisplay, priorityRowBg, PriorityPicker } from '@/features/tasks/shared/PriorityPicker'
import { useTaskSettings } from '@/features/settings/useTaskSettings'
import { useSystemLog, type SyncedSession } from './useSystemLog'
import { hapticMedium, hapticSuccess } from '@/platform/haptics'
import { useToast } from '@/components/Toast'
import {
  setupTimerNotifications,
  teardownTimerNotifications,
  showExecuteTimerNotification,
  dismissExecuteTimerNotification,
} from '@/platform/timerNotification'
import { useUpdateTask, useCloseTask, useMarkIncomplete } from '@/features/tasks/list/useTasksQuery'
import { CalendarScheduleView } from '@/features/tasks/calendar/CalendarScheduleView'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { humanizeDueDate, parseApiDate } from '@/lib/dateUtils'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import { FocusReminderButton } from '@/features/tasks/shared/FocusReminderButton'
import { useFocusReminderControl, useOvertimeBeep } from '@/services/focusReminder'
import { BottomSheet } from '@/components/BottomSheet'
import { isToday, isPast, format, addDays } from 'date-fns'

const BLUE = '#6366F1'
const INDIGO = '#6366F1'

const COL_TAGS = 110
const COL_TIME = 52
const COL_DATE = 84
const COL_PRI = 40
const COLUMN_MODE_MIN_WIDTH = 620

// Width of one indent lane in the hierarchy outline (matches Tasks-tab OutlineRow).
const HIER_LANE = 22
const HIER_LINE = '#DDDDE3'
const HIER_LINE_ACTIVE = '#4772FA'

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

type TaskNode = ReturnType<typeof buildTaskTree>['allNodes'][number]
type PriBucket = 'high' | 'medium' | 'low' | 'tbd'
const PRI_BUCKETS: PriBucket[] = ['high', 'medium', 'low', 'tbd']

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtMins(seconds: number): string {
  const m = Math.round(seconds / 60)
  return `${m}m`
}

function fmtDuration(seconds: number): string {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr]
  const [item] = result.splice(from, 1)
  result.splice(to > from ? to - 1 : to, 0, item)
  return result
}

// ─── Hierarchy flatten + outline connectors ─────────────────────────────────

interface HierItem {
  task: TaskNode
  /** Depth below the visible root (root = 0). */
  depth: number
  /** For each ancestor lane (0..depth-2): whether that ancestor has a younger
   *  sibling still to come, i.e. whether to draw a vertical guide line. */
  ancestorLines: boolean[]
  /** Whether this node is the last child of its parent (controls the elbow). */
  isLast: boolean
  /** Id of the visible root this node descends from (for bucketing). */
  rootId: number
}

function subtreeHasMatch(
  node: TaskNode,
  childMap: Map<number, TaskNode[]>,
  matches: (t: TaskNode) => boolean,
  memo: Map<number, boolean>,
): boolean {
  const cached = memo.get(node.id)
  if (cached !== undefined) return cached
  const kids = childMap.get(node.id) ?? []
  const result = matches(node) || kids.some((k) => subtreeHasMatch(k, childMap, matches, memo))
  memo.set(node.id, result)
  return result
}

/**
 * Flattens a hierarchy (visibleRoots + childMap from computeHierarchyGroup) into
 * a depth-first ordered list carrying the connector metadata needed to draw a
 * proper outline tree. Children are only emitted when their parent is expanded,
 * mirroring the Tasks-tab outline behaviour.
 *
 * Search-aware: if a parent matches, all descendants are shown; if only a
 * descendant matches, the ancestor chain is shown for context but unrelated
 * siblings are hidden.
 */
function flattenHierarchy(
  visibleRoots: TaskNode[],
  childMap: Map<number, TaskNode[]>,
  matches: (t: TaskNode) => boolean,
  isExpanded: (id: number) => boolean,
): HierItem[] {
  const memo = new Map<number, boolean>()
  const out: HierItem[] = []
  const walk = (node: TaskNode, depth: number, ancestorLines: boolean[], isLast: boolean, rootId: number, forceShow: boolean) => {
    out.push({ task: node, depth, ancestorLines, isLast, rootId })
    if (!isExpanded(node.id)) return
    const selfMatches = matches(node)
    const kids = childMap.get(node.id) ?? []
    const visibleKids = forceShow || selfMatches
      ? kids
      : kids.filter((k) => subtreeHasMatch(k, childMap, matches, memo))
    visibleKids.forEach((c, i) =>
      walk(c, depth + 1, depth === 0 ? [] : [...ancestorLines, !isLast], i === visibleKids.length - 1, rootId, forceShow || selfMatches)
    )
  }
  const roots = visibleRoots.filter((r) => subtreeHasMatch(r, childMap, matches, memo))
  roots.forEach((r, i) => walk(r, 0, [], i === roots.length - 1, r.id, false))
  return out
}

/** Outline connector (vertical guide lines + curved elbow) for a hierarchy row. */
function HierConnector({ depth, ancestorLines, isLast, highlight }: { depth: number; ancestorLines: boolean[]; isLast: boolean; highlight: boolean }) {
  if (depth === 0) return null
  const color = highlight ? HIER_LINE_ACTIVE : HIER_LINE
  const w = highlight ? 2 : 1
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: depth * HIER_LANE, flexDirection: 'row' }}>
      {Array.from({ length: depth }).map((_, i) => {
        const isOwn = i === depth - 1
        if (isOwn) {
          return (
            <View key={i} style={{ width: HIER_LANE }}>
              {/* Elbow: vertical from top to mid, curving right into the bullet. */}
              <View style={{ position: 'absolute', left: 0, top: 0, height: 19, width: HIER_LANE + 12, borderBottomLeftRadius: 10, borderLeftWidth: w, borderBottomWidth: w, borderLeftColor: color, borderBottomColor: color }} />
              {/* Continue the vertical below the elbow when more siblings follow. */}
              {!isLast && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w, backgroundColor: color }} />}
            </View>
          )
        }
        return (
          <View key={i} style={{ width: HIER_LANE }}>
            {ancestorLines[i] && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w, backgroundColor: color }} />}
          </View>
        )
      })}
    </View>
  )
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ExecCtxValue {
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
  editingTitle: boolean
  setEditingTitle: Dispatch<SetStateAction<boolean>>
  titleDraft: string
  setTitleDraft: Dispatch<SetStateAction<string>>
  showDatePicker: boolean
  setShowDatePicker: Dispatch<SetStateAction<boolean>>
  showPriorityPicker: boolean
  setShowPriorityPicker: Dispatch<SetStateAction<boolean>>
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
  completedStreak: number
  checklistId: number
  onJumpToRaw?: (taskId: number) => void
  onJumpToMindmap?: (taskId: number) => void
  onCloseSidePanel?: () => void
  hierarchyMode: boolean
  hierarchy: HierarchyGroup | null
  hierarchyGetById: (id: number) => TaskNode | undefined
  hierarchyTodayNodes: TaskNode[]
  expandedRootIds: Set<number>
  toggleExpand: (id: number) => void
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
  onCloseSidePanel?: () => void
  children: ReactNode
}

export function ExecuteStateProvider({ tasks, checklistId, onJumpToRaw, onJumpToMindmap, onCloseSidePanel, children }: ProviderProps) {
  const todayTasks = useMemo(() => {
    const { allNodes } = buildTaskTree(tasks)
    const groups = groupTasksByDate(allNodes)
    const todayGroup = groups.find((g) => g.group === 'today')?.tasks ?? []
    const completedToday = tasks
      .filter((t) => t.status === 1 && classifyTask(t) === 'today')
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((t) => ({ ...t, children: [], level: 1 }))
    return [...todayGroup, ...completedToday]
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

  const { entries, sessionLog, currentSessionKey, timerRunningKey, timerStartedAt, seed, setEstimate, play, pause, markCompleted, reset, setTaskName, hydrateFromRemote } = useExecuteLog()
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

  const { hierarchyMode } = useTaskSettings()
  const [expandedRootIds, setExpandedRootIds] = useState<Set<number>>(new Set())
  const toggleExpand = (id: number) => {
    setExpandedRootIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const hierarchyData = useMemo(() => {
    if (!hierarchyMode) return null
    const { allNodes, getById } = buildTaskTree(tasks)
    const todayNodes = allNodes.filter((t) => classifyTask(t) === 'today')
    return { group: computeHierarchyGroup(todayNodes, getById), getById, todayNodes }
  }, [tasks, hierarchyMode])
  const hierarchy = hierarchyData?.group ?? null

  useEffect(() => {
    for (const t of todayTasks) {
      const key = entryKey(checklistId, t.id)
      seed(key, t.id, t.duration?.minutes ?? DEFAULT_ESTIMATE)
      setTaskName(key, t.content)
    }
  }, [todayTasks, checklistId, seed, setTaskName])

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
  useFocusReminderControl('execute', isRunning)

  const getEntry = (taskId: number): ExecuteLogEntry | undefined =>
    entries[entryKey(checklistId, taskId)]

  const currentEntry = currentTask ? getEntry(currentTask.id) : undefined
  const currentSeconds = currentEntry && currentKey
    ? liveSeconds(currentEntry, timerRunningKey, timerStartedAt, currentKey)
    : 0

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

  const togglePlay = () => {
    if (!currentKey) return
    if (isRunning) { pause() } else { play(currentKey); if (currentTask) onJumpToRaw?.(currentTask.id) }
  }
  const playTask = (index: number) => {
    setCurrentIndex(index)
    const taskId = orderedIds[index]
    if (!taskId) return
    const key = entryKey(checklistId, taskId)
    pause(); play(key); onJumpToRaw?.(taskId)
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
    setCurrentIndex(index)
  }
  const prevTask = () => {
    setCurrentIndex(Math.max(0, currentIndex - 1))
  }
  const nextTask = () => {
    setCurrentIndex(Math.min(orderedTasks.length - 1, currentIndex + 1))
  }

  const value: ExecCtxValue = {
    orderedTasks, orderedIds, setOrderedIds, currentIndex, setCurrentIndex,
    currentTask, currentKey, currentEntry, isRunning, currentSeconds,
    completedCount, totalActualSeconds, totalEstimateSeconds, getEntry,
    entries, timerRunningKey, timerStartedAt,
    editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    togglePlay, playTask, adjust, setEstimateDirect, complete, resetCurrent, jumpTo, prevTask, nextTask, persistOrder, updateTask,
    completedStreak,
    checklistId, onJumpToRaw, onJumpToMindmap, onCloseSidePanel,
    hierarchyMode, hierarchy,
    hierarchyGetById: hierarchyData?.getById ?? (() => undefined),
    hierarchyTodayNodes: hierarchyData?.todayNodes ?? [],
    expandedRootIds, toggleExpand,
  }

  return <ExecCtx.Provider value={value}>{children}</ExecCtx.Provider>
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
    Animated.timing(flipAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start(() => setFlipping(false))
  }, [digit, flipAnim])

  const cardW = size === 'xl' ? 80 : size === 'lg' ? 52 : size === 'md' ? 36 : 28
  const cardH = size === 'xl' ? 110 : size === 'lg' ? 72 : size === 'md' ? 50 : 40
  const fontSize = size === 'xl' ? 68 : size === 'lg' ? 44 : size === 'md' ? 28 : 24

  const topRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] })
  const btmRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['90deg', '0deg'] })
  const topOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] })
  const btmOpacity = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] })

  const card = {
    width: cardW, height: cardH, borderRadius: 8,
    backgroundColor: '#1a1a1a',
    alignItems: 'center' as const, justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  }

  const digitText = (val: string) => (
    <Text style={{ fontSize, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] as never }}>{val}</Text>
  )

  return (
    <View style={{ width: cardW, height: cardH, position: 'relative' }}>
      <View style={card}>{digitText(flipping ? displayPrev : digit)}</View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: cardH / 2 - 0.5, height: 1, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 10 }} />
      {flipping && (
        <>
          <Animated.View style={[card, {
            position: 'absolute', top: 0,
            transform: [{ perspective: 400 }, { rotateX: topRotate }], transformOrigin: 'bottom',
            opacity: topOpacity, overflow: 'hidden', zIndex: 5,
          }]}>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: cardH }}>{digitText(displayPrev)}</View>
          </Animated.View>
          <Animated.View style={[card, {
            position: 'absolute', top: 0,
            transform: [{ perspective: 400 }, { rotateX: btmRotate }], transformOrigin: 'top',
            opacity: btmOpacity, overflow: 'hidden', zIndex: 5,
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

// ─── Full-screen counter modal ────────────────────────────────────────────────

function FullScreenCounterModal({ onClose }: { onClose: () => void }) {
  const { currentTask, currentEntry, currentSeconds, isRunning, togglePlay, adjust, complete, resetCurrent } = useExecCtx()
  const estimateSeconds = (currentEntry?.estimateMin ?? DEFAULT_ESTIMATE) * 60
  const isOverrun = isRunning && currentSeconds >= estimateSeconds
  useOvertimeBeep(isOverrun)

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16 }}>
          <Pressable hitSlop={8} onPress={onClose}><X size={22} color="#6B7280" /></Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 24 }}>
          {currentTask && (
            <Text style={{ fontSize: 17, color: '#374151', textAlign: 'center', paddingHorizontal: 24, lineHeight: 24 }} numberOfLines={2}>
              <InlineMarkdown content={currentTask.content} />
            </Text>
          )}
          <FlipClock totalSeconds={currentSeconds} color={isOverrun ? '#EF4444' : isRunning ? BLUE : '#DC2626'} size="xl" />
          {isOverrun && (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10, marginTop: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626', letterSpacing: 0.5 }}>OVERTIME</Text>
            </View>
          )}
          {isOverrun && (
            <Pressable onPress={() => adjust(ESTIMATE_STEP)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16 }}>
              <Plus size={16} color="#EF4444" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>Extend +{ESTIMATE_STEP} min</Text>
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 48, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
          <Pressable hitSlop={10} onPress={resetCurrent} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}><RotateCcw size={20} color="#374151" /></Pressable>
          <Pressable hitSlop={10} onPress={() => adjust(-ESTIMATE_STEP)}><Minus size={24} color="#9CA3AF" /></Pressable>
          <Pressable onPress={togglePlay} style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: isRunning ? BLUE : '#111827', alignItems: 'center', justifyContent: 'center', shadowColor: isRunning ? BLUE : '#000', shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 }}>
            {isRunning ? <Pause size={30} color="white" /> : <Play size={30} color="white" />}
          </Pressable>
          <Pressable hitSlop={10} onPress={() => adjust(ESTIMATE_STEP)}><Plus size={24} color="#9CA3AF" /></Pressable>
          <Pressable hitSlop={10} onPress={() => { complete(); onClose() }} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }}><Check size={22} color="white" strokeWidth={3} /></Pressable>
        </View>
      </View>
    </Modal>
  )
}

// ─── Horizontal Control Bar ───────────────────────────────────────────────────

export function ExecuteControlBar({ onClose }: { onClose?: () => void }) {
  const {
    currentTask, currentSeconds, isRunning, currentEntry,
    editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    completedCount, orderedTasks, totalActualSeconds, totalEstimateSeconds,
    currentIndex, togglePlay, adjust, setEstimateDirect, complete, resetCurrent, prevTask, nextTask, updateTask, checklistId,
  } = useExecCtx()

  const [editingEstimate, setEditingEstimate] = useState(false)
  const [estimateDraft, setEstimateDraft] = useState('')
  const [showFullScreen, setShowFullScreen] = useState(false)
  function commitEstimate() {
    const v = parseInt(estimateDraft, 10)
    if (!isNaN(v) && v > 0) setEstimateDirect(v)
    setEditingEstimate(false)
  }

  const dueDateColor = currentTask?.due
    ? (isPast(parseApiDate(currentTask.due)!) && !isToday(parseApiDate(currentTask.due)!) ? '#DC2626' : '#374151')
    : '#9ca3af'

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          <Pressable hitSlop={10} onPress={prevTask} style={{ opacity: currentIndex === 0 ? 0.2 : 1, padding: 4 }}><ChevronLeft size={18} color="#6B7280" /></Pressable>
          <Text style={{ fontSize: 11, color: '#9ca3af', minWidth: 32, textAlign: 'center', fontWeight: '500' }}>{orderedTasks.length > 0 ? `${currentIndex + 1}/${orderedTasks.length}` : '—'}</Text>
          <Pressable hitSlop={10} onPress={nextTask} style={{ opacity: currentIndex >= orderedTasks.length - 1 ? 0.2 : 1, padding: 4 }}><ChevronRight size={18} color="#6B7280" /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable hitSlop={10} onPress={() => setShowFullScreen(true)} style={{ padding: 4, opacity: 0.45 }}><Maximize2 size={13} color="#374151" /></Pressable>
        </View>
        {showFullScreen && <FullScreenCounterModal onClose={() => setShowFullScreen(false)} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          {currentTask ? (
            editingTitle ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput value={titleDraft} onChangeText={setTitleDraft} autoFocus blurOnSubmit onSubmitEditing={() => { setEditingTitle(false); const c = titleDraft.trim(); if (c && c !== currentTask.content) updateTask({ taskId: currentTask.id, payload: { content: c } }) }} onBlur={() => { setEditingTitle(false); const c = titleDraft.trim(); if (c && c !== currentTask.content) updateTask({ taskId: currentTask.id, payload: { content: c } }) }} style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111', borderBottomWidth: 1.5, borderBottomColor: BLUE, paddingBottom: 2 }} />
                <Pressable hitSlop={8} onPress={() => { setEditingTitle(false); setTitleDraft(currentTask.content) }}><X size={13} color="#9ca3af" /></Pressable>
              </View>
            ) : (
              <View style={{ gap: 2 }}>
                <Pressable onPress={() => { setTitleDraft(currentTask.content); setEditingTitle(true) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 20 }}><InlineMarkdown content={currentTask.content} /></Text>
                  <Pencil size={11} color="#D1D5DB" />
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {currentEntry && (editingEstimate ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: BLUE }}>
                      <Text style={{ fontSize: 10, color: '#6B7280' }}>Est </Text>
                      <TextInput value={estimateDraft} onChangeText={setEstimateDraft} keyboardType="number-pad" autoFocus selectTextOnFocus onSubmitEditing={commitEstimate} onBlur={commitEstimate} style={{ fontSize: 10, fontWeight: '600', color: '#111', minWidth: 18, maxWidth: 36 }} />
                      <Text style={{ fontSize: 10, color: '#6B7280' }}>m</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => { setEstimateDraft(String(currentEntry.estimateMin)); setEditingEstimate(true) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}>
                      <Text style={{ fontSize: 10, color: '#6B7280' }}>Est {currentEntry.estimateMin}m</Text>
                    </Pressable>
                  ))}
                  {currentTask && (
                    <Pressable onPress={() => { setShowDatePicker(v => !v); setShowPriorityPicker(false) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: showDatePicker ? BLUE : '#E5E7EB', backgroundColor: showDatePicker ? '#EEF2FF' : 'transparent' }}>
                      <Calendar size={9} color={dueDateColor} />
                      <Text style={{ fontSize: 10, color: dueDateColor, fontWeight: '500' }}>{currentTask.due ? humanizeDueDate(currentTask.due) : 'Date'}</Text>
                    </Pressable>
                  )}
                  {currentTask && (
                    <Pressable onPress={() => { setShowPriorityPicker(v => !v); setShowDatePicker(false) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: currentTask.priority > 0 && currentTask.priority <= 10 ? (priorityRowBg(currentTask.priority) ?? '#F3F4F6') : '#F3F4F6', borderWidth: 1, borderColor: showPriorityPicker ? BLUE : 'transparent' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: currentTask.priority > 0 && currentTask.priority <= 10 ? priorityTextColor(currentTask.priority) : '#9ca3af' }}>{currentTask.priority > 0 && currentTask.priority <= 10 ? priorityDisplay(currentTask.priority) : 'P?'}</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )
          ) : <Text style={{ fontSize: 13, color: '#9ca3af' }}>No tasks today</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable hitSlop={10} onPress={resetCurrent} style={{ padding: 6 }}><RotateCcw size={16} color="#C4C4C4" /></Pressable>
          <Pressable hitSlop={10} onPress={() => adjust(-ESTIMATE_STEP)} style={{ padding: 4 }}><Minus size={20} color="#9CA3AF" /></Pressable>
          <Pressable onPress={togglePlay} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isRunning ? INDIGO : '#1E293B', alignItems: 'center', justifyContent: 'center', shadowColor: isRunning ? INDIGO : '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            {isRunning ? <Pause size={20} color="white" /> : <Play size={20} color="white" />}
          </Pressable>
          <Pressable hitSlop={10} onPress={() => adjust(ESTIMATE_STEP)} style={{ padding: 4 }}><Plus size={20} color="#9CA3AF" /></Pressable>
          {currentTask && (
            <>
              <Pressable hitSlop={8} onPress={() => { updateTask({ taskId: currentTask.id, payload: { due_date: format(addDays(new Date(), 1), 'yyyy-MM-dd') } }); nextTask() }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                <Sunrise size={12} color={INDIGO} /><Text style={{ fontSize: 11, fontWeight: '600', color: INDIGO }}>Tomorrow</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => { updateTask({ taskId: currentTask.id, payload: { priority: 9 } }); nextTask() }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                <ArrowDown size={12} color={INDIGO} /><Text style={{ fontSize: 11, fontWeight: '600', color: INDIGO }}>De-pri</Text>
              </Pressable>
            </>
          )}
          {onClose && <Pressable hitSlop={10} onPress={onClose} style={{ padding: 4, marginLeft: 2 }}><X size={16} color="#C4C4C4" /></Pressable>}
        </View>
      </View>
      {showDatePicker && currentTask && (
        <QuickDatePicker taskId={currentTask.id} onSelect={(d) => { setShowDatePicker(false); updateTask({ taskId: currentTask.id, payload: { due_date: d } }) }} onClose={() => setShowDatePicker(false)} isMobile />
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
  const sessionLog = useExecuteLog((s) => s.sessionLog)
  const currentSessionKey = useExecuteLog((s) => s.currentSessionKey)
  const timerStartedAt = useExecuteLog((s) => s.timerStartedAt)
  const remoteSessions = useSystemLog((s) => s.remoteSessions)
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const { sessionCount, sessionTotalSeconds } = useMemo(() => summarizeDaySessions(todayStr, sessionLog, remoteSessions, currentSessionKey, timerStartedAt), [sessionLog, remoteSessions, currentSessionKey, timerStartedAt, todayStr])

  return (
    <View style={{ marginHorizontal: 16, marginTop: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', gap: 8, borderWidth: 1, borderColor: '#F1F5F9' }}>
      <Clock size={13} color={INDIGO} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}</Text>
      <Text style={{ fontSize: 12, color: '#94A3B8' }}>·</Text>
      <Text style={{ fontSize: 12, color: '#64748B' }}>{fmtDuration(sessionTotalSeconds)}</Text>
    </View>
  )
}

// ─── Task list panel ─────────────────────────────────────────────────────────

export function ExecuteTaskList() {
  const {
    orderedTasks, orderedIds, setOrderedIds, currentIndex, setCurrentIndex,
    isRunning, getEntry, entries, timerRunningKey, timerStartedAt,
    togglePlay, playTask, jumpTo, persistOrder, checklistId, onJumpToRaw, onJumpToMindmap, onCloseSidePanel, updateTask,
    hierarchyMode, hierarchy, hierarchyGetById, hierarchyTodayNodes, expandedRootIds, toggleExpand,
  } = useExecCtx()

  const { mutate: closeTask } = useCloseTask(checklistId)
  const { mutate: markIncomplete } = useMarkIncomplete(checklistId)
  const toast = useToast()
  const completeTask = (taskId: number) => {
    hapticSuccess()
    const task = orderedTasks.find((t) => t.id === taskId)
    if (task?.status === 1) {
      markIncomplete(taskId, { onSuccess: () => toast.success('Task reopened'), onError: () => toast.error('Failed to reopen task') })
    } else {
      closeTask(taskId, { onSuccess: () => toast.success('Task completed'), onError: () => toast.error('Failed to complete task') })
    }
  }

  const [dateEditTaskId, setDateEditTaskId] = useState<number | null>(null)
  const [priorityEditTaskId, setPriorityEditTaskId] = useState<number | null>(null)
  const dateEditTask = orderedTasks.find((t) => t.id === dateEditTaskId) ?? null
  const priorityEditTask = orderedTasks.find((t) => t.id === priorityEditTaskId) ?? null

  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [insertIdx, setInsertIdx] = useState<number | null>(null)
  const draggingIdxRef = useRef<number | null>(null)
  const insertIdxRef = useRef<number | null>(null)
  const cardDomRefs = useRef<Map<number, HTMLElement>>(new Map())
  const nativeRowRefs = useRef<Map<number, View>>(new Map())

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const lastClickedIdx = useRef<number | null>(null)
  const leftPanelRef = useRef<HTMLDivElement | null>(null)
  const focusLeftPanel = () => { if (Platform.OS === 'web') leftPanelRef.current?.focus() }

  const [panelWidth, setPanelWidth] = useState(0)
  const columnMode = Platform.OS === 'web' && panelWidth >= COLUMN_MODE_MIN_WIDTH

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
      setSelectedIndices((prev) => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next })
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
        setOrderedIds(newIds); persistOrder(newIds)
        setSelectedIndices(new Set([...selectedIndices].map((i) => i - 1)))
        setCurrentIndex((ci) => (selectedIndices.has(ci) ? ci - 1 : ci))
      } else {
        if (sorted[sorted.length - 1] === orderedTasks.length - 1) return
        const newIds = moveSelectionDown(orderedIds, selectedIndices)
        setOrderedIds(newIds); persistOrder(newIds)
        setSelectedIndices(new Set([...selectedIndices].map((i) => i + 1)))
        setCurrentIndex((ci) => (selectedIndices.has(ci) ? ci + 1 : ci))
      }
    } else if (e.metaKey || e.ctrlKey) {
      const delta = e.key === 'ArrowUp' ? -1 : 1
      const next = currentIndex + delta
      if (next < 0 || next >= orderedTasks.length) return
      const newIds = [...orderedIds]; [newIds[currentIndex], newIds[next]] = [newIds[next], newIds[currentIndex]]
      setOrderedIds(newIds); persistOrder(newIds); setCurrentIndex(next)
    } else {
      setCurrentIndex((ci) => { const delta = e.key === 'ArrowUp' ? -1 : 1; const next = ci + delta; return next < 0 || next >= orderedTasks.length ? ci : next })
    }
  }

  function commitReorder() {
    const from = draggingIdxRef.current
    const to = insertIdxRef.current
    draggingIdxRef.current = null; insertIdxRef.current = null
    setDraggingIdx(null); setInsertIdx(null)
    if (from === null || to === null || from === to) return
    const newIds = reorder(orderedIds, from, to)
    setOrderedIds(newIds); persistOrder(newIds)
    setCurrentIndex((ci) => {
      const len = orderedTasks.length
      const idxMap = reorder(Array.from({ length: len }, (_, i) => i), from, to)
      const ni = idxMap.indexOf(ci)
      return ni >= 0 ? ni : ci
    })
  }

  function onGripPointerDown(e: React.PointerEvent, idx: number) {
    e.preventDefault()
    draggingIdxRef.current = idx; insertIdxRef.current = idx
    setDraggingIdx(idx); setInsertIdx(idx)
    function onMove(ev: PointerEvent) {
      const els = document.elementsFromPoint(ev.clientX, ev.clientY)
      for (const el of els) {
        const raw = (el as HTMLElement).dataset?.executeIdx
        if (raw === undefined) continue
        const cardIdx = parseInt(raw)
        const rect = (el as HTMLElement).getBoundingClientRect()
        const ni = ev.clientY < rect.top + rect.height / 2 ? cardIdx : cardIdx + 1
        insertIdxRef.current = ni; setInsertIdx(ni); return
      }
    }
    function onUp() { commitReorder(); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  function computeInsertFromAbsoluteY(absoluteY: number, measurements: Array<{ y: number; h: number }>) {
    for (let i = 0; i < measurements.length; i++) { if (absoluteY < measurements[i].y + measurements[i].h / 2) return i }
    return measurements.length
  }
  function makeNativeGesture(idx: number) {
    return Gesture.Pan().activateAfterLongPress(400).runOnJS(true)
      .onStart((e) => {
        hapticMedium()
        draggingIdxRef.current = idx; insertIdxRef.current = idx
        setDraggingIdx(idx); setInsertIdx(idx)
        const len = nativeRowRefs.current.size
        const measurements: Array<{ y: number; h: number }> = Array(len).fill({ y: 0, h: 0 })
        const promises = Array.from({ length: len }, (_, i) => new Promise<void>((resolve) => {
          const ref = nativeRowRefs.current.get(i)
          if (!ref) { resolve(); return }
          ref.measureInWindow((_x, y, _w, h) => { measurements[i] = { y, h }; resolve() })
        }))
        Promise.all(promises).then(() => {
          const ni = computeInsertFromAbsoluteY(e.absoluteY, measurements)
          insertIdxRef.current = ni; setInsertIdx(ni)
          ;(makeNativeGesture as unknown as { _meas: Array<{ y: number; h: number }> })._meas = measurements
        })
      })
      .onUpdate((e) => {
        const meas = (makeNativeGesture as unknown as { _meas: Array<{ y: number; h: number }> })._meas
        if (!meas) return
        const ni = computeInsertFromAbsoluteY(e.absoluteY, meas)
        insertIdxRef.current = ni; setInsertIdx(ni)
      })
      .onEnd(() => commitReorder())
      .onFinalize(() => { if (draggingIdxRef.current !== null) { draggingIdxRef.current = null; insertIdxRef.current = null; setDraggingIdx(null); setInsertIdx(null) } })
  }

  // Group-by toggle
  const [groupBy, setGroupBy] = useState<'priority' | 'time' | 'inProgress' | 'calendar'>('priority')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  function toggleGroup(key: string) { setCollapsedGroups((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s }) }

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const matchesQuery = (t: TaskNode) => { const q = searchQuery.trim().toLowerCase(); return q === '' || t.content.toLowerCase().includes(q) }

  // Flat mode grouping (original logic)
  const flatPriorityGroups = useMemo(() => {
    const buckets: Record<PriBucket, { task: TaskNode; index: number }[]> = { high: [], medium: [], low: [], tbd: [] }
    orderedTasks.forEach((t, i) => { if (!matchesQuery(t)) return; buckets[classifyPriority(t.priority)].push({ task: t, index: i }) })
    return PRI_BUCKETS.filter((b) => buckets[b].length > 0).map((b) => ({ bucket: b, items: buckets[b], label: PRIORITY_LABEL[b], sublabel: PRIORITY_META[b].sublabel, color: PRIORITY_COLOR[b], bg: PRIORITY_META[b].bg }))
  }, [orderedTasks, matchesQuery])
  const flatTimeGroups = useMemo(() => {
    const bucketMap = new Map<string, { task: TaskNode; index: number }[]>()
    for (const q of TIME_QUADRANTS) bucketMap.set(q.bucket, [])
    orderedTasks.forEach((t, i) => { if (!matchesQuery(t)) return; bucketMap.get(classifyTime(t))?.push({ task: t, index: i }) })
    return TIME_QUADRANTS.filter((q) => (bucketMap.get(q.bucket)?.length ?? 0) > 0).map((q) => ({ bucket: q.bucket, label: q.label, sublabel: q.sublabel, color: q.color, bg: q.bg, items: bucketMap.get(q.bucket)! }))
  }, [orderedTasks, matchesQuery])

  // Hierarchical grouping — a visible root and its entire (expanded) subtree are
  // bucketed together under the root's own priority / time quadrant so the
  // outline tree stays contiguous and intact within a bucket.
  const hierPriorityGroups = useMemo(() => {
    if (!hierarchyMode || !hierarchy) return null
    const group = hierarchy
    const taskToIndex = new Map<number, number>(); orderedTasks.forEach((t, i) => taskToIndex.set(t.id, i))
    // Full bucket membership (every today task, children attributed to their
    // visible-root ancestor's priority) — the SAME algorithm the Tasks tab uses,
    // so header counts are identical and independent of expand/collapse state.
    const full = bucketTasksByPriority(hierarchyTodayNodes, group, hierarchyGetById)
    // Order roots by the canonical Execute order (priority then position) so the
    // by-priority list mirrors the Tasks tab.
    const sortedRoots = [...group.visibleRoots].sort((a, b) => (taskToIndex.get(a.id) ?? Infinity) - (taskToIndex.get(b.id) ?? Infinity))
    return PRI_BUCKETS.filter((b) => full[b].length > 0).map((b) => {
      const rootsInBucket = sortedRoots.filter((r) => classifyPriority(r.priority) === b)
      const items = flattenHierarchy(rootsInBucket, group.childMap, matchesQuery, (id) => expandedRootIds.has(id))
        .map((it) => ({ ...it, index: taskToIndex.get(it.task.id) ?? -1 }))
      return { bucket: b, items, count: full[b].filter(matchesQuery).length }
    })
  }, [orderedTasks, hierarchyMode, hierarchy, hierarchyTodayNodes, hierarchyGetById, matchesQuery, expandedRootIds])

  const hierTimeGroups = useMemo(() => {
    if (!hierarchyMode || !hierarchy) return null
    const group = hierarchy
    const taskToIndex = new Map<number, number>(); orderedTasks.forEach((t, i) => taskToIndex.set(t.id, i))
    const rootById = new Map(group.visibleRoots.map((r) => [r.id, r]))
    const sortedRoots = [...group.visibleRoots].sort((a, b) => (taskToIndex.get(a.id) ?? Infinity) - (taskToIndex.get(b.id) ?? Infinity))
    // Full membership per quadrant: every visible root + all its descendants,
    // attributed to the root's quadrant (count is independent of expand state).
    const subtreeCount = (rootId: number): number => {
      const kids = group.childMap.get(rootId) ?? []
      return kids.reduce((n, k) => n + (matchesQuery(k) ? 1 : 0) + subtreeCount(k.id), 0)
    }
    const fullByQuadrant = new Map<string, number>()
    for (const q of TIME_QUADRANTS) fullByQuadrant.set(q.bucket, 0)
    for (const root of group.visibleRoots) {
      const q = classifyTime(root)
      const add = (matchesQuery(root) ? 1 : 0) + subtreeCount(root.id)
      fullByQuadrant.set(q, (fullByQuadrant.get(q) ?? 0) + add)
    }
    return TIME_QUADRANTS.filter((q) => (fullByQuadrant.get(q.bucket) ?? 0) > 0).map((q) => {
      const rootsInQuadrant = sortedRoots.filter((r) => classifyTime(rootById.get(r.id) ?? r) === q.bucket)
      const items = flattenHierarchy(rootsInQuadrant, group.childMap, matchesQuery, (id) => expandedRootIds.has(id))
        .map((it) => ({ ...it, index: taskToIndex.get(it.task.id) ?? -1 }))
      return { ...q, items, count: fullByQuadrant.get(q.bucket) ?? 0 }
    })
  }, [orderedTasks, hierarchyMode, hierarchy, matchesQuery, expandedRootIds])

  const priorityGroups = hierarchyMode && hierPriorityGroups ? hierPriorityGroups : flatPriorityGroups
  const timeGroups = hierarchyMode && hierTimeGroups ? hierTimeGroups : flatTimeGroups

  // In Progress (always flat)
  const hasLoggedTimeToday = (t: TaskNode) => {
    const entry = getEntry(t.id); if (!entry) return false
    const k = entryKey(checklistId, t.id)
    return liveSeconds(entry, timerRunningKey, timerStartedAt, k) > 0
  }
  const inProgressGroups = useMemo(() => {
    const buckets: Record<PriBucket, { task: TaskNode; index: number }[]> = { high: [], medium: [], low: [], tbd: [] }
    orderedTasks.forEach((t, i) => { if (!matchesQuery(t)) return; if (!hasLoggedTimeToday(t)) return; buckets[classifyPriority(t.priority)].push({ task: t, index: i }) })
    return PRI_BUCKETS.filter((b) => buckets[b].length > 0).map((b) => ({ bucket: b, items: buckets[b], label: PRIORITY_LABEL[b], sublabel: PRIORITY_META[b].sublabel, color: PRIORITY_COLOR[b], bg: PRIORITY_META[b].bg }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedTasks, matchesQuery, entries, timerRunningKey, timerStartedAt, checklistId])

  // Group header renderer
  function renderGroupHeader(key: string, label: string, sublabel: string, color: string, bg: string, count: number) {
    const collapsed = collapsedGroups.has(key)
    if (Platform.OS === 'web') {
      return (
        <div key={`hdr-${key}`} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', userSelect: 'none', backgroundColor: bg, borderBottom: collapsed ? 'none' : '1px solid #F3F4F6' }} onClick={() => toggleGroup(key)}>
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
      <Pressable key={`hdr-${key}`} onPress={() => toggleGroup(key)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: bg, borderBottomWidth: collapsed ? 0 : 1, borderBottomColor: '#F3F4F6' }}>
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

  // Toolbar
  const searchBar = (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 14, minHeight: 38 }}>
      {searchOpen ? (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 }}>
          <Search size={14} color="#94A3B8" />
          <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search today's tasks" placeholderTextColor="#94A3B8" autoFocus style={{ flex: 1, fontSize: 13, color: '#374151', paddingVertical: 0, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : null) }} />
          <Pressable onPress={() => { setSearchQuery(''); setSearchOpen(false) }} hitSlop={8} style={{ padding: 2 }}><X size={14} color="#94A3B8" /></Pressable>
        </View>
      ) : (
        <>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            {(['priority', 'time', 'inProgress', 'calendar'] as const).map((v) => {
              const active = groupBy === v
              return (
                <Pressable key={v} onPress={() => { setGroupBy(v); setCollapsedGroups(new Set()) }} style={{ paddingVertical: 8, paddingHorizontal: 2, marginRight: 16, borderBottomWidth: 2, borderBottomColor: active ? INDIGO : 'transparent' }}>
                  <Text style={{ fontSize: 12, fontWeight: active ? '600' : '400', color: active ? INDIGO : '#6B7280' }}>{v === 'priority' ? 'By Priority' : v === 'time' ? 'By Time' : v === 'inProgress' ? 'In Progress' : 'Calendar'}</Text>
                </Pressable>
              )
            })}
            {/* Hierarchy mode is controlled from Settings */}
            <View style={{ marginLeft: 8, justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{hierarchyMode ? 'Hierarchy' : 'Flat'}</Text>
            </View>
          </View>
          <Pressable onPress={() => setSearchOpen(true)} hitSlop={8} style={{ padding: 6 }}>
            <Search size={15} color={searchQuery !== '' ? INDIGO : '#94A3B8'} />
          </Pressable>
        </>
      )}
    </View>
  )

  // Hierarchy-aware row renderer
  const renderGroups = () => {
    const source = groupBy === 'time' ? timeGroups : groupBy === 'inProgress' ? inProgressGroups : priorityGroups
    return (source as Array<{ bucket: string; items: Array<{ task: TaskNode; index: number; depth?: number; ancestorLines?: boolean[]; isLast?: boolean }>; count?: number; label?: string; sublabel?: string; color?: string; bg?: string }>).map(({ bucket, items, count, label, sublabel, color, bg }) => {
      const collapsed = collapsedGroups.has(bucket)
      // Header count reflects full bucket membership (all today tasks attributed
      // to this bucket), independent of expand/collapse — matching the Tasks tab.
      const header = renderGroupHeader(bucket, label ?? bucket, sublabel ?? '', color ?? '#666', bg ?? '#F3F4F6', count ?? items.length)
      if (collapsed) {
        if (Platform.OS === 'web') return <div key={bucket}>{header}</div>
        return <View key={bucket}>{header}</View>
      }
      const rows = items.map(({ task: t, index, depth: itemDepth, ancestorLines, isLast }) => {
        const entry = getEntry(t.id)
        const isDone = !!entry?.completedAt || t.status === 1
        const hasExecution = !!entry && (entry.actualSeconds > 0 || !!entry.completedAt)
        const isCurrent = index === currentIndex
        const isSelected = selectedIndices.has(index)
        const isDragging = draggingIdx === index
        const showDropBefore = insertIdx !== null && insertIdx === index && draggingIdx !== null && draggingIdx !== index && draggingIdx !== index - 1
        const bgColor = isCurrent ? '#E0E7FF' : 'white'
        const k = entryKey(checklistId, t.id)
        const elapsed = entry ? liveSeconds(entry, timerRunningKey, timerStartedAt, k) : 0
        const timeLabel = isDone || elapsed > 0 ? fmtMins(elapsed) : `${entry?.estimateMin ?? DEFAULT_ESTIMATE}m`

        const depth = hierarchyMode ? (itemDepth ?? 0) : 0
        const hasChildren = hierarchyMode && hierarchy?.childMap.get(t.id) && (hierarchy.childMap.get(t.id)!.length > 0)
        const isExpanded = expandedRootIds.has(t.id)

        const connectorLines = hierarchyMode && depth > 0 ? (
          <HierConnector depth={depth} ancestorLines={ancestorLines ?? []} isLast={isLast ?? true} highlight={isCurrent} />
        ) : null

        const cardInner = (
          <Pressable
            onPress={() => { if (draggingIdx === null) jumpTo(index) }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 10, paddingVertical: 7,
              borderRadius: 8, marginHorizontal: 4, marginVertical: 2,
              backgroundColor: bgColor, opacity: isDragging ? 0.3 : 1,
              borderLeftWidth: 3, borderLeftColor: isCurrent ? BLUE : 'transparent',
              borderWidth: 1, borderColor: '#F1F5F9',
              ...(hierarchyMode && depth > 0 ? { marginLeft: depth * 22 + 4 } : {}),
            }}
          >
            {hasChildren ? (
              <Pressable hitSlop={6} onPress={(e) => { e.stopPropagation?.(); toggleExpand(t.id) }} style={{ width: 20, alignItems: 'center', justifyContent: 'center' }}>
                {isExpanded
                  ? <ChevronDown size={16} color="#4772FA" />
                  : <ChevronRight size={16} color="#6B7280" />}
              </Pressable>
            ) : (
              <View style={{ width: 20, alignItems: 'center' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#CBD5E1' }} />
              </View>
            )}
            <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); completeTask(t.id) }} style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: isDone ? '#22c55e' : '#D1D5DB', backgroundColor: isDone ? '#22c55e' : 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {isDone && <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: 'white' }} />}
            </Pressable>
            {Platform.OS === 'web' ? (
              <div onPointerDown={(e) => onGripPointerDown(e, index)} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', opacity: 0.55 }}><GripVertical size={14} color="#9CA3AF" /></div>
            ) : (
              <GestureDetector gesture={makeNativeGesture(index)}><View hitSlop={8} style={{ opacity: 0.55 }}><GripVertical size={14} color="#9CA3AF" /></View></GestureDetector>
            )}
            <View style={{ width: 26 }} />
            <Text style={{ fontSize: 10, color: '#C4C4C4', fontWeight: '500', width: 16, textAlign: 'right' }}>{index + 1}</Text>
            {isDone && <CheckCircle2 size={15} color="#22c55e" />}

            {/* Content wrapper: title + meta line (non-columnMode), or title + inline badges (columnMode) */}
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* Title line */}
              <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: isDone ? '#C4C4C4' : isCurrent ? '#111827' : '#4B5563', textDecorationLine: isDone ? 'line-through' : 'none', fontWeight: isCurrent ? '600' : '400' }}><InlineMarkdown content={t.content} /></Text>

              {/* Metadata line: date + priority + time badge + tags */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {/* Date chip */}
                <Pressable hitSlop={6} onPress={(e) => { e.stopPropagation?.(); setPriorityEditTaskId(null); setDateEditTaskId(t.id) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}>
                  <Calendar size={9} color={t.due ? (isPast(parseApiDate(t.due)!) && !isToday(parseApiDate(t.due)!) ? '#DC2626' : '#6B7280') : '#9ca3af'} />
                  <Text style={{ fontSize: 9, fontWeight: '500', color: t.due ? (isPast(parseApiDate(t.due)!) && !isToday(parseApiDate(t.due)!) ? '#DC2626' : '#6B7280') : '#9ca3af' }}>{t.due ? humanizeDueDate(t.due) : 'Date'}</Text>
                </Pressable>

                {/* Priority chip */}
                <Pressable hitSlop={6} onPress={(e) => { e.stopPropagation?.(); setDateEditTaskId(null); setPriorityEditTaskId(t.id) }} style={{ borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: t.priority > 0 && t.priority <= 10 ? (priorityRowBg(t.priority) ?? '#F3F4F6') : '#F3F4F6' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: t.priority > 0 && t.priority <= 10 ? priorityTextColor(t.priority) : '#9ca3af' }}>{t.priority > 0 && t.priority <= 10 ? priorityDisplay(t.priority) : 'P?'}</Text>
                </Pressable>

                {/* Time badge */}
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: isDone ? '#F0FDF4' : elapsed > 0 ? '#EEF2FF' : '#F9FAFB' }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: isDone ? '#16A34A' : elapsed > 0 ? BLUE : '#9CA3AF' }}>{timeLabel}</Text>
                </View>

                {/* Tags */}
                {t.tags_as_text && (
                  <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '500', color: BLUE }}>
                    {t.tags_as_text.split(/\s+/).filter(Boolean).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')}
                  </Text>
                )}
              </View>
            </View>

            {/* Execute-only CTAs: raw/mindmap icons */}
            {onJumpToRaw && (
              <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); onJumpToRaw(t.id) }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center' }}>
                <AlignLeft size={16} color="#4F46E5" />
              </Pressable>
            )}
            {onJumpToMindmap && (
              <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation?.(); onJumpToMindmap(t.id) }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center', justifyContent: 'center' }}>
                <Network size={16} color="#B45309" />
              </Pressable>
            )}
          </Pressable>
        )

        if (Platform.OS === 'web') {
          return (
            <div key={t.id} data-execute-idx={index} ref={(el) => { if (el) cardDomRefs.current.set(index, el); else cardDomRefs.current.delete(index) }} onMouseDown={(e) => handleCardMouseDown(e, index)} style={{ position: 'relative' }}>
              {connectorLines}
              {showDropBefore && <div className="execute-drop-indicator" />}
              {cardInner}
            </div>
          )
        }
        return (
          <View key={t.id} ref={(r) => { if (r) nativeRowRefs.current.set(index, r); else nativeRowRefs.current.delete(index) }} style={{ position: 'relative' }}>
            {connectorLines}
            {showDropBefore && <View style={{ height: 2, backgroundColor: BLUE, borderRadius: 1, marginBottom: 6 }} />}
            {cardInner}
          </View>
        )
      })
      if (Platform.OS === 'web') return <div key={bucket}>{header}{rows}</div>
      return <View key={bucket}>{header}{rows}</View>
    })
  }

  const listContent = (
    <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }} scrollEnabled={draggingIdx === null} style={{ backgroundColor: '#FAFAFA' }} onLayout={(e) => setPanelWidth(e.nativeEvent.layout.width)}>
      {renderGroups()}
      {searchQuery.trim() !== '' && priorityGroups.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 6 }}>
          <Search size={20} color="#CBD5E1" />
          <Text style={{ fontSize: 13, color: '#94A3B8' }}>No tasks match "{searchQuery.trim()}"</Text>
        </View>
      )}
      {groupBy === 'inProgress' && inProgressGroups.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 6 }}>
          <Timer size={20} color="#CBD5E1" />
          <Text style={{ fontSize: 13, color: '#94A3B8' }}>Nothing in progress yet today</Text>
          <Text style={{ fontSize: 11, color: '#CBD5E1' }}>Tasks appear here once you log time on them</Text>
        </View>
      )}
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
          onSelect={(d) => {
            setDateEditTaskId(null)
            updateTask({ taskId: dateEditTask.id, payload: { due_date: d } })
          }}
          onClose={() => setDateEditTaskId(null)}
          isMobile
        />
      )}
      {priorityEditTask && (
        <BottomSheet open onClose={() => setPriorityEditTaskId(null)} title="Set Priority">
          <PriorityPicker
            value={priorityEditTask.priority}
            onChange={(p) => {
              setPriorityEditTaskId(null)
              updateTask({ taskId: priorityEditTask.id, payload: { priority: p } })
            }}
          />
        </BottomSheet>
      )}
    </>
  )

  const columnLabelStyle = { fontSize: 9, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 } as const
  const columnHeader = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginHorizontal: 4, paddingTop: 8, paddingBottom: 5, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#EDEFF2' }}>
      <View style={{ width: 13 }} /><View style={{ width: 26 }} /><View style={{ width: 16 }} /><View style={{ width: 15 }} />
      <Text style={[columnLabelStyle, { flex: 1 }]}>TASK</Text>
      <View style={{ width: COL_TAGS }}><Text style={columnLabelStyle}>TAGS</Text></View>
      <View style={{ width: COL_TIME }}><Text style={columnLabelStyle}>TIME</Text></View>
      <View style={{ width: COL_DATE }}><Text style={columnLabelStyle}>DUE</Text></View>
      <View style={{ width: COL_PRI }}><Text style={columnLabelStyle}>PRI</Text></View>
      {onJumpToRaw && <View style={{ width: 12 }} />}
      {onJumpToMindmap && <View style={{ width: 12 }} />}
    </View>
  )

  const calendarPane = (
    <CalendarScheduleView tasks={orderedTasks} checklistId={checklistId} getEstimateMin={(t) => getEntry(t.id)?.estimateMin ?? DEFAULT_ESTIMATE} jumpTo={jumpTo} playTask={(index) => playTask(index)} updateTask={updateTask} onJumpToRaw={onJumpToRaw} onJumpToMindmap={onJumpToMindmap} onExpand={onCloseSidePanel} searchQuery={searchQuery} />
  )

  if (Platform.OS === 'web') {
    return (
      <>
        <div ref={leftPanelRef} tabIndex={0} onKeyDown={onLeftPanelKeyDown} className="execute-left-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {searchBar}
          {groupBy === 'calendar' ? calendarPane : (<>{columnMode && columnHeader}{listContent}</>)}
        </div>
        {pickers}
      </>
    )
  }
  return <>{searchBar}{groupBy === 'calendar' ? calendarPane : listContent}{pickers}</>
}

// ─── Full standalone view ────────────────────────────────────────────────────

interface ExecuteModeViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  onClose: () => void
  onJumpToRaw?: (taskId: number) => void
  onJumpToMindmap?: (taskId: number) => void
  onSwitchToLog?: () => void
}

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
    currentTask, isRunning, currentEntry, orderedTasks,
    currentIndex, jumpTo, editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    togglePlay, adjust, setEstimateDirect, complete, resetCurrent, prevTask, nextTask, updateTask, checklistId,
    onJumpToRaw, onJumpToMindmap, entries, timerRunningKey, timerStartedAt,
    completedStreak,
  } = useExecCtx()
  const remoteSessions = useSystemLog((s) => s.remoteSessions)
  const sessionLog = useExecuteLog((s) => s.sessionLog)
  const currentSessionKey = useExecuteLog((s) => s.currentSessionKey)

  const { width } = useWindowDimensions()
  const isMobile = width < 768
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const { sessionCount, sessionTotalSeconds } = useMemo(() => summarizeDaySessions(todayStr, sessionLog, remoteSessions, currentSessionKey, timerStartedAt), [sessionLog, remoteSessions, currentSessionKey, timerStartedAt, todayStr])

  const [editingEstimate, setEditingEstimate] = useState(false)
  const [estimateDraft, setEstimateDraft] = useState('')
  const [showFullScreen, setShowFullScreen] = useState(false)

  const todayKey = useMemo(() => `focus_intention_${format(new Date(), 'yyyy-MM-dd')}`, [])
  const [showIntention, setShowIntention] = useState(() => { try { return !localStorage.getItem(`focus_intention_${format(new Date(), 'yyyy-MM-dd')}`) } catch { return false } })
  const [intentionDraft, setIntentionDraft] = useState('')
  const savedIntention = (() => { try { return localStorage.getItem(todayKey) ?? '' } catch { return '' } })()
  function submitIntention() {
    const text = intentionDraft.trim()
    try { if (text) localStorage.setItem(todayKey, text) } catch { /* ignore */ }
    setShowIntention(false)
    if (text) { const idx = orderedTasks.findIndex(t => t.content.toLowerCase().includes(text.toLowerCase())); if (idx >= 0) jumpTo(idx) }
  }

  const [focusMode, setFocusMode] = useState(false)
  const [pomodoroOn, setPomodoroOn] = useState(false)
  const [pomodoroSecs, setPomodoroSecs] = useState(POMO_WORK_SECS)
  const [pomodoroIsBreak, setPomodoroIsBreak] = useState(false)
  const isRunningRef = useRef(isRunning)
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])
  const togglePlayRef = useRef(togglePlay)
  useEffect(() => { togglePlayRef.current = togglePlay }, [togglePlay])

  useEffect(() => { if (!pomodoroOn || (!pomodoroIsBreak && !isRunning)) return; const id = setInterval(() => setPomodoroSecs(s => Math.max(0, s - 1)), 1000); return () => clearInterval(id) }, [pomodoroOn, pomodoroIsBreak, isRunning])
  useEffect(() => { if (!pomodoroOn || pomodoroSecs > 0) return; if (!pomodoroIsBreak) { if (isRunningRef.current) togglePlayRef.current(); setPomodoroIsBreak(true); setPomodoroSecs(POMO_BREAK_SECS) } else { setPomodoroIsBreak(false); setPomodoroSecs(POMO_WORK_SECS) } }, [pomodoroSecs, pomodoroOn])
  function togglePomodoro() { if (pomodoroOn) { setPomodoroIsBreak(false); setPomodoroSecs(POMO_WORK_SECS) }; setPomodoroOn(p => !p) }
  function skipBreak() { setPomodoroIsBreak(false); setPomodoroSecs(POMO_WORK_SECS) }
  function commitEstimate() { const v = parseInt(estimateDraft, 10); if (!isNaN(v) && v > 0) setEstimateDirect(v); setEditingEstimate(false) }

  if (orderedTasks.length === 0) {
    return <View className="flex-1 items-center justify-center gap-2 p-8" style={{ backgroundColor: '#F0F2F5' }}><Text className="text-sm text-gray-400">No tasks due today.</Text></View>
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#F0F2F5' }}>
      <View>
        <Pressable onPress={onSwitchToLog} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9' }}>
          <Clock size={13} color={INDIGO} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{sessionCount} {sessionCount === 1 ? 'session' : 'sessions'}</Text>
          <Text style={{ fontSize: 12, color: '#94A3B8' }}>·</Text>
          <Text style={{ fontSize: 12, color: '#64748B' }}>{fmtDuration(sessionTotalSeconds)}</Text>
          <View style={{ flex: 1 }} />
          {completedStreak > 0 && (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}><Zap size={10} color="#F59E0B" fill="#F59E0B" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B' }}>{completedStreak}</Text></View>)}
          {savedIntention ? (
            <Pressable onPress={() => setShowIntention(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F0FDF4', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, maxWidth: 100 }}><Target size={10} color="#16A34A" /><Text style={{ fontSize: 10, fontWeight: '600', color: '#16A34A' }} numberOfLines={1}>{savedIntention}</Text></Pressable>
          ) : (
            <Pressable onPress={() => setShowIntention(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 }}><Target size={10} color="#CBD5E1" /><Text style={{ fontSize: 10, color: '#CBD5E1' }}>intention</Text></Pressable>
          )}
        </Pressable>
      </View>

      {focusMode ? (<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.4 }}><EyeOff size={28} color="#9ca3af" /><Text style={{ fontSize: 12, color: '#9ca3af' }}>Task list hidden — stay focused</Text></View>) : (<ExecuteTaskList />)}

      <Modal visible={showIntention} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, gap: 20 }}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}><Target size={24} color={BLUE} /></View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center' }}>What's your ONE task today?</Text>
              <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 }}>Pick the single task that would make today a success. Everything else is secondary.</Text>
            </View>
            <TextInput value={intentionDraft} onChangeText={setIntentionDraft} placeholder="Type your most important task..." placeholderTextColor="#C4C4C4" autoFocus onSubmitEditing={submitIntention} style={{ fontSize: 15, fontWeight: '500', color: '#111827', borderWidth: 1.5, borderColor: BLUE, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }} />
            <Pressable onPress={submitIntention} style={{ backgroundColor: BLUE, borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}><Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Start focused session →</Text></Pressable>
            <Pressable onPress={() => setShowIntention(false)} style={{ alignItems: 'center' }}><Text style={{ fontSize: 13, color: '#9ca3af' }}>Skip for now</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={pomodoroOn && pomodoroIsBreak} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 32, width: '100%', maxWidth: 360, gap: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 40 }}>🧘</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#111827' }}>Break time</Text>
            <FlipClock totalSeconds={pomodoroSecs} color="#16A34A" size="lg" />
            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>Look away from the screen.{'\n'}Take slow breaths or close your eyes.{'\n'}Let your brain consolidate the work.</Text>
            <Pressable onPress={skipBreak} style={{ paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#F3F4F6', borderRadius: 20 }}><Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280' }}>Skip break</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}