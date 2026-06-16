import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { ScrollView, View, Text, Pressable, Platform } from 'react-native'
import { format, addDays, addWeeks } from 'date-fns'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react-native'
import type { GroupedTasks, DateGroup } from '@/lib/dateSort'
import { GROUP_LABELS, classifyTask } from '@/lib/dateSort'
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

const COL_W           = 220
const COL_COLLAPSED_W = 36
const LABEL_W         = 110
const MIN_CELL_H      = 80
const CARD_GAP        = 6

const KANBAN_DATE_GROUPS: DateGroup[] = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'noDueDate']

// Mindmap-inspired palette: bg (card tint), stroke (border/accent), text (label)
const DATE_GROUP_THEME: Record<DateGroup, { bg: string; bgLight: string; stroke: string; text: string }> = {
  overdue:   { bg: '#fecaca', bgLight: '#fff1f1', stroke: '#ef4444', text: '#7f1d1d' },
  today:     { bg: '#bfdbfe', bgLight: '#eff6ff', stroke: '#3b82f6', text: '#1e3a8a' },
  tomorrow:  { bg: '#c4b5fd', bgLight: '#f5f3ff', stroke: '#7c3aed', text: '#3b0764' },
  thisWeek:  { bg: '#bbf7d0', bgLight: '#f0fdf4', stroke: '#22c55e', text: '#14532d' },
  later:     { bg: '#fde68a', bgLight: '#fffbeb', stroke: '#f59e0b', text: '#78350f' },
  noDueDate: { bg: '#e2e8f0', bgLight: '#f8fafc', stroke: '#94a3b8', text: '#334155' },
}

// Keep backwards-compat alias for places that just need the accent color
const DATE_GROUP_COLOR: Record<DateGroup, string> = Object.fromEntries(
  Object.entries(DATE_GROUP_THEME).map(([k, v]) => [k, v.stroke])
) as Record<DateGroup, string>

function dateForGroup(dg: DateGroup): string | null {
  const t = new Date()
  switch (dg) {
    case 'today':      return format(t, 'yyyy-MM-dd')
    case 'tomorrow':   return format(addDays(t, 1), 'yyyy-MM-dd')
    case 'thisWeek':   return format(addDays(t, 3), 'yyyy-MM-dd')
    case 'later':      return format(addWeeks(t, 2), 'yyyy-MM-dd')
    case 'noDueDate':  return null
    default:           return format(t, 'yyyy-MM-dd')
  }
}

const PRI_FOR_BUCKET: Record<PriorityBucket, number> = { high: 1, medium: 4, low: 7, tbd: 9 }

function computePosition(tgtTasks: TaskNode[], insertIdx: number): number {
  if (tgtTasks.length === 0) return 1
  if (insertIdx <= 0)               return Math.max(1, tgtTasks[0].position - 1)
  if (insertIdx >= tgtTasks.length) return tgtTasks[tgtTasks.length - 1].position + 1
  return tgtTasks[insertIdx].position
}

type GroupBy = 'priority' | 'time' | 'item'
type LevelFilter = 'all' | 'shallow' | 'deep'

// ─── Web-only CSS ─────────────────────────────────────────────────────────────

const WEB_DROP_LINE_STYLE: React.CSSProperties = {
  height: 2, borderRadius: 1, backgroundColor: '#6366F1',
  margin: '3px 4px', boxShadow: '0 0 0 3px rgba(99,102,241,0.18)',
  pointerEvents: 'none',
}

type ColTheme = typeof DATE_GROUP_THEME[DateGroup]

