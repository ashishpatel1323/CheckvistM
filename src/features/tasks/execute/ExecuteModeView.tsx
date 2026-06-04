import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
import { View, Text, Pressable, ScrollView, Platform, TextInput } from 'react-native'
import { Play, Pause, Minus, Plus, Check, RotateCcw, Circle, CheckCircle2, GripVertical, Calendar, Pencil, X, ChevronLeft, ChevronRight, AlignLeft } from 'lucide-react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate, classifyTask, GROUP_LABELS, type DateGroup } from '@/lib/dateSort'
import { classifyPriority } from '@/features/tasks/list/PriorityDateView'
import {
  useExecuteLog,
  entryKey,
  liveSeconds,
  DEFAULT_ESTIMATE,
  ESTIMATE_STEP,
  type ExecuteLogEntry,
} from './useExecuteLog'
import { priorityTextColor, priorityDisplay, priorityRowBg, PriorityPicker } from '@/features/tasks/shared/PriorityPicker'
import { hapticMedium } from '@/platform/haptics'
import { useUpdateTask } from '@/features/tasks/list/useTasksQuery'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { humanizeDueDate, parseApiDate } from '@/lib/dateUtils'
import { isToday, isPast } from 'date-fns'

const BLUE = '#4772FA'

// ─── Group header helpers ──────────────────────────────────────────────────────

const DATE_ACCENT: Record<DateGroup, string> = {
  overdue:   '#EF4444',
  today:     '#4772FA',
  tomorrow:  '#8B5CF6',
  thisWeek:  '#059669',
  later:     '#6B7280',
  noDueDate: '#D1D5DB',
}

const PRIORITY_LABEL: Record<'urgent' | 'important' | 'delegate' | 'tbd', string> = {
  urgent:    'High',
  important: 'Medium',
  delegate:  'Low',
  tbd:       'TBD',
}

