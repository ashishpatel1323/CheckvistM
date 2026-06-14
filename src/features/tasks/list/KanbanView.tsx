import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { ScrollView, View, Text, Pressable, Platform } from 'react-native'
import { format, addDays, addWeeks } from 'date-fns'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react-native'
import type { GroupedTasks, DateGroup } from '@/lib/dateSort'
import { GROUP_LABELS } from '@/lib/dateSort'
import { classifyPriority } from '@/features/tasks/shared/PriorityPicker'
import type { PriorityBucket } from '@/features/tasks/shared/PriorityPicker'
import { PRIORITY_BUCKETS, PRIORITY_META } from './PriorityDateView'
import { TIME_QUADRANTS, classifyTime } from './EisenhowerMatrixView'
import type { TimeBucket } from './EisenhowerMatrixView'
import { humanizeDueDate } from '@/lib/dateUtils'
import { priorityTextColor, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { useUpdateTask } from './useTasksQuery'
import type { TaskNode } from '@/lib/taskTree'
import { useRouter } from 'expo-router'
import { InlineMarkdown } from '@/components/InlineMarkdown'

// ─── Layout ───────────────────────────────────────────────────────────────────

const COL_W      = 220
const LABEL_W    = 110
const MIN_CELL_H = 80
const CARD_GAP   = 6

const KANBAN_DATE_GROUPS: DateGroup[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later']

const DATE_GROUP_COLOR: Record<DateGroup, string> = {
  overdue: '#EF4444', today: '#4772FA', tomorrow: '#8B5CF6',
  thisWeek: '#059669', later: '#6B7280', noDueDate: '#D1D5DB',
}

function dateForGroup(dg: DateGroup): string {
  const t = new Date()
  switch (dg) {
    case 'today':    return format(t, 'yyyy-MM-dd')
    case 'tomorrow': return format(addDays(t, 1), 'yyyy-MM-dd')
    case 'thisWeek': return format(addDays(t, 3), 'yyyy-MM-dd')
    case 'later':    return format(addWeeks(t, 2), 'yyyy-MM-dd')
    default:         return format(t, 'yyyy-MM-dd')
  }
}

const PRI_FOR_BUCKET: Record<PriorityBucket, number> = { high: 1, medium: 4, low: 7, tbd: 9 }

function computePosition(tgtTasks: TaskNode[], insertIdx: number): number {
  if (tgtTasks.length === 0) return 1
  if (insertIdx <= 0)               return Math.max(1, tgtTasks[0].position - 1)
  if (insertIdx >= tgtTasks.length) return tgtTasks[tgtTasks.length - 1].position + 1
  return tgtTasks[insertIdx].position
}

type GroupBy = 'priority' | 'time'

// ─── Web-only CSS ─────────────────────────────────────────────────────────────

const WEB_DROP_LINE_STYLE: React.CSSProperties = {
  height: 2, borderRadius: 1, backgroundColor: '#6366F1',
  margin: '3px 4px', boxShadow: '0 0 0 3px rgba(99,102,241,0.18)',
  pointerEvents: 'none',
}

function webCardStyle(isDragging: boolean): React.CSSProperties {
  return {
    backgroundColor: 'white', borderRadius: 8, padding: 8,
    border: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 5,
    cursor: 'grab', opacity: isDragging ? 0.3 : 1,
    boxShadow: isDragging ? '0 0 0 2px #6366F1' : '0 1px 3px rgba(0,0,0,0.05)',
    transition: 'opacity 0.1s',
    userSelect: 'none',
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Swimlane key is either a PriorityBucket or a TimeBucket
type SwimlaneKey = PriorityBucket | TimeBucket

interface DragState { taskId: number; srcDg: DateGroup; srcSwimKey: SwimlaneKey }
interface DropTarget { dg: DateGroup; swimKey: SwimlaneKey; insertIdx: number }

// ─── Card ─────────────────────────────────────────────────────────────────────

function KanbanCard({
  task, checklistId, isDragging, groupBy, onDragStart, onHoverTop, onHoverBottom,
}: {
  task: TaskNode; checklistId: number; isDragging: boolean; groupBy: GroupBy
  onDragStart: () => void
  onHoverTop: () => void
  onHoverBottom: () => void
}) {
  const router = useRouter()

  function detectHalf(e: React.DragEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    e.clientY < rect.top + rect.height / 2 ? onHoverTop() : onHoverBottom()
  }

  const body = (
    <>
      <Text style={{ fontSize: 12, color: '#1a1a1a', lineHeight: 17 }}>
        <InlineMarkdown content={task.content} />
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {groupBy === 'priority' && task.priority > 0 && (
          <Text style={{ fontSize: 10, fontWeight: '700', color: priorityTextColor(task.priority) }}>
            {priorityDisplay(task.priority)}
          </Text>
        )}
        {task.due && <Text style={{ fontSize: 10, color: '#9CA3AF' }}>{humanizeDueDate(task.due)}</Text>}
        {task.duration && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Clock size={9} color="#9CA3AF" />
            <Text style={{ fontSize: 10, color: '#9CA3AF' }}>{task.duration.formatted}</Text>
          </View>
        )}
      </View>
    </>
  )

  if (Platform.OS !== 'web') {
    return (
      <Pressable onPress={() => router.push(`/${checklistId}/tasks/${task.id}`)}
        style={{ backgroundColor: 'white', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#F1F5F9', gap: 5, opacity: isDragging ? 0.3 : 1 }}>
        {body}
      </Pressable>
    )
  }

  return (
    // eslint-disable-next-line react-native/no-inline-styles
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(task.id))
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); detectHalf(e) }}
      onDragOver={(e) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        detectHalf(e)
      }}
      onClick={() => router.push(`/${checklistId}/tasks/${task.id}`)}
      style={webCardStyle(isDragging)}
    >
      {body}
    </div>
  )
}

