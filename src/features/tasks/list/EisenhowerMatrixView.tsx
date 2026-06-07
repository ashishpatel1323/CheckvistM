import { useRef, useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, Platform, Alert } from 'react-native'
import { CheckSquare, Flag, Zap, Clock, HelpCircle, Timer, ChevronDown } from 'lucide-react-native'
import type { CheckvistTask } from '@/api/types'
import { classifyPriority, type PriorityBucket, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { classifyTask } from '@/lib/dateSort'
import { useUpdateTask } from './useTasksQuery'
import { useOrderedTaskGroup } from '@/features/tasks/shared/useOrderedTaskGroup'
import { InlineMarkdown } from '@/components/InlineMarkdown'

// Date filter options for the matrix view
export type MatrixDateFilter = 'today' | 'tomorrow' | 'thisWeek' | 'overdue' | 'later' | 'noDueDate' | 'all'

const DATE_FILTER_OPTIONS: { key: MatrixDateFilter; label: string }[] = [
  { key: 'today',      label: 'Today'     },
  { key: 'tomorrow',   label: 'Tomorrow'  },
  { key: 'thisWeek',   label: 'This Week' },
  { key: 'overdue',    label: 'Overdue'   },
  { key: 'later',      label: 'Later'     },
  { key: 'noDueDate',  label: 'No Date'   },
  { key: 'all',        label: 'All'       },
]

function matchesDateFilter(task: CheckvistTask, filter: MatrixDateFilter): boolean {
  if (filter === 'all') return true
  const bucket = classifyTask({ ...task, children: [], depth: 0 } as Parameters<typeof classifyTask>[0])
  return bucket === filter
}

function DateFilterPicker({
  value,
  onChange,
}: {
  value: MatrixDateFilter
  onChange: (v: MatrixDateFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const label = DATE_FILTER_OPTIONS.find((o) => o.key === value)?.label ?? 'Today'
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 10, paddingVertical: 5,
          backgroundColor: '#F3F4F6', borderRadius: 8,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{label}</Text>
        <ChevronDown size={12} color="#6B7280" />
      </Pressable>
      {open && (
        <View style={{
          position: 'absolute', top: 32, right: 0, zIndex: 100,
          backgroundColor: '#fff', borderRadius: 10,
          shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 12, elevation: 12,
          paddingVertical: 4, minWidth: 120,
        }}>
          {DATE_FILTER_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => { onChange(opt.key); setOpen(false) }}
              style={{
                paddingHorizontal: 14, paddingVertical: 9,
                backgroundColor: value === opt.key ? '#EEF2FF' : 'transparent',
              }}
            >
              <Text style={{ fontSize: 13, color: value === opt.key ? '#4772FA' : '#374151', fontWeight: value === opt.key ? '600' : '400' }}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

// ─── Priority Matrix ──────────────────────────────────────────────────────────

interface QuadrantConfig {
  bucket: PriorityBucket
  label: string
  sublabel: string
  color: string
  bg: string
  border: string
  targetPriority: number
  Icon: typeof Zap
}

const QUADRANTS: [QuadrantConfig, QuadrantConfig, QuadrantConfig, QuadrantConfig] = [
  {
    bucket: 'high',
    label: 'Must Do',
    sublabel: 'Urgent & Important',
    color: '#b91c1c',
    bg: '#FEF2F2',
    border: '#FECACA',
    targetPriority: 1,
    Icon: Zap,
  },
  {
    bucket: 'medium',
    label: 'Nice to Have',
    sublabel: 'Important, Not Urgent',
    color: '#b45309',
    bg: '#FFFBEB',
    border: '#FDE68A',
    targetPriority: 4,
    Icon: Flag,
  },
  {
    bucket: 'low',
    label: 'Quick Wins',
    sublabel: 'Urgent, Delegate',
    color: '#15803d',
    bg: '#F0FDF4',
    border: '#BBF7D0',
    targetPriority: 7,
    Icon: CheckSquare,
  },
  {
    bucket: 'tbd',
    label: 'TBD / Blocked',
    sublabel: 'Not Urgent, Not Important',
    color: '#7c3aed',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    targetPriority: 9,
    Icon: HelpCircle,
  },
]

// ─── Time Matrix ──────────────────────────────────────────────────────────────

export type TimeBucket = 'tbd' | '5min' | '10min' | 'long'

const TIME_TAG_MAP: Record<Exclude<TimeBucket, 'tbd'>, string> = {
  '5min': '#5min',
  '10min': '#10min',
  long: '#long',
}

const ALL_TIME_TAGS = Object.values(TIME_TAG_MAP)

interface TimeQuadrantConfig {
  bucket: TimeBucket
  label: string
  sublabel: string
  color: string
  bg: string
  border: string
  Icon: typeof Timer
}

const TIME_QUADRANTS: [TimeQuadrantConfig, TimeQuadrantConfig, TimeQuadrantConfig, TimeQuadrantConfig] = [
  {
    bucket: 'tbd',
    label: 'Block 1',
    sublabel: 'No time defined',
    color: '#6B7280',
    bg: '#F9FAFB',
    border: '#E5E7EB',
    Icon: HelpCircle,
  },
  {
    bucket: '5min',
    label: 'Block 2',
    sublabel: '≤ 5 minutes',
    color: '#0369a1',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    Icon: Timer,
  },
  {
    bucket: '10min',
    label: 'Block 3',
    sublabel: '> 5 min up to 10 min',
    color: '#0891b2',
    bg: '#ECFEFF',
    border: '#A5F3FC',
    Icon: Timer,
  },
  {
    bucket: 'long',
    label: 'Block 4',
    sublabel: '> 10 minutes',
    color: '#b45309',
    bg: '#FFFBEB',
    border: '#FDE68A',
    Icon: Clock,
  },
]

function classifyTime(task: CheckvistTask): TimeBucket {
  const tags = task.tags_as_text ?? ''
  // Explicit tag assignments take priority
  if (tags.includes('#5min')) return '5min'
  if (tags.includes('#10min')) return '10min'
  if (tags.includes('#long')) return 'long'
  // Fall back to duration field if available
  if (task.duration) {
    const m = task.duration.minutes
    if (m <= 5) return '5min'
    if (m <= 10) return '10min'
    return 'long'
  }
  // No time info → TBD (Block 1)
  return 'tbd'
}

function buildTimeTagsString(task: CheckvistTask, newBucket: TimeBucket): string {
  const existingTags = (task.tags_as_text ?? '')
    .split(/\s+/)
    .filter((t) => t && !ALL_TIME_TAGS.includes(t))
    .join(' ')
    .trim()

  // TBD means no time tag at all
  if (newBucket === 'tbd') return existingTags

  const newTag = TIME_TAG_MAP[newBucket]
  return existingTags ? `${existingTags} ${newTag}` : newTag
}

// ─── Web drag hooks ───────────────────────────────────────────────────────────

function useDraggableRef(onDragStart: () => void) {
  const ref = useRef<View>(null)
  const cbRef = useRef(onDragStart)
  cbRef.current = onDragStart

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const el = ref.current as unknown as HTMLElement | null
    if (!el) return
    el.setAttribute('draggable', 'true')
    el.style.cursor = 'grab'
    const handler = (e: DragEvent) => {
      e.dataTransfer?.setData('text/plain', 'matrix-drag')
      el.style.opacity = '0.5'
      cbRef.current()
    }
    const endHandler = () => { el.style.opacity = '1' }
    el.addEventListener('dragstart', handler)
    el.addEventListener('dragend', endHandler)
    return () => {
      el.removeEventListener('dragstart', handler)
      el.removeEventListener('dragend', endHandler)
    }
  }, [])

  return ref
}

function useDropZoneRef(
  onDragOver: () => void,
  onDragLeave: () => void,
  onDrop: () => void,
) {
  const ref = useRef<View>(null)
  const cbs = useRef({ onDragOver, onDragLeave, onDrop })
  cbs.current = { onDragOver, onDragLeave, onDrop }

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const el = ref.current as unknown as HTMLElement | null
    if (!el) return

    const overHandler = (e: DragEvent) => { e.preventDefault(); cbs.current.onDragOver() }
    const leaveHandler = () => cbs.current.onDragLeave()
    const dropHandler = (e: DragEvent) => { e.preventDefault(); cbs.current.onDrop() }

    el.addEventListener('dragover', overHandler)
    el.addEventListener('dragleave', leaveHandler)
    el.addEventListener('drop', dropHandler)
    return () => {
      el.removeEventListener('dragover', overHandler)
      el.removeEventListener('dragleave', leaveHandler)
      el.removeEventListener('drop', dropHandler)
    }
  }, [])

  return ref
}

// ─── MatrixTaskCard ───────────────────────────────────────────────────────────

interface MatrixTaskCardProps {
  task: CheckvistTask
  quadrantColor: string
  onDragStart: () => void
  onLongPress: () => void
  showTimeBadge?: boolean
  isCurrent?: boolean
  isSelected?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
}

function MatrixTaskCard({ task, quadrantColor, onDragStart, onLongPress, showTimeBadge, isCurrent, isSelected, onMouseDown }: MatrixTaskCardProps) {
  const dragRef = useDraggableRef(onDragStart)
  const timeBucket = showTimeBadge ? classifyTime(task) : null

  return (
    <View
      ref={dragRef}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(onMouseDown ? { onMouseDown } as any : {})}
      style={{
        backgroundColor: isSelected ? '#EEF2FF' : isCurrent ? '#F5F7FF' : 'white',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginBottom: 4,
        borderLeftWidth: isCurrent ? 4 : 3,
        borderLeftColor: isCurrent ? '#4772FA' : quadrantColor,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }}
    >
      <Pressable onLongPress={onLongPress} delayLongPress={400}>
        <Text style={{ fontSize: 13, color: '#1F2937', lineHeight: 18 }} numberOfLines={2}>
          <InlineMarkdown content={task.content} />
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {task.priority > 0 && !showTimeBadge && (
            <Text style={{ fontSize: 11, color: quadrantColor, fontWeight: '600' }}>
              {priorityDisplay(task.priority)}
            </Text>
          )}
          {showTimeBadge && timeBucket && timeBucket !== 'tbd' && (
            <Text style={{ fontSize: 11, color: quadrantColor, fontWeight: '600' }}>
              {TIME_TAG_MAP[timeBucket as Exclude<TimeBucket, 'tbd'>]}
            </Text>
          )}
          {task.duration && (
            <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
              {task.duration.formatted}
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  )
}

// ─── MatrixQuadrant (generic) ─────────────────────────────────────────────────

interface MatrixQuadrantProps<TBucket extends string> {
  config: { bucket: TBucket; label: string; sublabel: string; color: string; bg: string; border: string; Icon: typeof Zap }
  tasks: CheckvistTask[]
  checklistId: number
  isDropTarget: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  onCardDragStart: (task: CheckvistTask) => void
  onMoveTo: (task: CheckvistTask) => void
  showTimeBadge?: boolean
}

function MatrixQuadrant<TBucket extends string>({
  config, tasks, checklistId, isDropTarget,
  onDragOver, onDragLeave, onDrop,
  onCardDragStart, onMoveTo, showTimeBadge,
}: MatrixQuadrantProps<TBucket>) {
  const dropRef = useDropZoneRef(onDragOver, onDragLeave, onDrop)
  const { Icon } = config

  // Same keyboard navigation/reorder/selection model as the Execute tab,
  // scoped to this quadrant's task list (order persisted via task `position`).
  const { orderedTasks, currentIndex, selectedIndices, onItemMouseDown, onKeyDown, panelRef } =
    useOrderedTaskGroup(tasks, checklistId)

  const setRefs = (el: View | null) => {
    (dropRef as React.MutableRefObject<View | null>).current = el
    if (Platform.OS === 'web') panelRef.current = el as unknown as HTMLDivElement | null
  }

  return (
    <View
      ref={setRefs}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(Platform.OS === 'web' ? { tabIndex: 0, onKeyDown } as any : {})}
      style={{
        flex: 1,
        backgroundColor: isDropTarget ? config.bg : 'white',
        borderRadius: 12,
        borderWidth: isDropTarget ? 2 : 1,
        borderColor: isDropTarget ? config.color : config.border,
        overflow: 'hidden',
        minHeight: 180,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: config.bg,
          borderBottomWidth: 1,
          borderBottomColor: config.border,
        }}
      >
        <Icon size={14} color={config.color} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: config.color }}>{config.label}</Text>
          <Text style={{ fontSize: 10, color: config.color, opacity: 0.7 }}>{config.sublabel}</Text>
        </View>
        <View
          style={{
            backgroundColor: config.color,
            borderRadius: 10,
            minWidth: 20,
            height: 20,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 5,
          }}
        >
          <Text style={{ fontSize: 11, color: 'white', fontWeight: '700' }}>{tasks.length}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1, padding: 8 }} showsVerticalScrollIndicator={false}>
        {orderedTasks.length === 0 ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Drop tasks here</Text>
          </View>
        ) : (
          orderedTasks.map((task, index) => (
            <MatrixTaskCard
              key={task.id}
              task={task}
              quadrantColor={config.color}
              onDragStart={() => onCardDragStart(task)}
              onLongPress={() => onMoveTo(task)}
              showTimeBadge={showTimeBadge}
              isCurrent={index === currentIndex}
              isSelected={selectedIndices.has(index)}
              onMouseDown={Platform.OS === 'web' ? (e) => onItemMouseDown(e, index) : undefined}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}

// ─── TimeMatrixContent ────────────────────────────────────────────────────────

interface TimeMatrixContentProps {
  tasks: CheckvistTask[]
  checklistId: number
  isMobile: boolean
  dateFilter: MatrixDateFilter
}

function TimeMatrixContent({ tasks, checklistId, isMobile, dateFilter }: TimeMatrixContentProps) {
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const [dropTarget, setDropTarget] = useState<TimeBucket | null>(null)
  const draggedTask = useRef<CheckvistTask | null>(null)

  const openTasks = tasks.filter((t) => t.status === 0 && matchesDateFilter(t, dateFilter))

  const bucketTasks: Record<TimeBucket, CheckvistTask[]> = {
    tbd: [], '5min': [], '10min': [], long: [],
  }
  for (const task of openTasks) {
    bucketTasks[classifyTime(task)].push(task)
  }

  const handleDrop = useCallback((targetBucket: TimeBucket) => {
    const task = draggedTask.current
    if (!task) return
    draggedTask.current = null
    setDropTarget(null)
    if (classifyTime(task) === targetBucket) return
    const tags_as_text = buildTimeTagsString(task, targetBucket)
    updateTask({ taskId: task.id, payload: { tags_as_text } })
  }, [updateTask])

  const handleNativeLongPress = (task: CheckvistTask) => {
    Alert.alert(
      'Move to time block',
      task.content,
      [
        ...TIME_QUADRANTS
          .filter((q) => q.bucket !== classifyTime(task))
          .map((q) => ({
            text: `${q.label} · ${q.sublabel}`,
            onPress: () => {
              const tags_as_text = buildTimeTagsString(task, q.bucket)
              updateTask({ taskId: task.id, payload: { tags_as_text } })
            },
          })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    )
  }

  const renderQuadrant = (config: TimeQuadrantConfig) => (
    <MatrixQuadrant
      key={config.bucket}
      config={config}
      tasks={bucketTasks[config.bucket]}
      checklistId={checklistId}
      isDropTarget={dropTarget === config.bucket}
      onDragOver={() => setDropTarget(config.bucket)}
      onDragLeave={() => setDropTarget(null)}
      onDrop={() => handleDrop(config.bucket)}
      onCardDragStart={(task) => { draggedTask.current = task }}
      onMoveTo={handleNativeLongPress}
      showTimeBadge
    />
  )

  const hint = isMobile ? 'Long-press a card to move it' : 'Drag cards between blocks to assign time'

  if (openTasks.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Clock size={40} color="#D1D5DB" />
        <Text style={{ marginTop: 12, fontSize: 15, color: '#6B7280', fontWeight: '500' }}>No tasks due today</Text>
        <Text style={{ marginTop: 4, fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
          Tasks with today's due date will appear here.
        </Text>
      </View>
    )
  }

  if (isMobile) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>
          Today · {openTasks.length} task{openTasks.length !== 1 ? 's' : ''} · {hint}
        </Text>
        {TIME_QUADRANTS.map((config) => (
          <View key={config.bucket} style={{ minHeight: 160 }}>
            {renderQuadrant(config)}
          </View>
        ))}
      </ScrollView>
    )
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
        Today · {openTasks.length} task{openTasks.length !== 1 ? 's' : ''} · {hint}
      </Text>
      <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, flexDirection: 'column', gap: 12 }}>
          {renderQuadrant(TIME_QUADRANTS[0])}
          {renderQuadrant(TIME_QUADRANTS[2])}
        </View>
        <View style={{ flex: 1, flexDirection: 'column', gap: 12 }}>
          {renderQuadrant(TIME_QUADRANTS[1])}
          {renderQuadrant(TIME_QUADRANTS[3])}
        </View>
      </View>
    </View>
  )
}

// ─── PriorityMatrixContent ────────────────────────────────────────────────────

interface PriorityMatrixContentProps {
  tasks: CheckvistTask[]
  checklistId: number
  isMobile: boolean
  dateFilter: MatrixDateFilter
}

function PriorityMatrixContent({ tasks, checklistId, isMobile, dateFilter }: PriorityMatrixContentProps) {
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const [dropTarget, setDropTarget] = useState<PriorityBucket | null>(null)
  const draggedTask = useRef<CheckvistTask | null>(null)

  const todayTasks = tasks.filter((t) => {
    if (t.status !== 0) return false
    return matchesDateFilter(t, dateFilter)
  })

  const quadrantTasks: Record<PriorityBucket, CheckvistTask[]> = {
    high: [], medium: [], low: [], tbd: [],
  }
  for (const task of todayTasks) {
    quadrantTasks[classifyPriority(task.priority)].push(task)
  }

  const handleDrop = useCallback((targetBucket: PriorityBucket) => {
    const task = draggedTask.current
    if (!task) return
    draggedTask.current = null
    setDropTarget(null)
    if (classifyPriority(task.priority) === targetBucket) return
    const config = QUADRANTS.find((q) => q.bucket === targetBucket)!
    updateTask({ taskId: task.id, payload: { priority: config.targetPriority } })
  }, [updateTask])

  const handleNativeLongPress = (task: CheckvistTask) => {
    Alert.alert(
      'Move to quadrant',
      task.content,
      [
        ...QUADRANTS
          .filter((q) => q.bucket !== classifyPriority(task.priority))
          .map((q) => ({
            text: q.label,
            onPress: () => updateTask({ taskId: task.id, payload: { priority: q.targetPriority } }),
          })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    )
  }

  if (todayTasks.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Clock size={40} color="#D1D5DB" />
        <Text style={{ marginTop: 12, fontSize: 15, color: '#6B7280', fontWeight: '500' }}>No tasks due today</Text>
        <Text style={{ marginTop: 4, fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
          Tasks with today's due date will appear here for prioritization.
        </Text>
      </View>
    )
  }

  const renderQuadrant = (config: QuadrantConfig) => (
    <MatrixQuadrant
      key={config.bucket}
      config={config}
      tasks={quadrantTasks[config.bucket]}
      checklistId={checklistId}
      isDropTarget={dropTarget === config.bucket}
      onDragOver={() => setDropTarget(config.bucket)}
      onDragLeave={() => setDropTarget(null)}
      onDrop={() => handleDrop(config.bucket)}
      onCardDragStart={(task) => { draggedTask.current = task }}
      onMoveTo={handleNativeLongPress}
    />
  )

  if (isMobile) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 12 }}>
        <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>
          Today · {todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''} · Long-press a card to move it
        </Text>
        {QUADRANTS.map((config) => (
          <View key={config.bucket} style={{ minHeight: 160 }}>
            {renderQuadrant(config)}
          </View>
        ))}
      </ScrollView>
    )
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
        Today · {todayTasks.length} task{todayTasks.length !== 1 ? 's' : ''} · Drag cards between quadrants to reprioritize
      </Text>
      <View style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, flexDirection: 'column', gap: 12 }}>
          {renderQuadrant(QUADRANTS[0])}
          {renderQuadrant(QUADRANTS[2])}
        </View>
        <View style={{ flex: 1, flexDirection: 'column', gap: 12 }}>
          {renderQuadrant(QUADRANTS[1])}
          {renderQuadrant(QUADRANTS[3])}
        </View>
      </View>
    </View>
  )
}