const PRIORITY_COLOR: Record<'urgent' | 'important' | 'delegate' | 'tbd', string> = {
  urgent:    '#EF4444',
  important: '#F59E0B',
  delegate:  '#22C55E',
  tbd:       '#8B5CF6',
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

function fmtMins(seconds: number): string {
  const m = Math.round(seconds / 60)
  return `${m}m`
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
  dayProgressPct: number
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
  adjust: (delta: number) => void
  setEstimateDirect: (mins: number) => void
  complete: () => void
  resetCurrent: () => void
  jumpTo: (index: number) => void
  prevTask: () => void
  nextTask: () => void
  persistOrder: (newIds: number[]) => void
  updateTask: ReturnType<typeof useUpdateTask>['mutate']
  // Config
  checklistId: number
  onJumpToRaw?: (taskId: number) => void
}

const ExecCtx = createContext<ExecCtxValue | null>(null)

function useExecCtx(): ExecCtxValue {
  const ctx = useContext(ExecCtx)
  if (!ctx) throw new Error('useExecCtx must be used inside ExecuteStateProvider')
  return ctx
}

// ─── State Provider ───────────────────────────────────────────────────────────

interface ProviderProps {
  tasks: CheckvistTask[]
  checklistId: number
  onJumpToRaw?: (taskId: number) => void
  children: ReactNode
}

export function ExecuteStateProvider({ tasks, checklistId, onJumpToRaw, children }: ProviderProps) {
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

  const { entries, timerRunningKey, timerStartedAt, seed, setEstimate, play, pause, markCompleted, reset } = useExecuteLog()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [, setTick] = useState(0)
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

  useEffect(() => {
    for (const t of todayTasks) {
      seed(entryKey(checklistId, t.id), t.id, t.duration?.minutes ?? DEFAULT_ESTIMATE)
    }
  }, [todayTasks, checklistId, seed])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timerRunningKey) {
      intervalRef.current = setInterval(() => setTick((n) => n + 1), 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerRunningKey])


  const currentTask = orderedTasks[currentIndex]
  const currentKey = currentTask ? entryKey(checklistId, currentTask.id) : null
  const isRunning = timerRunningKey === currentKey && currentKey !== null

  const getEntry = (taskId: number): ExecuteLogEntry | undefined =>
    entries[entryKey(checklistId, taskId)]

  const currentEntry = currentTask ? getEntry(currentTask.id) : undefined
  const currentSeconds = currentEntry && currentKey
    ? liveSeconds(currentEntry, timerRunningKey, timerStartedAt, currentKey)
    : 0

  const dayProgressPct = ((now.getHours() * 60 + now.getMinutes()) / (24 * 60)) * 100
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

  const togglePlay = () => { if (!currentKey) return; isRunning ? pause() : play(currentKey) }
  const adjust = (delta: number) => { if (!currentKey || !currentEntry) return; setEstimate(currentKey, currentEntry.estimateMin + delta) }
  const setEstimateDirect = (mins: number) => { if (!currentKey) return; setEstimate(currentKey, Math.max(1, mins)) }
  const complete = () => {
    if (!currentKey) return
    markCompleted(currentKey)
    const completedId = orderedIds[currentIndex]
    const newIds = [completedId, ...orderedIds.filter((id) => id !== completedId)]
    setOrderedIds(newIds)
    persistOrder(newIds)
    setCurrentIndex((ci) => Math.min(ci, orderedTasks.length - 2 > 0 ? orderedTasks.length - 2 : 0))
  }
  const resetCurrent = () => { if (!currentKey) return; reset(currentKey) }
  const jumpTo = (index: number) => setCurrentIndex(index)
  const prevTask = () => setCurrentIndex((ci) => Math.max(0, ci - 1))
  const nextTask = () => setCurrentIndex((ci) => Math.min(orderedTasks.length - 1, ci + 1))

  const value: ExecCtxValue = {
    orderedTasks, orderedIds, setOrderedIds, currentIndex, setCurrentIndex,
    currentTask, currentKey, currentEntry, isRunning, currentSeconds,
    completedCount, totalActualSeconds, totalEstimateSeconds, dayProgressPct, getEntry,
    entries, timerRunningKey, timerStartedAt,
    editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    togglePlay, adjust, setEstimateDirect, complete, resetCurrent, jumpTo, prevTask, nextTask, persistOrder, updateTask,
    checklistId, onJumpToRaw,
  }

  return <ExecCtx.Provider value={value}>{children}</ExecCtx.Provider>
}

// ─── Horizontal Control Bar (desktop split view) ──────────────────────────────