// ─── Drop line ────────────────────────────────────────────────────────────────

function DropLine() {
  if (Platform.OS !== 'web') return null
  // eslint-disable-next-line react-native/no-inline-styles
  return <div style={WEB_DROP_LINE_STYLE} />
}

// ─── Group-by toggle ──────────────────────────────────────────────────────────

function GroupByToggle({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 16 }}>
      {(['priority', 'time'] as GroupBy[]).map((v) => {
        const active = value === v
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            style={{ paddingVertical: 10, paddingHorizontal: 4, marginRight: 20, borderBottomWidth: 2, borderBottomColor: active ? '#E8632A' : 'transparent' }}
          >
            <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? '#E8632A' : '#6B7280' }}>
              {v === 'priority' ? 'By Priority' : 'By Time'}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ─── Swimlane cell ────────────────────────────────────────────────────────────

function KanbanCell({
  tasks, checklistId, dg, swimKey, swimColor, swimBg, groupBy,
  isOver, insertIdx, dragState, dropRef, collapsed,
  onDragStart, setDrop, handleDrop,
}: {
  tasks: TaskNode[]; checklistId: number; dg: DateGroup
  swimKey: SwimlaneKey; swimColor: string; swimBg: string
  groupBy: GroupBy; isOver: boolean; insertIdx: number
  dragState: DragState | null
  dropRef: React.MutableRefObject<DropTarget | null>
  collapsed: boolean
  onDragStart: (t: TaskNode) => void
  setDrop: (dg: DateGroup, swimKey: SwimlaneKey, idx: number) => void
  handleDrop: (e: React.DragEvent, dg: DateGroup, swimKey: SwimlaneKey) => void
}) {
  const inner = (
    <View style={{
      width: COL_W,
      borderRightWidth: 1, borderRightColor: '#E2E8F0',
      minHeight: collapsed ? 36 : MIN_CELL_H,
      padding: collapsed ? 0 : 6,
      justifyContent: collapsed ? 'center' : 'flex-start',
      backgroundColor: isOver ? swimBg + '88' : tasks.length === 0 ? '#FAFAFA' : 'white',
    }}>
      {collapsed ? (
        <Text style={{ fontSize: 10, color: '#CBD5E1', textAlign: 'center' }}>
          {tasks.length > 0 ? `${tasks.length}` : '—'}
        </Text>
      ) : (
        <>
          {isOver && insertIdx === 0 && <DropLine />}
          {tasks.map((t, i) => (
            <View key={t.id}>
              <KanbanCard
                task={t}
                checklistId={checklistId}
                isDragging={dragState?.taskId === t.id}
                groupBy={groupBy}
                onDragStart={() => onDragStart(t)}
                onHoverTop={() => setDrop(dg, swimKey, i)}
                onHoverBottom={() => setDrop(dg, swimKey, i + 1)}
              />
              {isOver && insertIdx === i + 1 && <DropLine />}
              {i < tasks.length - 1 && !(isOver && insertIdx === i + 1) && (
                <View style={{ height: CARD_GAP }} />
              )}
            </View>
          ))}
          {tasks.length === 0 && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: MIN_CELL_H - 12, opacity: 0.35 }}>
              <Text style={{ fontSize: 10, color: '#94A3B8' }}>Drop here</Text>
            </View>
          )}
        </>
      )}
    </View>
  )

  if (Platform.OS !== 'web') return <View key={`${dg}-${swimKey}`}>{inner}</View>

  return (
    // eslint-disable-next-line react-native/no-inline-styles
    <div
      key={`${dg}-${swimKey}`}
      style={{ display: 'flex', flexDirection: 'column' }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDrop(dg, swimKey, tasks.length)
      }}
      onDragEnter={(e) => {
        if (tasks.length === 0) { e.preventDefault(); setDrop(dg, swimKey, 0) }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          dropRef.current = null
        }
      }}
      onDrop={(e) => handleDrop(e, dg, swimKey)}
    >
      {inner}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function KanbanView({ groups, checklistId }: { groups: GroupedTasks[]; checklistId: number }) {
  const { mutate: updateTask } = useUpdateTask(checklistId)

  const [groupBy, setGroupBy]       = useState<GroupBy>('priority')
  const [collapsed, setCollapsed]   = useState<Set<SwimlaneKey>>(new Set())
  const [dragState,  setDragState]  = useState<DragState | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const dragRef = useRef<DragState | null>(null)
  const dropRef = useRef<DropTarget | null>(null)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    function onDragEnd() {
      dragRef.current = null
      dropRef.current = null
      setDragState(null)
      setDropTarget(null)
    }
    document.addEventListener('dragend', onDragEnd)
    return () => document.removeEventListener('dragend', onDragEnd)
  }, [])

  // ─── Cell maps ─────────────────────────────────────────────────────────────

  // By priority: cells[dg][bucket] = tasks
  const priCells = useMemo(() => {
    const cells = new Map<DateGroup, Map<PriorityBucket, TaskNode[]>>()
    const active: DateGroup[] = []
    for (const dg of KANBAN_DATE_GROUPS) {
      const g = groups.find((g) => g.group === dg)
      if (!g) continue
      const byPri = new Map<PriorityBucket, TaskNode[]>()
      for (const b of PRIORITY_BUCKETS) byPri.set(b, [])
      for (const t of g.tasks) byPri.get(classifyPriority(t.priority))!.push(t)
      cells.set(dg, byPri)
      active.push(dg)
    }
    const activeSwims = PRIORITY_BUCKETS.filter((b) =>
      active.some((dg) => (cells.get(dg)?.get(b)?.length ?? 0) > 0)
    )
    return { cells, activeDateGroups: active, activeSwims }
  }, [groups])

  // By time: cells[dg][timeBucket] = tasks
  const timeCells = useMemo(() => {
    const cells = new Map<DateGroup, Map<TimeBucket, TaskNode[]>>()
    const active: DateGroup[] = []
    for (const dg of KANBAN_DATE_GROUPS) {
      const g = groups.find((g) => g.group === dg)
      if (!g) continue
      const byTime = new Map<TimeBucket, TaskNode[]>()
      for (const q of TIME_QUADRANTS) byTime.set(q.bucket, [])
      for (const t of g.tasks) byTime.get(classifyTime(t))!.push(t)
      cells.set(dg, byTime)
      active.push(dg)
    }
    const activeSwims = TIME_QUADRANTS.map((q) => q.bucket).filter((tb) =>
      active.some((dg) => (cells.get(dg)?.get(tb)?.length ?? 0) > 0)
    )
    return { cells, activeDateGroups: active, activeSwims }
  }, [groups])

  const { cells, activeDateGroups, activeSwims } = groupBy === 'priority'
    ? priCells
    : timeCells

  // ─── Drag handlers ─────────────────────────────────────────────────────────

  const startDrag = useCallback((task: TaskNode, srcDg: DateGroup, srcSwimKey: SwimlaneKey) => {
    const ds: DragState = { taskId: task.id, srcDg, srcSwimKey }
    dragRef.current = ds
    requestAnimationFrame(() => setDragState(ds))
  }, [])

  const setDrop = useCallback((dg: DateGroup, swimKey: SwimlaneKey, insertIdx: number) => {
    const cur = dropRef.current
    if (cur?.dg === dg && cur.swimKey === swimKey && cur.insertIdx === insertIdx) return
    const next: DropTarget = { dg, swimKey, insertIdx }
    dropRef.current = next
    setDropTarget(next)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dg: DateGroup, swimKey: SwimlaneKey) => {
    e.preventDefault()
    const ds = dragRef.current
    const dt = dropRef.current
    if (!ds) return

    const rawTgt = groupBy === 'priority'
      ? (priCells.cells.get(dg)?.get(swimKey as PriorityBucket) ?? [])
      : (timeCells.cells.get(dg)?.get(swimKey as TimeBucket) ?? [])
    const tgtTasks = rawTgt.filter((t) => t.id !== ds.taskId)
    const insertIdx = (dt?.dg === dg && dt.swimKey === swimKey) ? dt.insertIdx : tgtTasks.length

    const payload: Record<string, string | number> = {}
    if (dg !== ds.srcDg) payload.due_date = dateForGroup(dg)
    if (groupBy === 'priority' && swimKey !== ds.srcSwimKey) {
      payload.priority = PRI_FOR_BUCKET[swimKey as PriorityBucket]
    }
    payload.position = computePosition(tgtTasks, insertIdx)

    updateTask({ taskId: ds.taskId, payload: payload as Parameters<typeof updateTask>[0]['payload'] })

    dragRef.current = null
    dropRef.current = null
    setDragState(null)
    setDropTarget(null)
  }, [groupBy, priCells, timeCells, updateTask])

  // ─── Swimlane meta ─────────────────────────────────────────────────────────

  function swimMeta(key: SwimlaneKey): { label: string; sublabel: string; color: string; bg: string } {
    if (groupBy === 'priority') {
      const m = PRIORITY_META[key as PriorityBucket]
      return { label: m.label, sublabel: m.sublabel, color: m.color, bg: m.bg }
    }
    const q = TIME_QUADRANTS.find((q) => q.bucket === key)!
    return { label: q.label, sublabel: q.sublabel, color: q.color, bg: q.bg }
  }

  function cellTasks(dg: DateGroup, swimKey: SwimlaneKey): TaskNode[] {
    if (groupBy === 'priority') return cells.get(dg)?.get(swimKey as PriorityBucket) ?? []
    return (timeCells.cells.get(dg)?.get(swimKey as TimeBucket) ?? [])
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} showsVerticalScrollIndicator>
      <GroupByToggle value={groupBy} onChange={(v) => { setGroupBy(v); setCollapsed(new Set()) }} />
      <ScrollView horizontal showsHorizontalScrollIndicator scrollEnabled={dragState === null}>
        <View>

          {/* Column headers (always date groups) */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#E2E8F0', backgroundColor: 'white' }}>
            <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: '#E2E8F0' }} />
            {activeDateGroups.map((dg) => {
              const total = activeSwims.reduce((s, sk) => s + cellTasks(dg, sk).length, 0)
              return (
                <View key={dg} style={{
                  width: COL_W, flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderRightWidth: 1, borderRightColor: '#E2E8F0',
                  borderTopWidth: 3, borderTopColor: DATE_GROUP_COLOR[dg],
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', flex: 1 }}>{GROUP_LABELS[dg]}</Text>
                  {total > 0 && (
                    <View style={{ backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B' }}>{total}</Text>
                    </View>
                  )}
                </View>
              )
            })}
          </View>

          {/* Swimlane rows */}
          {activeSwims.map((swimKey) => {
            const meta       = swimMeta(swimKey)
            const isCollapsed = collapsed.has(swimKey)
            const totalRow   = activeDateGroups.reduce((s, dg) => s + cellTasks(dg, swimKey).length, 0)

            return (
              <View key={String(swimKey)} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>

                {/* Swimlane label */}
                <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: meta.bg + '99' }}>
                  <Pressable
                    onPress={() => setCollapsed((prev) => { const n = new Set(prev); n.has(swimKey) ? n.delete(swimKey) : n.add(swimKey); return n })}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 }}
                  >
                    {isCollapsed ? <ChevronRight size={12} color={meta.color} /> : <ChevronDown size={12} color={meta.color} />}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {meta.label}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>{totalRow} task{totalRow !== 1 ? 's' : ''}</Text>
                    </View>
                  </Pressable>
                  {!isCollapsed && (
                    <Text style={{ fontSize: 9, color: '#CBD5E1', paddingHorizontal: 10, paddingBottom: 8, lineHeight: 13 }}>
                      {meta.sublabel}
                    </Text>
                  )}
                </View>

                {/* Cells per date column */}
                {activeDateGroups.map((dg) => (
                  <KanbanCell
                    key={dg}
                    tasks={cellTasks(dg, swimKey)}
                    checklistId={checklistId}
                    dg={dg}
                    swimKey={swimKey}
                    swimColor={meta.color}
                    swimBg={meta.bg}
                    groupBy={groupBy}
                    isOver={dropTarget?.dg === dg && dropTarget?.swimKey === swimKey}
                    insertIdx={dropTarget?.dg === dg && dropTarget?.swimKey === swimKey ? dropTarget.insertIdx : -1}
                    dragState={dragState}
                    dropRef={dropRef}
                    collapsed={isCollapsed}
                    onDragStart={(t) => startDrag(t, dg, swimKey)}
                    setDrop={setDrop}
                    handleDrop={handleDrop}
                  />
                ))}
              </View>
            )
          })}
        </View>
      </ScrollView>
    </ScrollView>
  )
}
