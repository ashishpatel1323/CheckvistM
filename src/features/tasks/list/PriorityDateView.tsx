import { useState, useMemo, useCallback } from 'react'
import { View, Pressable, ScrollView, Platform, Modal } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
import { ChevronDown, ChevronRight, ChevronUp, CalendarArrowUp } from 'lucide-react-native'
import type { TaskNode, HierarchyGroup } from '@/lib/taskTree'
import { computeHierarchyGroup } from '@/lib/taskTree'
import { useTaskSettings } from '@/features/settings/useTaskSettings'
import type { GroupedTasks, DateGroup } from '@/lib/dateSort'
import { PriorityTaskRow } from './PriorityTaskRow'
import { classifyPriority } from '@/features/tasks/shared/PriorityPicker'
import type { PriorityBucket } from '@/features/tasks/shared/PriorityPicker'
import { useUpdateTask } from './useTasksQuery'
import { toApiDate } from '@/lib/dateUtils'
import { useToast } from '@/components/Toast'

export type { PriorityBucket }

interface PriorityDateViewProps {
  groups: GroupedTasks[]
  checklistId: number
  isMobile: boolean
  focusedId: number | null
  setFocusedId: (id: number | null) => void
  checklistName?: string
  getById: (id: number) => TaskNode | undefined
}


// ─── Priority bucket metadata ─────────────────────────────────────────────────

export const PRIORITY_BUCKETS: PriorityBucket[] = ['high', 'medium', 'low', 'tbd']

export const PRIORITY_META: Record<PriorityBucket, { label: string; sublabel: string; color: string; bg: string }> = {
  high:   { label: 'High',   sublabel: 'P1–P3 · Urgent & Important',     color: '#b91c1c', bg: '#FEF2F2' },
  medium: { label: 'Medium', sublabel: 'P4–P6 · Important, Not Urgent', color: '#b45309', bg: '#FFFBEB' },
  low:    { label: 'Low',    sublabel: 'P7–P8 · Delegate',               color: '#15803d', bg: '#F0FDF4' },
  tbd:    { label: 'TBD',    sublabel: 'P9–P10 · Meetings & TBD',        color: '#7c3aed', bg: '#F5F3FF' },
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
  const b: Record<PriorityBucket, TaskNode[]> = { high: [], medium: [], low: [], tbd: [] }

  if (hierarchy) {
    // Visible roots keep their own priority
    for (const root of hierarchy.visibleRoots) {
      b[classifyPriority(root.priority)].push(root)
    }
    // Children are bucketed under their visible-root ancestor's priority
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
        const parentPriority = ancestor?.priority ?? child.priority
        b[classifyPriority(parentPriority)].push(child)
      }
    }
  } else {
    for (const t of tasks) b[classifyPriority(t.priority)].push(t)
  }

  return b
}

// ─── Date group accent colors ─────────────────────────────────────────────────