export function ExecuteControlBar({ onClose }: { onClose?: () => void }) {
  const {
    currentTask, currentSeconds, isRunning, currentEntry,
    editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    completedCount, orderedTasks, totalActualSeconds, totalEstimateSeconds, dayProgressPct,
    currentIndex,
    togglePlay, adjust, setEstimateDirect, complete, resetCurrent, prevTask, nextTask, updateTask, checklistId,
  } = useExecCtx()

  const [editingEstimate, setEditingEstimate] = useState(false)
  const [estimateDraft, setEstimateDraft] = useState('')

  function commitEstimate() {
    const v = parseInt(estimateDraft, 10)
    if (!isNaN(v) && v > 0) setEstimateDirect(v)
    setEditingEstimate(false)
  }

  const barBg = isRunning ? '#FFFFFF' : '#FFF5F5'
  const timerColor = isRunning ? '#1f2937' : '#DC2626'

  return (
    <View style={{ backgroundColor: barBg, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
      {/* Day progress bar: 00:00 → 23:59 */}
      <View style={{ height: 3, backgroundColor: '#E5E7EB' }}>
        <View style={{ height: 3, backgroundColor: BLUE, width: `${dayProgressPct}%` }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 }}>

        {/* Prev/Next arrows */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Pressable hitSlop={8} onPress={prevTask} style={{ opacity: currentIndex === 0 ? 0.25 : 1 }}>
            <ChevronLeft size={20} color="#6B7280" />
          </Pressable>
          <Text style={{ fontSize: 11, color: '#9ca3af', minWidth: 28, textAlign: 'center' }}>
            {orderedTasks.length > 0 ? `${currentIndex + 1}/${orderedTasks.length}` : '—'}
          </Text>
          <Pressable hitSlop={8} onPress={nextTask} style={{ opacity: currentIndex >= orderedTasks.length - 1 ? 0.25 : 1 }}>
            <ChevronRight size={20} color="#6B7280" />
          </Pressable>
        </View>

        <View style={{ width: 1, height: 36, backgroundColor: '#E5E7EB' }} />

        {/* Timer */}
        <Text style={{ fontSize: 32, fontWeight: '800', color: timerColor, letterSpacing: 1, minWidth: 90, textAlign: 'center' }}>
          {fmtClock(currentSeconds)}
        </Text>

        <View style={{ width: 1, height: 36, backgroundColor: '#E5E7EB' }} />

        {/* Task title */}
        <View style={{ flex: 1, minWidth: 0 }}>
          {currentTask ? (
            editingTitle ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
                  style={{ flex: 1, fontSize: 16, fontWeight: '600', color: '#222', borderBottomWidth: 1, borderBottomColor: BLUE, paddingBottom: 2 }}
                />
                <Pressable hitSlop={8} onPress={() => { setEditingTitle(false); setTitleDraft(currentTask.content) }}>
                  <X size={14} color="#9ca3af" />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => { setTitleDraft(currentTask.content); setEditingTitle(true) }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: '#1a1a1a' }} numberOfLines={1}>
                  {currentTask.content}
                </Text>
                <Pencil size={13} color="#9ca3af" />
              </Pressable>
            )
          ) : (
            <Text style={{ fontSize: 14, color: '#9ca3af' }}>No tasks due today</Text>
          )}
        </View>

        <View style={{ width: 1, height: 36, backgroundColor: '#E5E7EB' }} />

        {/* Metadata chips */}
        <View style={{ position: 'relative' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flexDirection: 'row', alignItems: 'center' }} style={{ maxWidth: 300 }}>
            {/* Done progress */}
            <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F0FDF4' }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#16A34A' }}>
                {completedCount}/{orderedTasks.length} done
              </Text>
            </View>

            {/* Time */}
            <View style={{ borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#EEF2FF' }}>
              <Text style={{ fontSize: 11, fontWeight: '500', color: BLUE }}>
                {fmtMins(totalActualSeconds)}/{fmtMins(totalEstimateSeconds)}
              </Text>
            </View>

            {/* Estimate — inline editable */}
            {currentEntry && (
              editingEstimate ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: BLUE }}>
                  <Text style={{ fontSize: 11, color: '#6B7280' }}>Est </Text>
                  <TextInput
                    value={estimateDraft}
                    onChangeText={setEstimateDraft}
                    keyboardType="number-pad"
                    autoFocus
                    selectTextOnFocus
                    onSubmitEditing={commitEstimate}
                    onBlur={commitEstimate}
                    style={{ fontSize: 11, fontWeight: '600', color: '#1a1a1a', minWidth: 22, maxWidth: 40 }}
                  />
                  <Text style={{ fontSize: 11, color: '#6B7280' }}>m</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => { setEstimateDraft(String(currentEntry.estimateMin)); setEditingEstimate(true) }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#6B7280' }}>Est {currentEntry.estimateMin}m</Text>
                  <Pencil size={9} color="#D1D5DB" />
                </Pressable>
              )
            )}

            {/* Date chip */}
            {currentTask && (
              <Pressable
                onPress={() => { setShowDatePicker((v) => !v); setShowPriorityPicker(false) }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderColor: showDatePicker ? BLUE : '#D1D5DB', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 }}
              >
                <Calendar size={10} color={currentTask.due ? (isPast(parseApiDate(currentTask.due)!) && !isToday(parseApiDate(currentTask.due)!) ? '#DC2626' : '#374151') : '#9ca3af'} />
                <Text style={{ fontSize: 11, fontWeight: '500', color: currentTask.due ? (isPast(parseApiDate(currentTask.due)!) && !isToday(parseApiDate(currentTask.due)!) ? '#DC2626' : '#374151') : '#9ca3af' }}>
                  {currentTask.due ? humanizeDueDate(currentTask.due) : 'Set date'}
                </Text>
                <Pencil size={9} color={showDatePicker ? BLUE : '#D1D5DB'} />
              </Pressable>
            )}

            {/* Priority chip */}
            {currentTask && (
              <Pressable
                onPress={() => { setShowPriorityPicker((v) => !v); setShowDatePicker(false) }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: currentTask.priority > 0 && currentTask.priority <= 10 ? (priorityRowBg(currentTask.priority) ?? '#f3f4f6') : '#f3f4f6', borderWidth: 1, borderColor: showPriorityPicker ? BLUE : 'transparent' }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: currentTask.priority > 0 && currentTask.priority <= 10 ? priorityTextColor(currentTask.priority) : '#9ca3af' }}>
                  {currentTask.priority > 0 && currentTask.priority <= 10 ? priorityDisplay(currentTask.priority) : 'No P'}
                </Text>
                <Pencil size={9} color={showPriorityPicker ? BLUE : '#D1D5DB'} />
              </Pressable>
            )}

            {/* Tags */}
            {currentTask?.tags_as_text && (
              currentTask.tags_as_text.split(/\s+/).filter(Boolean).map((tag) => (
                <Text key={tag} style={{ fontSize: 11, color: BLUE, fontWeight: '500' }}>
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </Text>
              ))
            )}
          </ScrollView>

          {/* Pickers - anchored below chip area */}
          {showDatePicker && currentTask && (
            <View style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200 }}>
              <QuickDatePicker
                taskId={currentTask.id}
                onSelect={(dateStr) => {
                  setShowDatePicker(false)
                  updateTask({ taskId: currentTask.id, payload: { due_date: dateStr } })
                }}
                onClose={() => setShowDatePicker(false)}
                isMobile={false}
              />
            </View>
          )}
          {showPriorityPicker && currentTask && (
            <View style={{ position: 'absolute', top: '100%', left: 0, zIndex: 200 }}>
              <PriorityPicker
                value={currentTask.priority}
                onChange={(p) => {
                  setShowPriorityPicker(false)
                  updateTask({ taskId: currentTask.id, payload: { priority: p } })
                }}
              />
            </View>
          )}
        </View>

        <View style={{ width: 1, height: 36, backgroundColor: '#E5E7EB' }} />

        {/* Controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable hitSlop={8} onPress={resetCurrent}>
            <RotateCcw size={20} color="#9ca3af" />
          </Pressable>
          <Pressable hitSlop={8} onPress={() => adjust(-ESTIMATE_STEP)}>
            <Minus size={24} color="#555" />
          </Pressable>
          <Pressable onPress={togglePlay} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center' }}>
            {isRunning ? <Pause size={22} color="white" /> : <Play size={22} color="white" />}
          </Pressable>
          <Pressable hitSlop={8} onPress={() => adjust(ESTIMATE_STEP)}>
            <Plus size={24} color="#555" />
          </Pressable>
          <Pressable onPress={complete} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={20} color="white" />
          </Pressable>
        </View>

        {/* Close button */}
        {onClose && (
          <>
            <View style={{ width: 1, height: 36, backgroundColor: '#E5E7EB' }} />
            <Pressable hitSlop={10} onPress={onClose}>
              <X size={18} color="#9ca3af" />
            </Pressable>
          </>
        )}
      </View>
    </View>
  )
}