function webCardStyle(isDragging: boolean, theme: ColTheme): React.CSSProperties {
  return {
    backgroundColor: theme.bgLight, borderRadius: 8, padding: 8,
    border: `1px solid ${theme.bg}`, display: 'flex', flexDirection: 'column', gap: 5,
    cursor: 'grab', opacity: isDragging ? 0.3 : 1,
    boxShadow: isDragging ? `0 0 0 2px ${theme.stroke}` : `0 1px 4px ${theme.stroke}22`,
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
  task, checklistId, isDragging, groupBy, colTheme, onDragStart, onHoverTop, onHoverBottom,
}: {
  task: TaskNode; checklistId: number; isDragging: boolean; groupBy: GroupBy
  colTheme: ColTheme
  onDragStart: () => void
  onHoverTop: () => void
  onHoverBottom: () => void
}) {
  const router = useRouter()

  function detectHalf(e: React.DragEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    e.clientY < rect.top + rect.height / 2 ? onHoverTop() : onHoverBottom()
  }

  const levelDepth = groupBy === 'item' ? task.level - 2 : 0

  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
        {levelDepth > 0 && (
          <View style={{ width: levelDepth * 10, marginTop: 2, opacity: 0.3 }}>
            <View style={{ borderLeftWidth: 1.5, borderLeftColor: colTheme.stroke, height: '100%' }} />
          </View>
        )}
        <Text style={{ flex: 1, fontSize: 12, color: '#1a1a1a', lineHeight: 17 }}>
          <InlineMarkdown content={task.content} />
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {task.priority > 0 && (
          <Text style={{ fontSize: 10, fontWeight: '700', color: priorityTextColor(task.priority) }}>
            {priorityDisplay(task.priority)}
          </Text>
        )}
        {task.due && <Text style={{ fontSize: 10, color: colTheme.text + 'aa' }}>{humanizeDueDate(task.due)}</Text>}
        {task.duration && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Clock size={9} color={colTheme.stroke} />
            <Text style={{ fontSize: 10, color: colTheme.text + 'aa' }}>{task.duration.formatted}</Text>
          </View>
        )}
      </View>
    </>
  )

  if (Platform.OS !== 'web') {
    return (
      <Pressable onPress={() => router.push(`/${checklistId}/tasks/${task.id}`)}
        style={{ backgroundColor: colTheme.bgLight, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colTheme.bg, gap: 5, opacity: isDragging ? 0.3 : 1 }}>
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
      style={webCardStyle(isDragging, colTheme)}
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

const GROUP_BY_LABELS: Record<GroupBy, string> = { priority: 'By Priority', time: 'By Time', item: 'By Item' }

const LEVEL_FILTER_LABELS: Record<LevelFilter, string> = { all: 'All', shallow: 'L1-2', deep: 'L3+' }

function GroupByToggle({
  value, onChange, levelFilter, onLevelFilter,
}: {
  value: GroupBy; onChange: (v: GroupBy) => void
  levelFilter: LevelFilter; onLevelFilter: (v: LevelFilter) => void
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: 'white', paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', flex: 1 }}>
        {(['priority', 'time', 'item'] as GroupBy[]).map((v) => {
          const active = value === v
          return (
            <Pressable
              key={v}
              onPress={() => onChange(v)}
              style={{ paddingVertical: 10, paddingHorizontal: 4, marginRight: 20, borderBottomWidth: 2, borderBottomColor: active ? '#E8632A' : 'transparent' }}
            >
              <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? '#E8632A' : '#6B7280' }}>
                {GROUP_BY_LABELS[v]}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {/* Level depth filter */}
      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        {(['all', 'shallow', 'deep'] as LevelFilter[]).map((lf) => {
          const active = levelFilter === lf
          return (
            <Pressable
              key={lf}
              onPress={() => onLevelFilter(lf)}
              style={{
                paddingVertical: 3, paddingHorizontal: 8, borderRadius: 12,
                backgroundColor: active ? '#6366F1' : '#F1F5F9',
                borderWidth: 1, borderColor: active ? '#6366F1' : '#E2E8F0',
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: active ? '700' : '400', color: active ? 'white' : '#64748B' }}>
                {LEVEL_FILTER_LABELS[lf]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// ─── Column header (collapsible) ──────────────────────────────────────────────

function ColHeader({
  dg, total, isCollapsed, onToggle,
}: {
  dg: DateGroup; total: number; isCollapsed: boolean; onToggle: () => void
}) {
  const theme = DATE_GROUP_THEME[dg]
  const w = isCollapsed ? COL_COLLAPSED_W : COL_W

  if (isCollapsed) {
    // Collapsed: slim colored strip with rotated label
    if (Platform.OS === 'web') {
      return (
        // eslint-disable-next-line react-native/no-inline-styles
        <div
          onClick={onToggle}
          style={{
            width: w, cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
            paddingTop: 10, paddingBottom: 10, gap: 8,
            backgroundColor: theme.bg,
            borderRight: `1px solid ${theme.stroke}44`,
            borderTop: `3px solid ${theme.stroke}`,
          }}
        >
          {/* Rotated label */}
          {/* eslint-disable-next-line react-native/no-inline-styles */}
          <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, fontWeight: 700, color: theme.text, letterSpacing: 0.5, lineHeight: '1', whiteSpace: 'nowrap' }}>
            {GROUP_LABELS[dg]}
          </div>
          {total > 0 && (
            // eslint-disable-next-line react-native/no-inline-styles
            <div style={{ backgroundColor: theme.stroke + '22', borderRadius: 8, padding: '2px 5px' }}>
              {/* eslint-disable-next-line react-native/no-inline-styles */}
              <span style={{ fontSize: 10, fontWeight: 700, color: theme.text }}>{total}</span>
            </div>
          )}
        </div>
      )
    }
    // Native fallback (no CSS writing-mode)
    return (
      <Pressable
        onPress={onToggle}
        style={{ width: w, borderRightWidth: 1, borderRightColor: theme.stroke + '44', borderTopWidth: 3, borderTopColor: theme.stroke, alignItems: 'center', paddingVertical: 10, gap: 6, backgroundColor: theme.bg }}
      >
        {total > 0 && (
          <View style={{ backgroundColor: theme.stroke + '33', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: theme.text }}>{total}</Text>
          </View>
        )}
        <Text style={{ fontSize: 9, fontWeight: '700', color: theme.text }}>{GROUP_LABELS[dg].slice(0, 3).toUpperCase()}</Text>
      </Pressable>
    )
  }

  // Expanded: full header with color bg strip
  return (
    <Pressable
      onPress={onToggle}
      style={{
        width: w, flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 10,
        borderRightWidth: 1, borderRightColor: theme.stroke + '44',
        borderTopWidth: 3, borderTopColor: theme.stroke,
        backgroundColor: theme.bgLight,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.stroke }} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text, flex: 1 }}>{GROUP_LABELS[dg]}</Text>
      {total > 0 && (
        <View style={{ backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: theme.text }}>{total}</Text>
        </View>
      )}
      <ChevronDown size={11} color={theme.stroke} />
    </Pressable>
  )
}

// ─── Swimlane cell ────────────────────────────────────────────────────────────

function KanbanCell({
  tasks, checklistId, dg, swimKey, groupBy,
  isOver, insertIdx, dragState, dropRef, rowCollapsed, colCollapsed,
  onDragStart, setDrop, handleDrop,
}: {
  tasks: TaskNode[]; checklistId: number; dg: DateGroup
  swimKey: SwimlaneKey
  groupBy: GroupBy; isOver: boolean; insertIdx: number
  dragState: DragState | null
  dropRef: React.MutableRefObject<DropTarget | null>
  rowCollapsed: boolean
  colCollapsed: boolean
  onDragStart: (t: TaskNode) => void
  setDrop: (dg: DateGroup, swimKey: SwimlaneKey, idx: number) => void
  handleDrop: (e: React.DragEvent, dg: DateGroup, swimKey: SwimlaneKey) => void
}) {
  const colTheme = DATE_GROUP_THEME[dg]
  const collapsed = rowCollapsed || colCollapsed
  const w = colCollapsed ? COL_COLLAPSED_W : COL_W

  const inner = (
    <View style={{
      width: w,
      borderRightWidth: 1, borderRightColor: colTheme.stroke + '33',
      minHeight: collapsed ? 36 : MIN_CELL_H,
      padding: collapsed ? 0 : 6,
      justifyContent: collapsed ? 'center' : 'flex-start',
      backgroundColor: isOver ? colTheme.bg + 'cc' : colTheme.bgLight,
    }}>
      {collapsed ? (
        <Text style={{ fontSize: 10, color: colTheme.stroke, textAlign: 'center' }}>
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
                colTheme={colTheme}
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
              <Text style={{ fontSize: 10, color: colTheme.stroke }}>Drop here</Text>
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

// ─── By-Item helpers ──────────────────────────────────────────────────────────

function collectDescendants(node: TaskNode): TaskNode[] {
  const result: TaskNode[] = []
  for (const child of node.children) {
    result.push(child)
    result.push(...collectDescendants(child))
  }
  return result
}

function classifyDescendant(task: TaskNode): DateGroup | null {
  const dg = classifyTask(task) as DateGroup
  return KANBAN_DATE_GROUPS.includes(dg) ? dg : null
}

// ─── By-Item swimlane view ────────────────────────────────────────────────────

function matchesLevelFilter(task: TaskNode, lf: LevelFilter): boolean {
  if (lf === 'all') return true
  if (lf === 'shallow') return task.level <= 2
  return task.level >= 3
}

function ItemSwimlaneView({
  roots, checklistId, activeDateGroups, collapsedCols, onToggleCol, levelFilter,
}: {
  roots: TaskNode[]
  checklistId: number
  activeDateGroups: DateGroup[]
  collapsedCols: Set<DateGroup>
  onToggleCol: (dg: DateGroup) => void
  levelFilter: LevelFilter
}) {
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const router = useRouter()
  const [collapsedRows, setCollapsedRows] = useState<Set<number>>(new Set())
  const [dragState, setDragState] = useState<{ taskId: number; srcDg: DateGroup; rootId: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ dg: DateGroup; rootId: number; insertIdx: number } | null>(null)
  const dragRef = useRef(dragState)
  const dropRef = useRef(dropTarget)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onEnd = () => { dragRef.current = null; dropRef.current = null; setDragState(null); setDropTarget(null) }
    document.addEventListener('dragend', onEnd)
    return () => document.removeEventListener('dragend', onEnd)
  }, [])

  const itemCells = useMemo(() => {
    const map = new Map<number, Map<DateGroup, TaskNode[]>>()
    for (const root of roots) {
      const byDg = new Map<DateGroup, TaskNode[]>()
      for (const dg of activeDateGroups) byDg.set(dg, [])
      for (const desc of collectDescendants(root)) {
        if (!matchesLevelFilter(desc, levelFilter)) continue
        const dg = classifyDescendant(desc)
        if (dg && byDg.has(dg)) byDg.get(dg)!.push(desc)
      }
      map.set(root.id, byDg)
    }
    return map
  }, [roots, activeDateGroups, levelFilter])

  const visibleRoots = useMemo(
    () => roots.filter((r) => activeDateGroups.some((dg) => (itemCells.get(r.id)?.get(dg)?.length ?? 0) > 0)),
    [roots, activeDateGroups, itemCells]
  )

  function toggleRow(rootId: number) {
    setCollapsedRows((prev) => { const n = new Set(prev); n.has(rootId) ? n.delete(rootId) : n.add(rootId); return n })
  }

  function handleItemDrop(e: React.DragEvent, dg: DateGroup, tasks: TaskNode[]) {
    e.preventDefault()
    const ds = dragRef.current
    const dt = dropRef.current
    if (!ds) return
    const payload: Parameters<typeof updateTask>[0]['payload'] = {}
    if (dg !== ds.srcDg) payload.due_date = dateForGroup(dg)
    if (dt) payload.position = computePosition(tasks.filter((t) => t.id !== ds.taskId), dt.insertIdx)
    if (Object.keys(payload).length > 0) {
      updateTask({ taskId: ds.taskId, payload })
    }
    dragRef.current = null; dropRef.current = null; setDragState(null); setDropTarget(null)
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator scrollEnabled={dragState === null}>
      <View>
        {/* Column headers */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#E2E8F0', backgroundColor: 'white' }}>
          <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: '#E2E8F0' }} />
          {activeDateGroups.map((dg) => {
            const total = visibleRoots.reduce((s, r) => s + (itemCells.get(r.id)?.get(dg)?.length ?? 0), 0)
            return (
              <ColHeader
                key={dg}
                dg={dg}
                total={total}
                isCollapsed={collapsedCols.has(dg)}
                onToggle={() => onToggleCol(dg)}
              />
            )
          })}
        </View>

        {/* Swimlane rows — one per L1 root */}
        {visibleRoots.map((root) => {
          const isRowCollapsed = collapsedRows.has(root.id)
          const totalRow = activeDateGroups.reduce((s, dg) => s + (itemCells.get(root.id)?.get(dg)?.length ?? 0), 0)

          return (
            <View key={root.id} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
              {/* Swimlane label */}
              <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                <Pressable
                  onPress={() => toggleRow(root.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 }}
                >
                  {isRowCollapsed ? <ChevronRight size={12} color="#6366F1" /> : <ChevronDown size={12} color="#6366F1" />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#1E293B', lineHeight: 15 }} numberOfLines={3}>
                      {root.content}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{totalRow} task{totalRow !== 1 ? 's' : ''}</Text>
                  </View>
                </Pressable>
              </View>

              {/* Cells per date column */}
              {activeDateGroups.map((dg) => {
                const colTheme = DATE_GROUP_THEME[dg]
                const tasks = itemCells.get(root.id)?.get(dg) ?? []
                const isColCollapsed = collapsedCols.has(dg)
                const collapsed = isRowCollapsed || isColCollapsed
                const w = isColCollapsed ? COL_COLLAPSED_W : COL_W
                const isOver = dropTarget?.dg === dg && dropTarget?.rootId === root.id
                const insertIdx = isOver ? (dropTarget?.insertIdx ?? -1) : -1

                if (Platform.OS !== 'web') {
                  return (
                    <View key={dg} style={{ width: w, borderRightWidth: 1, borderRightColor: colTheme.stroke + '33', minHeight: collapsed ? 36 : MIN_CELL_H, padding: collapsed ? 0 : 6, backgroundColor: isOver ? colTheme.bg + 'cc' : colTheme.bgLight }}>
                      {collapsed ? (
                        <Text style={{ fontSize: 10, color: colTheme.stroke, textAlign: 'center', padding: 10 }}>{tasks.length > 0 ? tasks.length : '—'}</Text>
                      ) : tasks.length === 0 ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: MIN_CELL_H - 12, opacity: 0.35 }}>
                          <Text style={{ fontSize: 10, color: colTheme.stroke }}>Drop here</Text>
                        </View>
                      ) : (
                        tasks.map((t) => (
                          <Pressable key={t.id} onPress={() => router.push(`/${checklistId}/tasks/${t.id}`)}
                            style={{ backgroundColor: colTheme.bgLight, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: colTheme.bg, gap: 4, marginBottom: CARD_GAP }}>
                            <Text style={{ fontSize: 12, color: '#1a1a1a', lineHeight: 17 }}><InlineMarkdown content={t.content} /></Text>
                            {t.priority > 0 && <Text style={{ fontSize: 10, fontWeight: '700', color: priorityTextColor(t.priority) }}>{priorityDisplay(t.priority)}</Text>}
                          </Pressable>
                        ))
                      )}
                    </View>
                  )
                }

                return (
                  // eslint-disable-next-line react-native/no-inline-styles
                  <div
                    key={dg}
                    style={{ display: 'flex', flexDirection: 'column', width: w, borderRight: `1px solid ${colTheme.stroke}33`, minHeight: collapsed ? 36 : MIN_CELL_H, padding: collapsed ? 0 : 6, backgroundColor: isOver ? colTheme.bg + 'cc' : colTheme.bgLight }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const dt = { dg, rootId: root.id, insertIdx: tasks.length }; dropRef.current = dt; setDropTarget(dt) }}
                    onDragEnter={(e) => { if (tasks.length === 0) { e.preventDefault(); const dt = { dg, rootId: root.id, insertIdx: 0 }; dropRef.current = dt; setDropTarget(dt) } }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { dropRef.current = null; setDropTarget(null) } }}
                    onDrop={(e) => handleItemDrop(e, dg, tasks)}
                  >
                    {collapsed ? (
                      // eslint-disable-next-line react-native/no-inline-styles
                      <span style={{ fontSize: 10, color: colTheme.stroke, textAlign: 'center', padding: '10px 4px', display: 'block' }}>{tasks.length > 0 ? tasks.length : '—'}</span>
                    ) : (
                      <>
                        {isOver && insertIdx === 0 && <DropLine />}
                        {tasks.map((t, i) => (
                          // eslint-disable-next-line react-native/no-inline-styles
                          <div key={t.id} style={{ marginBottom: i < tasks.length - 1 ? CARD_GAP : 0 }}>
                            <div
                              draggable
                              // eslint-disable-next-line react-native/no-inline-styles
                              onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(t.id)); e.dataTransfer.effectAllowed = 'move'; const ds = { taskId: t.id, srcDg: dg, rootId: root.id }; dragRef.current = ds; requestAnimationFrame(() => setDragState(ds)) }}
                              // eslint-disable-next-line react-native/no-inline-styles
                              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); const dt = { dg, rootId: root.id, insertIdx: e.clientY < rect.top + rect.height / 2 ? i : i + 1 }; dropRef.current = dt; setDropTarget(dt) }}
                              // eslint-disable-next-line react-native/no-inline-styles
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; const rect = e.currentTarget.getBoundingClientRect(); const dt = { dg, rootId: root.id, insertIdx: e.clientY < rect.top + rect.height / 2 ? i : i + 1 }; dropRef.current = dt; setDropTarget(dt) }}
                              onClick={() => router.push(`/${checklistId}/tasks/${t.id}`)}
                              style={webCardStyle(dragState?.taskId === t.id, colTheme)}
                            >
                              {t.level > 2 && (
                                // eslint-disable-next-line react-native/no-inline-styles
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {Array.from({ length: t.level - 2 }).map((_, li) => (
                                    // eslint-disable-next-line react-native/no-inline-styles
                                    <div key={li} style={{ width: 10, borderLeft: `1.5px solid ${colTheme.stroke}`, opacity: 0.4 }} />
                                  ))}
                                </div>
                              )}
                              {/* eslint-disable-next-line react-native/no-inline-styles */}
                              <span style={{ fontSize: 12, color: '#1a1a1a', lineHeight: '17px' }}>{t.content}</span>
                              {/* eslint-disable-next-line react-native/no-inline-styles */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {t.priority > 0 && (
                                  // eslint-disable-next-line react-native/no-inline-styles
                                  <span style={{ fontSize: 10, fontWeight: '700', color: priorityTextColor(t.priority) }}>{priorityDisplay(t.priority)}</span>
                                )}
                                {t.due && <span style={{ fontSize: 10, color: colTheme.text + 'aa' }}>{humanizeDueDate(t.due)}</span>}
                                {t.duration && <span style={{ fontSize: 10, color: colTheme.text + 'aa' }}>⏱ {t.duration.formatted}</span>}
                              </div>
                            </div>
                            {isOver && insertIdx === i + 1 && <DropLine />}
                          </div>
                        ))}
                        {tasks.length === 0 && (
                          // eslint-disable-next-line react-native/no-inline-styles
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: MIN_CELL_H - 12, opacity: 0.35 }}>
                            <span style={{ fontSize: 10, color: colTheme.stroke }}>Drop here</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function KanbanView({ groups, roots = [], checklistId }: { groups: GroupedTasks[]; roots?: TaskNode[]; checklistId: number }) {
  const { mutate: updateTask } = useUpdateTask(checklistId)

  const [groupBy, setGroupBy]           = useState<GroupBy>('priority')
  const [levelFilter, setLevelFilter]   = useState<LevelFilter>('all')
  const [collapsedRows, setCollapsedRows] = useState<Set<SwimlaneKey>>(new Set())
  const [collapsedCols, setCollapsedCols] = useState<Set<DateGroup>>(new Set())
  const [dragState,  setDragState]      = useState<DragState | null>(null)
  const [dropTarget, setDropTarget]     = useState<DropTarget | null>(null)

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

  function toggleCol(dg: DateGroup) {
    setCollapsedCols((prev) => { const n = new Set(prev); n.has(dg) ? n.delete(dg) : n.add(dg); return n })
  }

  // ─── Cell maps ─────────────────────────────────────────────────────────────

  const priCells = useMemo(() => {
    const cells = new Map<DateGroup, Map<PriorityBucket, TaskNode[]>>()
    const active: DateGroup[] = []
    for (const dg of KANBAN_DATE_GROUPS) {
      const g = groups.find((g) => g.group === dg)
      if (!g) continue
      const byPri = new Map<PriorityBucket, TaskNode[]>()
      for (const b of PRIORITY_BUCKETS) byPri.set(b, [])
      for (const t of g.tasks) {
        if (!matchesLevelFilter(t, levelFilter)) continue
        byPri.get(classifyPriority(t.priority))!.push(t)
      }
      cells.set(dg, byPri)
      active.push(dg)
    }
    const activeSwims = PRIORITY_BUCKETS.filter((b) =>
      active.some((dg) => (cells.get(dg)?.get(b)?.length ?? 0) > 0)
    )
    return { cells, activeDateGroups: active, activeSwims }
  }, [groups, levelFilter])

  const timeCells = useMemo(() => {
    const cells = new Map<DateGroup, Map<TimeBucket, TaskNode[]>>()
    const active: DateGroup[] = []
    for (const dg of KANBAN_DATE_GROUPS) {
      const g = groups.find((g) => g.group === dg)
      if (!g) continue
      const byTime = new Map<TimeBucket, TaskNode[]>()
      for (const q of TIME_QUADRANTS) byTime.set(q.bucket, [])
      for (const t of g.tasks) {
        if (!matchesLevelFilter(t, levelFilter)) continue
        byTime.get(classifyTime(t))!.push(t)
      }
      cells.set(dg, byTime)
      active.push(dg)
    }
    const activeSwims = TIME_QUADRANTS.map((q) => q.bucket).filter((tb) =>
      active.some((dg) => (cells.get(dg)?.get(tb)?.length ?? 0) > 0)
    )
    return { cells, activeDateGroups: active, activeSwims }
  }, [groups, levelFilter])

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

    const payload: Parameters<typeof updateTask>[0]['payload'] = {}
    if (dg !== ds.srcDg) payload.due_date = dateForGroup(dg)
    if (groupBy === 'priority' && swimKey !== ds.srcSwimKey) {
      payload.priority = PRI_FOR_BUCKET[swimKey as PriorityBucket]
    }
    payload.position = computePosition(tgtTasks, insertIdx)

    updateTask({ taskId: ds.taskId, payload })

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (groupBy === 'priority') return (cells.get(dg) as Map<PriorityBucket, TaskNode[]> | undefined)?.get(swimKey as PriorityBucket) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (timeCells.cells.get(dg) as Map<TimeBucket, TaskNode[]> | undefined)?.get(swimKey as TimeBucket) ?? []
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (groupBy === 'item') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} showsVerticalScrollIndicator>
        <GroupByToggle value={groupBy} onChange={(v) => { setGroupBy(v); setCollapsedRows(new Set()); setCollapsedCols(new Set()) }} levelFilter={levelFilter} onLevelFilter={setLevelFilter} />
        <ItemSwimlaneView
          roots={roots}
          checklistId={checklistId}
          activeDateGroups={priCells.activeDateGroups}
          collapsedCols={collapsedCols}
          onToggleCol={toggleCol}
          levelFilter={levelFilter}
        />
      </ScrollView>
    )
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F8FAFC' }} showsVerticalScrollIndicator>
      <GroupByToggle value={groupBy} onChange={(v) => { setGroupBy(v); setCollapsedRows(new Set()); setCollapsedCols(new Set()) }} levelFilter={levelFilter} onLevelFilter={setLevelFilter} />
      <ScrollView horizontal showsHorizontalScrollIndicator scrollEnabled={dragState === null}>
        <View>

          {/* Column headers (collapsible) */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#E2E8F0', backgroundColor: 'white' }}>
            <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: '#E2E8F0' }} />
            {activeDateGroups.map((dg) => {
              const total = activeSwims.reduce((s, sk) => s + cellTasks(dg, sk).length, 0)
              return (
                <ColHeader
                  key={dg}
                  dg={dg}
                  total={total}
                  isCollapsed={collapsedCols.has(dg)}
                  onToggle={() => toggleCol(dg)}
                />
              )
            })}
          </View>

          {/* Swimlane rows */}
          {activeSwims.map((swimKey) => {
            const meta        = swimMeta(swimKey)
            const isCollapsed = collapsedRows.has(swimKey)
            const totalRow    = activeDateGroups.reduce((s, dg) => s + cellTasks(dg, swimKey).length, 0)

            return (
              <View key={String(swimKey)} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>

                {/* Swimlane label */}
                <View style={{ width: LABEL_W, borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: meta.bg + '99' }}>
                  <Pressable
                    onPress={() => setCollapsedRows((prev) => { const n = new Set(prev); n.has(swimKey) ? n.delete(swimKey) : n.add(swimKey); return n })}
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
                    groupBy={groupBy}
                    isOver={dropTarget?.dg === dg && dropTarget?.swimKey === swimKey}
                    insertIdx={dropTarget?.dg === dg && dropTarget?.swimKey === swimKey ? dropTarget.insertIdx : -1}
                    dragState={dragState}
                    dropRef={dropRef}
                    rowCollapsed={isCollapsed}
                    colCollapsed={collapsedCols.has(dg)}
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
