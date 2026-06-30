import { useState, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { View, Pressable, ScrollView, Modal, Platform } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
import { ChevronDown, ChevronRight, CalendarArrowUp } from 'lucide-react-native'
import type { TaskNode, HierarchyGroup } from '@/lib/taskTree'
import { computeHierarchyGroup } from '@/lib/taskTree'
import { useTaskSettings } from '@/features/settings/useTaskSettings'
import type { GroupedTasks, DateGroup } from '@/lib/dateSort'
import { PriorityTaskRow } from './PriorityTaskRow'
import { classifyPriority, BUCKET_META } from '@/features/tasks/shared/PriorityPicker'
import type { PriorityBucket } from '@/features/tasks/shared/PriorityPicker'
import { classifyTime, buildTimeTagsString, TIME_QUADRANTS, type TimeBucket } from './EisenhowerMatrixView'
import { computePriorityDrop, useCardDragRef, _tdFindBucket } from '@/features/tasks/shared/PriorityMatrixGrid'
import { useUpdateTask } from './useTasksQuery'
import { toApiDate } from '@/lib/dateUtils'
import { useToast } from '@/components/Toast'

export type { PriorityBucket }

// ─── Group dimension (Priority vs Time) + layout (Stack vs Matrix) ────────────

export type GroupDimension = 'priority' | 'time'
export type GroupLayout = 'stack' | 'matrix'

interface BucketMeta { label: string; sublabel: string; color: string; bg: string; border: string }

const TIME_BUCKET_ORDER: TimeBucket[] = ['tbd', '5min', '10min', 'long']
const TIME_META = Object.fromEntries(
  TIME_QUADRANTS.map((q) => [q.bucket, { label: q.label, sublabel: q.sublabel, color: q.color, bg: q.bg, border: q.border }]),
) as Record<TimeBucket, BucketMeta>

// Matrix quadrant positions (top row, bottom row) per dimension.
const MATRIX_ROWS_PRIORITY: PriorityBucket[][] = [['high', 'medium'], ['low', 'tbd']]
const MATRIX_ROWS_TIME: TimeBucket[][] = [['tbd', '5min'], ['10min', 'long']]

// Drag state shared by the rows (draggable) and quadrants (drop targets) of one date card.
interface MatrixDragController {
  onDragStartTask: (task: TaskNode) => void
  onTouchDropAtPoint: (x: number, y: number) => void
}

// A draggable row wrapper — calls the drag hook at component top-level (rules-of-hooks safe,
// unlike calling the hook inside a .map). Only meaningful on web; a no-op shell elsewhere.
function MatrixDragRow({ task, controller, children }: { task: TaskNode; controller: MatrixDragController; children: ReactNode }) {
  const ref = useCardDragRef(task, () => controller.onDragStartTask(task), controller.onTouchDropAtPoint)
  return <View ref={ref as never}>{children}</View>
}

// A drop target wrapping one matrix quadrant. On web it exposes data-matrix-bucket (for
// touch-drag hit-testing) plus native drag-over/drop; elsewhere it just lays out flex:1.
function MatrixDropZone({ bucketKey, onDrop, children }: { bucketKey: string; onDrop: (bucketKey: string) => void; children: ReactNode }) {
  if (Platform.OS !== 'web') return <View style={{ flex: 1, alignSelf: 'stretch' }}>{children}</View>
  return (
    // eslint-disable-next-line react-native/no-inline-styles
    <div
      style={{ display: 'flex', flex: 1, flexDirection: 'column', alignSelf: 'stretch' }}
      data-matrix-bucket={bucketKey}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
      onDrop={(e) => { e.preventDefault(); onDrop(bucketKey) }}
    >
      {children}
    </div>
  )
}

interface PriorityDateViewProps {
  groups: GroupedTasks[]
  checklistId: number
  isMobile: boolean
  focusedId: number | null
  setFocusedId: (id: number | null) => void
  checklistName?: string
  getById: (id: number) => TaskNode | undefined
  /** 'stack' = blocks one below another (default); 'matrix' = same blocks in a 2x2 grid. */
  layout?: GroupLayout
  /** 'priority' = group by High/Med/Low/TBD (default); 'time' = group by duration buckets. */
  dimension?: GroupDimension
}

// ─── Priority bucket metadata ─────────────────────────────────────────────────

export const PRIORITY_BUCKETS: PriorityBucket[] = ['high', 'medium', 'low', 'tbd']

// Derived from the single source of truth (BUCKET_META). bg = soft tint band, border = subtle divider.
export const PRIORITY_META: Record<PriorityBucket, { label: string; sublabel: string; color: string; bg: string; border: string }> = {
  high:   { label: 'High',   sublabel: BUCKET_META.high.sublabel,   color: BUCKET_META.high.color,   bg: BUCKET_META.high.bgLight,   border: BUCKET_META.high.border },
  medium: { label: 'Medium', sublabel: BUCKET_META.medium.sublabel, color: BUCKET_META.medium.color, bg: BUCKET_META.medium.bgLight, border: BUCKET_META.medium.border },
  low:    { label: 'Low',    sublabel: BUCKET_META.low.sublabel,    color: BUCKET_META.low.color,    bg: BUCKET_META.low.bgLight,    border: BUCKET_META.low.border },
  tbd:    { label: 'TBD',    sublabel: BUCKET_META.tbd.sublabel,    color: BUCKET_META.tbd.color,    bg: BUCKET_META.tbd.bgLight,    border: BUCKET_META.tbd.border },
}

export { classifyPriority }

/**
 * Single source of truth for "today's tasks grouped by priority".
 *
 * - Flat mode: each task under its own priority bucket.
 * - Hierarchy mode: every visible root under its own priority, and every child
 *   attributed to the priority bucket of its visible-root ancestor (so a subtree
 *   always lives in one bucket). Every task is counted exactly once regardless
 *   of expand/collapse state.
 *
 * Used by both the Tasks tab (DateGroupCard) and the Execute tab so their
 * by-priority counts stay identical.
 */
export function bucketTasksByPriority(
  tasks: TaskNode[],
  hierarchy: HierarchyGroup | null,
  getById: (id: number) => TaskNode | undefined,
): Record<PriorityBucket, TaskNode[]> {
  return bucketTasksByDimension(
    tasks, hierarchy, getById, PRIORITY_BUCKETS, (t) => classifyPriority(t.priority),
  ) as Record<PriorityBucket, TaskNode[]>
}

/**
 * Dimension-agnostic version of {@link bucketTasksByPriority}. `order` is the bucket key
 * list, `classify` maps a task to its bucket key. In hierarchy mode every child is attributed
 * to the bucket of its visible-root ancestor, so a subtree always lives in one bucket.
 */
export function bucketTasksByDimension(
  tasks: TaskNode[],
  hierarchy: HierarchyGroup | null,
  getById: (id: number) => TaskNode | undefined,
  order: string[],
  classify: (t: TaskNode) => string,
): Record<string, TaskNode[]> {
  const b: Record<string, TaskNode[]> = {}
  for (const k of order) b[k] = []

  if (hierarchy) {
    // Visible roots keep their own bucket
    for (const root of hierarchy.visibleRoots) {
      b[classify(root)].push(root)
    }
    // Children are bucketed under their visible-root ancestor's bucket
    for (const [, children] of hierarchy.childMap) {
      for (const child of children) {
        const parentId = child.parent_id
        const parent = parentId != null ? getById(parentId) : undefined
        let ancestor: TaskNode | undefined = parent
        while (ancestor && ancestor.parent_id != null) {
          const currentId = ancestor.id
          if (hierarchy.visibleRoots.some((r) => r.id === currentId)) break
          const p = ancestor.parent_id != null ? getById(ancestor.parent_id) : undefined
          if (!p) break
          ancestor = p
        }
        b[ancestor ? classify(ancestor) : classify(child)].push(child)
      }
    }
  } else {
    for (const t of tasks) b[classify(t)].push(t)
  }

  return b
}

// Auto-open for urgent groups; collapse later/noDueDate by default
const DATE_GROUP_DEFAULT_OPEN: Record<DateGroup, boolean> = {
  overdue:   true,
  today:     true,
  tomorrow:  true,
  thisWeek:  true,
  later:     false,
  noDueDate: false,
}

// ─── Priority sub-section ─────────────────────────────────────────────────────

function PrioritySubSection({
  bucket,
  meta,
  showCalibrate,
  dragController,
  tasks,
  checklistId,
  checklistName,
  focusedId,
  setFocusedId,
  isMobile,
  hierarchy,
  expandedRootIds,
  onToggleExpand,
  allTasksInGroup,
}: {
  bucket: string
  meta: BucketMeta
  showCalibrate: boolean
  dragController?: MatrixDragController
  tasks: TaskNode[]
  checklistId: number
  checklistName?: string
  focusedId: number | null
  setFocusedId: (id: number | null) => void
  isMobile: boolean
  hierarchy: HierarchyGroup | null
  expandedRootIds: Set<number>
  onToggleExpand: (id: number) => void
  allTasksInGroup: TaskNode[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [localOrder, setLocalOrder] = useState<number[] | null>(null)
  const { mutate: updateTask } = useUpdateTask(checklistId)

  // In matrix mode each row is wrapped so it can be dragged between quadrants.
  const wrapRow = (task: TaskNode, row: ReactNode): ReactNode =>
    dragController
      ? <MatrixDragRow key={`drag-${task.id}`} task={task} controller={dragController}>{row}</MatrixDragRow>
      : row

  const orderedTasks = localOrder
    ? localOrder.map((id) => tasks.find((t) => t.id === id)).filter(Boolean) as TaskNode[]
    : tasks

  const moveTask = (idx: number, dir: -1 | 1) => {
    const base = localOrder ?? tasks.map((t) => t.id)
    const next = [...base]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setLocalOrder(next)
    next.forEach((id, pos) => {
      updateTask({ taskId: id, payload: { position: pos + 1 } })
    })
  }

  // Calibrate: demote tasks beyond position 3 in HIGH bucket to P4 (medium)
  const MAX_HIGH = 3
  function calibrate() {
    const excess = orderedTasks.slice(MAX_HIGH)
    excess.forEach((t) => updateTask({ taskId: t.id, payload: { priority: 4 } }))
  }

  // ── In hierarchy mode, filter roots + children to this bucket ──
  const { bucketRoots, bucketChildMap } = useMemo(() => {
    if (!hierarchy) return { bucketRoots: null, bucketChildMap: null }

    const bucketTaskIds = new Set(orderedTasks.map((t) => t.id))

    // Roots visible in this bucket: those visible roots that are in this bucket
    const roots = hierarchy.visibleRoots.filter((r) => bucketTaskIds.has(r.id))

    // Full parent→direct-children adjacency restricted to this bucket. hierarchy.childMap
    // keys every in-group parent (not just roots), so keeping all of them lets the renderer
    // recurse through children, grandchildren, etc. instead of stopping at one level.
    const childMap = new Map<number, TaskNode[]>()
    for (const [parentId, children] of hierarchy.childMap) {
      const bucketChildren = children.filter((c) => bucketTaskIds.has(c.id))
      if (bucketChildren.length > 0) {
        childMap.set(parentId, bucketChildren)
      }
    }

    return { bucketRoots: roots, bucketChildMap: childMap }
  }, [hierarchy, orderedTasks])

  return (
    <View style={{ borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: meta.border, backgroundColor: '#fff' }}>
      {/* Sub-section header */}
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: meta.bg,
          borderBottomWidth: collapsed ? 0 : 1,
          borderBottomColor: meta.border,
          gap: 8,
        }}
      >
        <View style={{
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: meta.color,
        }} />
        <View className="flex-row items-center gap-2">
          <UIText className="text-sm font-bold" style={{ color: meta.color, letterSpacing: 0.2 }}>
            {meta.label.toUpperCase()}
          </UIText>
          <UIText className="text-[11px]" style={{ color: meta.color, opacity: 0.65 }}>{meta.sublabel}</UIText>
        </View>
        {showCalibrate && tasks.length > MAX_HIGH && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); calibrate() }}
            hitSlop={8}
            style={{
              paddingHorizontal: 8, paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: meta.color,
            }}
          >
            <UIText className="text-[10px] font-bold text-white" style={{ letterSpacing: 0.3 }}>
              Calibrate
            </UIText>
          </Pressable>
        )}
          <UIText className="text-xs mr-1" style={{ color: '#9CA3AF' }}>{tasks.length}</UIText>
        {collapsed
          ? <ChevronRight size={14} color="#9CA3AF" />
          : <ChevronDown size={14} color="#9CA3AF" />}
      </Pressable>

      {!collapsed && (
        <View style={{ paddingVertical: 4 }}>
          {(() => {
        // ── Hierarchy mode rendering (recursive: children, grandchildren, …) ──
        if (hierarchy && bucketRoots) {
          const rows: React.ReactNode[] = []

          const renderNode = (node: TaskNode, depth: number) => {
            const children = bucketChildMap?.get(node.id) ?? []
            const hasChildren = children.length > 0
            const isExpanded = expandedRootIds.has(node.id)
            const isRoot = depth === 0
            const rootIdx = isRoot ? orderedTasks.indexOf(node) : -1

            rows.push(
              wrapRow(node,
                <PriorityTaskRow
                  key={`node-${node.id}`}
                  task={node}
                  checklistId={checklistId}
                  checklistName={checklistName}
                  checkColor={meta.color}
                  focusedId={focusedId}
                  isLast={false}
                  onMoveUp={isRoot ? () => moveTask(rootIdx, -1) : undefined}
                  onMoveDown={isRoot ? () => moveTask(rootIdx, 1) : undefined}
                  indentLevel={depth}
                  expandable={hasChildren}
                  expanded={isExpanded}
                  onToggleExpand={hasChildren ? () => onToggleExpand(node.id) : undefined}
                />
              )
            )

            if (isExpanded && hasChildren) {
              children.forEach((child) => renderNode(child, depth + 1))
            }
          }

          bucketRoots.forEach((root) => renderNode(root, 0))
          return rows
        }

        // ── Flat mode rendering (original) ──
        return orderedTasks.map((task, i) => wrapRow(task,
          <PriorityTaskRow
            key={task.id}
            task={task}
            checklistId={checklistId}
            checklistName={checklistName}
            checkColor={meta.color}
            focusedId={focusedId}
            isLast={i === orderedTasks.length - 1}
            onMoveUp={() => moveTask(i, -1)}
            onMoveDown={() => moveTask(i, 1)}
          />
        ))
          })()}
        </View>
      )}
    </View>
  )
}