// ─── Task list panel (shared between mobile and desktop) ─────────────────────

export function ExecuteTaskList() {
  const {
    orderedTasks, orderedIds, setOrderedIds, currentIndex, setCurrentIndex,
    isRunning, getEntry, entries, timerRunningKey, timerStartedAt,
    jumpTo, persistOrder, checklistId, onJumpToRaw,
  } = useExecCtx()

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

  // Build priority groups preserving flat orderedTasks indices for drag/keyboard
  type PriBucket = 'urgent' | 'important' | 'delegate' | 'tbd'
  const PRI_BUCKETS: PriBucket[] = ['urgent', 'important', 'delegate', 'tbd']
  const priorityGroups = useMemo(() => {
    const buckets: Record<PriBucket, { task: TaskNode; index: number }[]> = { urgent: [], important: [], delegate: [], tbd: [] }
    orderedTasks.forEach((t, index) => buckets[classifyPriority(t.priority)].push({ task: t, index }))
    return PRI_BUCKETS.filter((b) => buckets[b].length > 0).map((b) => ({ bucket: b, items: buckets[b] }))
  }, [orderedTasks])

  const [collapsedGroups, setCollapsedGroups] = useState<Set<PriBucket>>(new Set())
  function toggleGroup(b: PriBucket) {
    setCollapsedGroups((prev) => { const s = new Set(prev); s.has(b) ? s.delete(b) : s.add(b); return s })
  }

  const listContent = (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 6, paddingBottom: 32 }}
      scrollEnabled={draggingIdx === null}
    >
      {priorityGroups.map(({ bucket, items }) => {
        const collapsed = collapsedGroups.has(bucket)
        const priColor = PRIORITY_COLOR[bucket]
        const priLabel = PRIORITY_LABEL[bucket]

        const header = Platform.OS === 'web' ? (
          <div
            key={`hdr-${bucket}`}
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, padding: '8px 6px 4px', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggleGroup(bucket)}
          >
            <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priColor, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: priColor, letterSpacing: '0.4px' }}>
              {priLabel.toUpperCase()}
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 4 }}>{items.length}</span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{collapsed ? '›' : '⌄'}</span>
          </div>
        ) : (
          <Pressable
            key={`hdr-${bucket}`}
            onPress={() => toggleGroup(bucket)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 4 }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priColor }} />
            <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: priColor, letterSpacing: 0.4 }}>
              {priLabel.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 11, color: '#9ca3af', marginRight: 4 }}>{items.length}</Text>
            <ChevronRight size={12} color="#9ca3af" style={{ transform: [{ rotate: collapsed ? '0deg' : '90deg' }] }} />
          </Pressable>
        )

        const rows = collapsed ? null : items.map(({ task: t, index }) => {
          const entry = getEntry(t.id)
          const isDone = !!entry?.completedAt
          const isCurrent = index === currentIndex
          const isSelected = selectedIndices.has(index)
          const isDragging = draggingIdx === index
          const showDropBefore = insertIdx !== null && insertIdx === index && draggingIdx !== null && draggingIdx !== index && draggingIdx !== index - 1

          const bgColor = isCurrent ? '#EEF2FF' : isSelected ? '#F0F4FF' : 'transparent'

          const cardInner = (
            <Pressable
              onPress={() => { if (draggingIdx === null) jumpTo(index) }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 6, paddingVertical: 5, borderRadius: 6,
                backgroundColor: bgColor, opacity: isDragging ? 0.35 : 1,
                borderLeftWidth: isCurrent ? 2 : 0, borderLeftColor: BLUE,
              }}
            >
              {Platform.OS === 'web' ? (
                <div onPointerDown={(e) => onGripPointerDown(e, index)} style={{ cursor: 'grab', display: 'flex', alignItems: 'center' }}>
                  <GripVertical size={12} color="#D1D5DB" />
                </div>
              ) : (
                <GestureDetector gesture={makeNativeGesture(index)}>
                  <View hitSlop={8}><GripVertical size={12} color="#D1D5DB" /></View>
                </GestureDetector>
              )}
              <Text style={{ fontSize: 11, color: '#9ca3af', width: 18, textAlign: 'right' }}>{index + 1}.</Text>
              {isDone ? <CheckCircle2 size={14} color="#22c55e" /> : <Circle size={14} color="#d1d5db" />}
              <Text style={{ flex: 1, fontSize: 13, color: isDone ? '#9ca3af' : isCurrent ? '#1a1a1a' : '#374151', textDecorationLine: isDone ? 'line-through' : 'none', fontWeight: isCurrent ? '600' : '400' }} numberOfLines={1}>
                {t.content}
              </Text>
              <Text style={{ fontSize: 10, color: '#9ca3af' }}>
                {(() => {
                  const k = entryKey(checklistId, t.id)
                  const s = entry ? liveSeconds(entry, timerRunningKey, timerStartedAt, k) : 0
                  return isDone || s > 0 ? fmtMins(s) : `${entry?.estimateMin ?? DEFAULT_ESTIMATE}m`
                })()}
              </Text>
              {onJumpToRaw && (
                <Pressable hitSlop={6} onPress={(e) => { e.stopPropagation?.(); onJumpToRaw(t.id) }} style={{ paddingLeft: 2 }}>
                  <AlignLeft size={12} color="#9ca3af" />
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
          return <div key={bucket}>{header}{rows}</div>
        }
        return <View key={bucket}>{header}{rows}</View>
      })}

      {insertIdx === orderedTasks.length && draggingIdx !== null && draggingIdx !== orderedTasks.length - 1 && (
        <View style={{ height: 2, backgroundColor: BLUE, borderRadius: 1, marginHorizontal: 4, marginTop: 10 }} />
      )}
    </ScrollView>
  )

  if (Platform.OS === 'web') {
    return (
      <div
        ref={leftPanelRef}
        tabIndex={0}
        onKeyDown={onLeftPanelKeyDown}
        className="execute-left-panel"
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {listContent}
      </div>
    )
  }

  return listContent
}