const DATE_GROUP_COLOR: Record<DateGroup, string> = {
  overdue:    '#EF4444',
  today:      '#4772FA',
  tomorrow:   '#8B5CF6',
  thisWeek:   '#059669',
  later:      '#6B7280',
  noDueDate:  '#D1D5DB',
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
  bucket: PriorityBucket
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
  const meta = PRIORITY_META[bucket]

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

  const focusedIdx = orderedTasks.findIndex((t) => t.id === focusedId)

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
    <View>
      {/* Sub-section header */}
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 11,
          backgroundColor: meta.bg,
          borderBottomWidth: collapsed ? 0 : 1,
          borderBottomColor: '#F3F4F6',
          gap: 8,
        }}
      >
        <View style={{
          width: 9, height: 9, borderRadius: 5,
          backgroundColor: meta.color,
        }} />
        <View className="flex-row items-center gap-2">
          <UIText className="text-sm font-bold" style={{ color: meta.color, letterSpacing: 0.2 }}>
            {meta.label.toUpperCase()}
          </UIText>
          <UIText className="text-[11px]" style={{ color: meta.color, opacity: 0.65 }}>{meta.sublabel}</UIText>
        </View>
        {bucket === 'high' && tasks.length > MAX_HIGH && (
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

      {!collapsed && (() => {
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
              <View key={`node-${node.id}`} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                {/* Reorder column — only top-level roots can be reordered */}
                {isRoot && Platform.OS === 'web' && (
                  <View style={{ width: 22, flexDirection: 'column', justifyContent: 'center', backgroundColor: meta.bg }}>
                    <Pressable onPress={() => moveTask(rootIdx, -1)} hitSlop={4} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: rootIdx === 0 ? 0.2 : 0.6 }}>
                      <ChevronUp size={10} color={meta.color} />
                    </Pressable>
                    <Pressable onPress={() => moveTask(rootIdx, 1)} hitSlop={4} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: rootIdx === orderedTasks.length - 1 ? 0.2 : 0.6 }}>
                      <ChevronDown size={10} color={meta.color} />
                    </Pressable>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <PriorityTaskRow
                    task={node}
                    checklistId={checklistId}
                    checklistName={checklistName}
                    checkColor={meta.color}
                    focusedId={focusedId}
                    isLast={false}
                    onMoveUp={isRoot && focusedIdx === rootIdx ? () => moveTask(rootIdx, -1) : undefined}
                    onMoveDown={isRoot && focusedIdx === rootIdx ? () => moveTask(rootIdx, 1) : undefined}
                    indentLevel={depth}
                    expandable={hasChildren}
                    expanded={isExpanded}
                    onToggleExpand={hasChildren ? () => onToggleExpand(node.id) : undefined}
                  />
                </View>
              </View>
            )

            if (isExpanded && hasChildren) {
              children.forEach((child) => renderNode(child, depth + 1))
            }
          }

          bucketRoots.forEach((root) => renderNode(root, 0))
          return rows
        }

        // ── Flat mode rendering (original) ──
        return orderedTasks.map((task, i) => (
          <View key={task.id} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            {Platform.OS === 'web' && (
              <View style={{ width: 22, flexDirection: 'column', justifyContent: 'center', backgroundColor: meta.bg, borderBottomWidth: i === orderedTasks.length - 1 ? 0 : 1, borderBottomColor: '#F3F4F6' }}>
                <Pressable onPress={() => moveTask(i, -1)} hitSlop={4} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.2 : 0.6 }}>
                  <ChevronUp size={10} color={meta.color} />
                </Pressable>
                <Pressable onPress={() => moveTask(i, 1)} hitSlop={4} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', opacity: i === orderedTasks.length - 1 ? 0.2 : 0.6 }}>
                  <ChevronDown size={10} color={meta.color} />
                </Pressable>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <PriorityTaskRow
                task={task}
                checklistId={checklistId}
                checklistName={checklistName}
                checkColor={meta.color}
                focusedId={focusedId}
                isLast={i === orderedTasks.length - 1}
                onMoveUp={focusedIdx === i ? () => moveTask(i, -1) : undefined}
                onMoveDown={focusedIdx === i ? () => moveTask(i, 1) : undefined}
              />
            </View>
          </View>
        ))
      })()}
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
}) {
  const [collapsed, setCollapsed] = useState(!DATE_GROUP_DEFAULT_OPEN[group.group])
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [moving, setMoving] = useState(false)
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const toast = useToast()
  const accent = DATE_GROUP_COLOR[group.group]
  const isOverdue = group.group === 'overdue'

  // ── Compute hierarchy at the date group level (across all priorities) ──
  const hierarchy = useMemo<HierarchyGroup | null>(() => {
    if (!hierarchyMode) return null
    return computeHierarchyGroup(group.tasks, getById)
  }, [group.tasks, hierarchyMode, getById])

  // In hierarchy mode, children are bucketed under their parent's priority.
  const buckets = useMemo(
    () => bucketTasksByPriority(group.tasks, hierarchyMode ? hierarchy : null, getById),
    [group.tasks, hierarchy, hierarchyMode, getById],
  )

  const activeBuckets = PRIORITY_BUCKETS.filter((b) => buckets[b].length > 0)

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
      borderRadius: 14,
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
      borderLeftWidth: 3,
      borderLeftColor: accent,
    }}>
      {/* L1 header */}
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 13,
          borderBottomWidth: collapsed ? 0 : 1,
          borderBottomColor: '#F3F4F6',
          gap: 8,
        }}
      >
        <UIText className="text-base font-bold" style={{ color: accent }}>
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
              backgroundColor: accent,
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


      {/* L2 priority sub-sections */}
      {!collapsed && activeBuckets.map((bucket) => (
        <PrioritySubSection
          key={bucket}
          bucket={bucket}
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
      ))}

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
      style={{ flex: 1, backgroundColor: '#F5F5F5' }}
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
        />
      ))}
    </ScrollView>
  )
}