// ─── Date group card ──────────────────────────────────────────────────────────

function DateGroupCard({
  group,
  checklistId,
  checklistName,
  focusedId,
  setFocusedId,
  isMobile,
  hierarchyMode,
  getById,
  expandedRootIds,
  onToggleExpand,
  layout,
  dimension,
}: {
  group: GroupedTasks
  checklistId: number
  checklistName?: string
  focusedId: number | null
  setFocusedId: (id: number | null) => void
  isMobile: boolean
  hierarchyMode: boolean
  getById: (id: number) => TaskNode | undefined
  expandedRootIds: Set<number>
  onToggleExpand: (id: number) => void
  layout: GroupLayout
  dimension: GroupDimension
}) {
  const [collapsed, setCollapsed] = useState(!DATE_GROUP_DEFAULT_OPEN[group.group])
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [moving, setMoving] = useState(false)
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const toast = useToast()
  const isOverdue = group.group === 'overdue'

  // ── Dimension config: how tasks are bucketed (priority vs time) ──
  const bucketOrder: string[] = dimension === 'time' ? TIME_BUCKET_ORDER : PRIORITY_BUCKETS
  const matrixRows: string[][] = dimension === 'time' ? MATRIX_ROWS_TIME : MATRIX_ROWS_PRIORITY
  const classify = (t: TaskNode) => (dimension === 'time' ? classifyTime(t) : classifyPriority(t.priority))
  const metaOf = (key: string): BucketMeta => (dimension === 'time' ? TIME_META[key as TimeBucket] : PRIORITY_META[key as PriorityBucket])

  // ── Compute hierarchy at the date group level (across all buckets) ──
  const hierarchy = useMemo<HierarchyGroup | null>(() => {
    if (!hierarchyMode) return null
    return computeHierarchyGroup(group.tasks, getById)
  }, [group.tasks, hierarchyMode, getById])

  // In hierarchy mode, children are bucketed under their visible-root ancestor's bucket.
  const buckets = useMemo(
    () => bucketTasksByDimension(group.tasks, hierarchyMode ? hierarchy : null, getById, bucketOrder, classify),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group.tasks, hierarchy, hierarchyMode, getById, dimension],
  )

  const activeBuckets = bucketOrder.filter((b) => buckets[b].length > 0)

  // ── Matrix drag-drop: dropping a row into a quadrant reassigns its bucket ──
  const draggedRef = useRef<TaskNode | null>(null)
  const applyDrop = (bucketKey: string) => {
    const task = draggedRef.current
    draggedRef.current = null
    if (!task) return
    if (dimension === 'priority') {
      const newPriority = computePriorityDrop(task, bucketKey as PriorityBucket)
      if (newPriority !== null) updateTask({ taskId: task.id, payload: { priority: newPriority } })
    } else {
      if (classifyTime(task) === bucketKey) return
      updateTask({ taskId: task.id, payload: { tags_as_text: buildTimeTagsString(task, bucketKey as TimeBucket) } })
    }
  }
  const dragController: MatrixDragController = {
    onDragStartTask: (task) => { draggedRef.current = task },
    onTouchDropAtPoint: (x, y) => {
      const bucket = _tdFindBucket(x, y)
      if (bucket) applyDrop(bucket)
      else draggedRef.current = null
    },
  }

  // Move every overdue task in this card to today's date.
  const moveAllToToday = () => {
    const today = toApiDate(new Date())
    const datedTasks = group.tasks.filter((t) => t.due)
    if (datedTasks.length === 0) {
      setShowMoveDialog(false)
      toast.info('No dated overdue tasks to move')
      return
    }
    setMoving(true)
    let settled = 0
    let failed = false
    const done = () => {
      settled++
      if (settled < datedTasks.length) return
      setMoving(false)
      setShowMoveDialog(false)
      if (failed) toast.error('Failed to move some tasks')
      else toast.success(`${datedTasks.length} task${datedTasks.length > 1 ? 's' : ''} moved to today`)
    }
    datedTasks.forEach((task) => {
      updateTask(
        { taskId: task.id, payload: { due_date: today } },
        { onSuccess: done, onError: () => { failed = true; done() } },
      )
    })
  }

  return (
    <View style={{
      marginHorizontal: 12,
      marginBottom: 12,
      borderRadius: 16,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.08)',
    }}>
      {/* L1 header */}
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 13,
          gap: 8,
        }}
      >
        <UIText className="text-base font-bold" style={{ color: '#2563EB' }}>
          {group.label}
        </UIText>
        {isOverdue && group.tasks.length > 0 && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); setShowMoveDialog(true) }}
            hitSlop={6}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: '#EF4444',
            }}
          >
            <CalendarArrowUp size={11} color="#fff" />
            <UIText className="text-[10px] font-bold text-white" style={{ letterSpacing: 0.3 }}>
              Move to Today
            </UIText>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <UIText className="text-xs mr-1" style={{ color: '#9CA3AF' }}>
          {group.tasks.length}
        </UIText>
        <Pressable
          hitSlop={8}
          onPress={() => setCollapsed((v) => !v)}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 8,
            backgroundColor: '#F3F4F6',
            borderWidth: 1,
            borderColor: '#E5E7EB',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {collapsed
            ? <ChevronRight size={18} color="#6B7280" />
            : <ChevronDown size={18} color="#4772FA" />}
        </Pressable>
      </Pressable>


      {/* L2 sub-sections — same blocks, either stacked or in a 2x2 matrix */}
      {!collapsed && (() => {
        // matrix=true makes rows draggable between quadrants (drop reassigns the bucket).
        const renderBucket = (bucket: string, matrix: boolean) => (
          <PrioritySubSection
            key={bucket}
            bucket={bucket}
            meta={metaOf(bucket)}
            showCalibrate={dimension === 'priority' && bucket === 'high'}
            dragController={matrix ? dragController : undefined}
            tasks={buckets[bucket]}
            checklistId={checklistId}
            checklistName={checklistName}
            focusedId={focusedId}
            setFocusedId={setFocusedId}
            isMobile={isMobile}
            hierarchy={hierarchy}
            expandedRootIds={expandedRootIds}
            onToggleExpand={onToggleExpand}
            allTasksInGroup={group.tasks}
          />
        )

        if (layout === 'matrix') {
          // Same blocks laid out as a 2x2 grid (all 4 quadrants always present, so empty
          // ones still act as drop targets). On mobile the columns stack for usable width.
          return (
            <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8, gap: 6 }}>
              {matrixRows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: isMobile ? 'column' : 'row', gap: 6, alignItems: 'flex-start' }}>
                  {row.map((bucket) => (
                    <MatrixDropZone key={bucket} bucketKey={bucket} onDrop={applyDrop}>
                      {renderBucket(bucket, true)}
                    </MatrixDropZone>
                  ))}
                </View>
              ))}
            </View>
          )
        }

        return (
          <View style={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8, gap: 6 }}>
            {activeBuckets.map((bucket) => renderBucket(bucket, false))}
          </View>
        )
      })()}

      {/* Move-to-today confirmation dialog */}
      <Modal
        visible={showMoveDialog}
        transparent
        animationType="fade"
        onRequestClose={() => !moving && setShowMoveDialog(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}
          onPress={() => !moving && setShowMoveDialog(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              paddingTop: 24,
              paddingHorizontal: 24,
              paddingBottom: 8,
              width: '100%',
              maxWidth: 360,
              shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 16,
            }}
            onPress={() => {}}
          >
            <UIText className="text-base font-bold text-foreground mb-2.5">Move overdue to Today</UIText>
            <UIText className="text-sm text-muted-foreground mb-6" style={{ lineHeight: 22 }}>
              All {group.tasks.filter((t) => t.due).length} dated overdue task
              {group.tasks.filter((t) => t.due).length === 1 ? '' : 's'} will be rescheduled to today.
            </UIText>
            <View className="flex-row justify-end gap-2 border-t border-border py-2">
              <Pressable
                onPress={() => setShowMoveDialog(false)}
                disabled={moving}
                className="px-4 py-2"
              >
                <UIText className="text-sm font-medium" style={{ color: '#4772FA', opacity: moving ? 0.4 : 1 }}>Cancel</UIText>
              </Pressable>
              <Pressable
                onPress={moveAllToToday}
                disabled={moving}
                className="px-4 py-2"
              >
                <UIText className="text-sm font-bold" style={{ color: '#4772FA', opacity: moving ? 0.4 : 1 }}>
                  {moving ? 'Moving…' : 'Move'}
                </UIText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

// ─── Root view ────────────────────────────────────────────────────────────────

export function PriorityDateView({
  groups,
  checklistId,
  isMobile,
  focusedId,
  setFocusedId,
  checklistName,
  getById,
  layout = 'stack',
  dimension = 'priority',
}: PriorityDateViewProps) {
  const { hierarchyMode } = useTaskSettings()
  // Expanded state lives at the top level so it's shared across all buckets
  const [expandedRootIds, setExpandedRootIds] = useState<Set<number>>(new Set())

  const toggleExpand = useCallback((id: number) => {
    setExpandedRootIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  if (groups.length === 0) return null

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#FAFAFA' }}
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >

      {groups.map((group) => (
        <DateGroupCard
          key={group.group}
          group={group}
          checklistId={checklistId}
          checklistName={checklistName}
          focusedId={focusedId}
          setFocusedId={setFocusedId}
          isMobile={isMobile}
          hierarchyMode={hierarchyMode}
          getById={getById}
          expandedRootIds={expandedRootIds}
          onToggleExpand={toggleExpand}
          layout={layout}
          dimension={dimension}
        />
      ))}
    </ScrollView>
  )
}