// ─── Full standalone view (mobile / non-split desktop) ───────────────────────

interface ExecuteModeViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  onClose: () => void
  onJumpToRaw?: (taskId: number) => void
}

export function ExecuteModeView({ tasks, checklistId, onClose, onJumpToRaw }: ExecuteModeViewProps) {
  return (
    <ExecuteStateProvider tasks={tasks} checklistId={checklistId} onJumpToRaw={onJumpToRaw}>
      <ExecuteViewContent onClose={onClose} onJumpToRaw={onJumpToRaw} />
    </ExecuteStateProvider>
  )
}

function ExecuteViewContent({ onClose, onJumpToRaw }: { onClose: () => void; onJumpToRaw?: (taskId: number) => void }) {
  const {
    currentTask, currentSeconds, isRunning, currentEntry, orderedTasks,
    completedCount, totalActualSeconds, totalEstimateSeconds, dayProgressPct, currentIndex,
    editingTitle, setEditingTitle, titleDraft, setTitleDraft,
    showDatePicker, setShowDatePicker, showPriorityPicker, setShowPriorityPicker,
    togglePlay, adjust, setEstimateDirect, complete, resetCurrent, prevTask, nextTask, updateTask, checklistId,
  } = useExecCtx()

  const [editingEstimate, setEditingEstimate] = useState(false)
  const [estimateDraft, setEstimateDraft] = useState('')

  function commitEstimate() {
    const v = parseInt(estimateDraft, 10)
    if (!isNaN(v) && v > 0) setEstimateDirect(v)
    setEditingEstimate(false)
  }

  if (orderedTasks.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-2 p-8" style={{ backgroundColor: '#F5F5F5' }}>
        <Text className="text-sm text-gray-400">No tasks due today.</Text>
      </View>
    )
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#F5F5F5' }}>
      {/* Day progress bar: 00:00 → 23:59 */}
      <View style={{ height: 4, backgroundColor: '#E5E7EB' }}>
        <View style={{ height: 4, backgroundColor: BLUE, width: `${dayProgressPct}%` }} />
      </View>

      {/* Fixed header card */}
      <View>
        <View className="mx-4 mt-4 rounded-2xl p-6" style={{ gap: 12, backgroundColor: isRunning ? 'white' : '#FEF2F2' }}>
          {/* Arrow nav + timer */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Pressable hitSlop={12} onPress={prevTask} style={{ opacity: currentIndex === 0 ? 0.25 : 1 }}>
              <ChevronLeft size={24} color="#6B7280" />
            </Pressable>
            <Text style={{ fontSize: 56, fontWeight: '800', color: isRunning ? '#1f2937' : '#DC2626', letterSpacing: 1, textAlign: 'center', minWidth: 140 }}>
              {fmtClock(currentSeconds)}
            </Text>
            <Pressable hitSlop={12} onPress={nextTask} style={{ opacity: currentIndex >= orderedTasks.length - 1 ? 0.25 : 1 }}>
              <ChevronRight size={24} color="#6B7280" />
            </Pressable>
          </View>
          <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: -8 }}>
            {currentIndex + 1} of {orderedTasks.length}
          </Text>

          {/* Editable title */}
          {currentTask && (
            editingTitle ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  autoFocus
                  multiline
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
                  style={{ flex: 1, fontSize: 15, fontWeight: '600', color: '#222', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: BLUE, paddingBottom: 2 }}
                />
                <Pressable hitSlop={8} onPress={() => { setEditingTitle(false); setTitleDraft(currentTask.content) }}>
                  <X size={16} color="#9ca3af" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => { setTitleDraft(currentTask.content); setEditingTitle(true) }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Text className="text-base font-semibold text-center" style={{ color: '#222', flex: 1 }} numberOfLines={2}>
                  {currentTask.content}
                </Text>
                <Pencil size={13} color="#9ca3af" />
              </Pressable>
            )
          )}

          {/* Chips: estimate, date, priority */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 1 }}>

            {/* Estimate — inline editable */}
            {currentEntry && (
              editingEstimate ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: BLUE }}>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>Est. </Text>
                  <TextInput
                    value={estimateDraft}
                    onChangeText={setEstimateDraft}
                    keyboardType="number-pad"
                    autoFocus
                    selectTextOnFocus
                    onSubmitEditing={commitEstimate}
                    onBlur={commitEstimate}
                    style={{ fontSize: 12, fontWeight: '600', color: '#1a1a1a', minWidth: 24, maxWidth: 44 }}
                  />
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>m</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => { setEstimateDraft(String(currentEntry.estimateMin)); setEditingEstimate(true) }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B7280' }}>Est. {currentEntry.estimateMin}m</Text>
                  <Pencil size={10} color="#D1D5DB" />
                </Pressable>
              )
            )}

            {/* Date chip */}
            {currentTask && (
              <Pressable
                onPress={() => { setShowDatePicker((v) => !v); setShowPriorityPicker(false) }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: showDatePicker ? BLUE : '#D1D5DB', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}
              >
                <Calendar size={11} color={currentTask.due ? (isPast(parseApiDate(currentTask.due)!) && !isToday(parseApiDate(currentTask.due)!) ? '#DC2626' : '#374151') : '#9ca3af'} />
                <Text style={{ fontSize: 11, fontWeight: '500', color: currentTask.due ? (isPast(parseApiDate(currentTask.due)!) && !isToday(parseApiDate(currentTask.due)!) ? '#DC2626' : '#374151') : '#9ca3af' }}>
                  {currentTask.due ? humanizeDueDate(currentTask.due) : 'Set date'}
                </Text>
                <Pencil size={10} color={showDatePicker ? BLUE : '#D1D5DB'} />
              </Pressable>
            )}

            {/* Priority chip */}
            {currentTask && (
              <Pressable
                onPress={() => { setShowPriorityPicker((v) => !v); setShowDatePicker(false) }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: currentTask.priority > 0 && currentTask.priority <= 10 ? (priorityRowBg(currentTask.priority) ?? '#f3f4f6') : '#f3f4f6', borderWidth: 1, borderColor: showPriorityPicker ? BLUE : 'transparent' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: currentTask.priority > 0 && currentTask.priority <= 10 ? priorityTextColor(currentTask.priority) : '#9ca3af' }}>
                  {currentTask.priority > 0 && currentTask.priority <= 10 ? priorityDisplay(currentTask.priority) : 'No P'}
                </Text>
                <Pencil size={10} color={showPriorityPicker ? BLUE : '#D1D5DB'} />
              </Pressable>
            )}
          </ScrollView>

          {/* Tags */}
          {currentTask?.tags_as_text && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              {currentTask.tags_as_text.split(/\s+/).filter(Boolean).map((tag) => (
                <Text key={tag} style={{ fontSize: 11, color: BLUE, fontWeight: '500' }}>
                  {tag.startsWith('#') ? tag : `#${tag}`}
                </Text>
              ))}
            </ScrollView>
          )}

          {/* Jump to Raw */}
          {onJumpToRaw && currentTask && (
            <Pressable hitSlop={8} onPress={() => onJumpToRaw(currentTask.id)} className="flex-row items-center justify-center gap-1" style={{ opacity: 0.6 }}>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>Jump to Raw</Text>
            </Pressable>
          )}

          {/* Timer controls */}
          <View className="flex-row items-center justify-center mt-2" style={{ gap: 20 }}>
            <Pressable hitSlop={8} onPress={resetCurrent}><RotateCcw size={24} color="#9ca3af" /></Pressable>
            <Pressable hitSlop={8} onPress={() => adjust(-ESTIMATE_STEP)}><Minus size={28} color="#666" /></Pressable>
            <Pressable onPress={togglePlay} className="items-center justify-center rounded-full" style={{ width: 64, height: 64, backgroundColor: '#1f2937' }}>
              {isRunning ? <Pause size={28} color="white" /> : <Play size={28} color="white" />}
            </Pressable>
            <Pressable hitSlop={8} onPress={() => adjust(ESTIMATE_STEP)}><Plus size={28} color="#666" /></Pressable>
            <Pressable hitSlop={8} onPress={complete} className="items-center justify-center rounded-full" style={{ width: 40, height: 40, backgroundColor: '#16A34A' }}>
              <Check size={22} color="white" />
            </Pressable>
          </View>

          {showDatePicker && currentTask && (
            <QuickDatePicker
              taskId={currentTask.id}
              onSelect={(dateStr) => {
                setShowDatePicker(false)
                updateTask({ taskId: currentTask.id, payload: { due_date: dateStr } })
              }}
              onClose={() => setShowDatePicker(false)}
              isMobile={Platform.OS !== 'web'}
            />
          )}

          {showPriorityPicker && currentTask && (
            <PriorityPicker
              value={currentTask.priority}
              onChange={(p) => {
                setShowPriorityPicker(false)
                updateTask({ taskId: currentTask.id, payload: { priority: p } })
              }}
            />
          )}
        </View>

        <View className="mx-4 mt-4" style={{ gap: 10 }}>
          <View style={{ gap: 4 }}>
            <View className="flex-row justify-between">
              <Text className="text-xs font-medium" style={{ color: '#6B7280' }}>Tasks done</Text>
              <Text className="text-xs font-semibold" style={{ color: '#374151' }}>{completedCount}/{orderedTasks.length}</Text>
            </View>
            <View className="rounded-full overflow-hidden" style={{ height: 8, backgroundColor: '#E5E7EB' }}>
              <View className="rounded-full" style={{ height: 8, backgroundColor: '#22C55E', width: orderedTasks.length > 0 ? `${Math.round((completedCount / orderedTasks.length) * 100)}%` : '0%' }} />
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <View className="flex-row justify-between">
              <Text className="text-xs font-medium" style={{ color: '#6B7280' }}>Time spent</Text>
              <Text className="text-xs font-semibold" style={{ color: '#374151' }}>{fmtMins(totalActualSeconds)}/{fmtMins(totalEstimateSeconds)}</Text>
            </View>
            <View className="rounded-full overflow-hidden" style={{ height: 8, backgroundColor: '#E5E7EB' }}>
              <View className="rounded-full" style={{ height: 8, backgroundColor: totalActualSeconds > totalEstimateSeconds ? '#EF4444' : BLUE, width: totalEstimateSeconds > 0 ? `${Math.min(Math.round((totalActualSeconds / totalEstimateSeconds) * 100), 100)}%` : '0%' }} />
            </View>
          </View>
        </View>
      </View>

      {/* Scrollable task list */}
      <ExecuteTaskList />
    </View>
  )
}
