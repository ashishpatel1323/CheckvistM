import { useState, useMemo } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import type { TaskNode } from '@/lib/taskTree'
import type { GroupedTasks, DateGroup } from '@/lib/dateSort'
import { PriorityTaskRow } from './PriorityTaskRow'
import { classifyPriority } from '@/features/tasks/shared/PriorityPicker'
import type { PriorityBucket } from '@/features/tasks/shared/PriorityPicker'

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
  isMobile,
}: {
  bucket: PriorityBucket
  tasks: TaskNode[]
  checklistId: number
  checklistName?: string
  focusedId: number | null
  isMobile: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const meta = PRIORITY_META[bucket]

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
        <Text style={{ fontSize: 13, color: '#9CA3AF', marginRight: 4 }}>{tasks.length}</Text>
        {collapsed
          ? <ChevronRight size={14} color="#9CA3AF" />
          : <ChevronDown size={14} color="#9CA3AF" />}
      </Pressable>

      {!collapsed && tasks.map((task, i) => (
        <PriorityTaskRow
          key={task.id}
          task={task}
          checklistId={checklistId}
          checklistName={checklistName}
          checkColor={meta.color}
          focusedId={focusedId}
          isLast={i === tasks.length - 1}
        />
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
  isMobile,
}: {
  group: GroupedTasks
  checklistId: number
  checklistName?: string
  focusedId: number | null
  isMobile: boolean
}) {
  const [collapsed, setCollapsed] = useState(!DATE_GROUP_DEFAULT_OPEN[group.group])
  const accent = DATE_GROUP_COLOR[group.group]

  const buckets = useMemo(() => {
    const b: Record<PriorityBucket, TaskNode[]> = { high: [], medium: [], low: [], tbd: [] }
    for (const t of group.tasks) b[classifyPriority(t.priority)].push(t)
    return b
  }, [group.tasks])

  const activeBuckets = PRIORITY_BUCKETS.filter((b) => buckets[b].length > 0)

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
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: accent }}>
          {group.label}
        </Text>
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
          isMobile={isMobile}
        />
      ))}
    </View>
  )
}

// ─── Root view ────────────────────────────────────────────────────────────────

export function PriorityDateView({
  groups,
  checklistId,
  isMobile,
  focusedId,
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
          isMobile={isMobile}
        />
      ))}
    </ScrollView>
  )
}