// ─── EisenhowerMatrixView ─────────────────────────────────────────────────────

type MatrixTab = 'priority' | 'time'

interface EisenhowerMatrixViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  isMobile: boolean
}

export function EisenhowerMatrixView({ tasks, checklistId, isMobile }: EisenhowerMatrixViewProps) {
  const [activeTab, setActiveTab] = useState<MatrixTab>('priority')
  const [dateFilter, setDateFilter] = useState<MatrixDateFilter>('today')

  return (
    <View style={{ flex: 1 }}>
      {/* Tab bar + date picker */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
          backgroundColor: 'white',
          paddingHorizontal: 16,
        }}
      >
        <View style={{ flexDirection: 'row', flex: 1 }}>
          {([
            { key: 'priority' as MatrixTab, label: 'By Priority' },
            { key: 'time' as MatrixTab, label: 'By Time' },
          ] as const).map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => setActiveTab(key)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 4,
                marginRight: 20,
                borderBottomWidth: 2,
                borderBottomColor: activeTab === key ? '#E8632A' : 'transparent',
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: activeTab === key ? '600' : '400',
                  color: activeTab === key ? '#E8632A' : '#6B7280',
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <DateFilterPicker value={dateFilter} onChange={setDateFilter} />
      </View>

      {/* Content */}
      {activeTab === 'priority' ? (
        <PriorityMatrixContent tasks={tasks} checklistId={checklistId} isMobile={isMobile} dateFilter={dateFilter} />
      ) : (
        <TimeMatrixContent tasks={tasks} checklistId={checklistId} isMobile={isMobile} dateFilter={dateFilter} />
      )}
    </View>
  )
}
