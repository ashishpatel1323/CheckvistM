import { useState, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, Platform, Modal } from 'react-native'
import { ChevronDown, ChevronRight, ChevronUp, CalendarArrowUp } from 'lucide-react-native'
import type { TaskNode } from '@/lib/taskTree'
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
}: {
  bucket: PriorityBucket
  tasks: TaskNode[]
  checklistId: number
  checklistName?: string
  focusedId: number | null
  setFocusedId: (id: number | null) => void
  isMobile: boolean
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
    // Sync positions to API: assign positions based on new order
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

  // Keyboard: ArrowUp/ArrowDown moves focused task within this bucket
  // Handled via focusedId + useEffect to detect keyboard
  const focusedIdx = orderedTasks.findIndex((t) => t.id === focusedId)

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
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: meta.color, letterSpacing: 0.2 }}>
            {meta.label.toUpperCase()}
          </Text>
          <Text style={{ fontSize: 11, color: meta.color, opacity: 0.65 }}>{meta.sublabel}</Text>
        </View>
        {/* Calibrate button — only on HIGH bucket when there are excess items */}
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
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>
              Calibrate
            </Text>
          </Pressable>
        )}
        <Text style={{ fontSize: 13, color: '#9CA3AF', marginRight: 4 }}>{tasks.length}</Text>
        {collapsed
          ? <ChevronRight size={14} color="#9CA3AF" />
          : <ChevronDown size={14} color="#9CA3AF" />}
      </Pressable>

      {!collapsed && orderedTasks.map((task, i) => (
        <View key={task.id} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
          {/* Move up/down controls — always visible on web, hidden on mobile */}
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
      ))}
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
}: {
  group: GroupedTasks
  checklistId: number
  checklistName?: string
  focusedId: number | null
  setFocusedId: (id: number | null) => void
  isMobile: boolean
}) {
  const [collapsed, setCollapsed] = useState(!DATE_GROUP_DEFAULT_OPEN[group.group])
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [moving, setMoving] = useState(false)
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const toast = useToast()
  const accent = DATE_GROUP_COLOR[group.group]
  const isOverdue = group.group === 'overdue'

  const buckets = useMemo(() => {
    const b: Record<PriorityBucket, TaskNode[]> = { high: [], medium: [], low: [], tbd: [] }
    for (const t of group.tasks) b[classifyPriority(t.priority)].push(t)
    return b
  }, [group.tasks])

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
        <Text style={{ fontSize: 15, fontWeight: '700', color: accent }}>
          {group.label}
        </Text>
        {/* Move-all-to-today CTA — overdue card only */}
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
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.3 }}>
              Move to Today
            </Text>
          </Pressable>
        )}
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 13, color: '#9CA3AF', marginRight: 4 }}>
          {group.tasks.length}
        </Text>
        {collapsed
          ? <ChevronRight size={16} color="#9CA3AF" />
          : <ChevronDown size={16} color="#9CA3AF" />}
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
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 10 }}>
              Move overdue to Today
            </Text>
            <Text style={{ fontSize: 14.5, color: '#555', lineHeight: 22, marginBottom: 24 }}>
              All {group.tasks.filter((t) => t.due).length} dated overdue task
              {group.tasks.filter((t) => t.due).length === 1 ? '' : 's'} will be rescheduled to today.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingVertical: 8 }}>
              <Pressable
                onPress={() => setShowMoveDialog(false)}
                disabled={moving}
                style={{ paddingVertical: 8, paddingHorizontal: 16 }}
              >
                <Text style={{ fontSize: 15, color: '#4772FA', fontWeight: '500', opacity: moving ? 0.4 : 1 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={moveAllToToday}
                disabled={moving}
                style={{ paddingVertical: 8, paddingHorizontal: 16 }}
              >
                <Text style={{ fontSize: 15, color: '#4772FA', fontWeight: '700', opacity: moving ? 0.4 : 1 }}>
                  {moving ? 'Moving…' : 'Move'}
                </Text>
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
}: PriorityDateViewProps) {
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
        />
      ))}
    </ScrollView>
  )
}
