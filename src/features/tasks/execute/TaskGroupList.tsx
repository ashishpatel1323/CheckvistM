import { useState, useMemo } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react-native'
import { taskColor } from './taskColor'
import { clientColor } from '@/platform/clientIdentity'
import type { LogBlock } from './ExecutionLogView'

function fmtMinTime(m: number): string {
  const h = Math.floor(m / 60) % 24
  const min = Math.round(m % 60)
  const ap = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(min).padStart(2, '0')} ${ap}`
}

function fmtDur(min: number): string {
  const totalSec = Math.floor(min * 60)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function RowDeleteButton({ onDelete, compact }: { onDelete: () => Promise<void> | void; compact?: boolean }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleDelete = async () => {
    setBusy(true)
    try { await onDelete() }
    catch (e) { console.error('Failed to delete session:', e); setBusy(false); setArmed(false) }
  }

  if (armed) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); if (!busy) handleDelete() }}
          disabled={busy}
          style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: busy ? '#FECACA' : '#EF4444' }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: 'white' }}>{busy ? '…' : 'Confirm'}</Text>
        </Pressable>
        <Pressable
          onPress={(e) => { e.stopPropagation(); setArmed(false) }}
          disabled={busy}
          style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: '#F3F4F6' }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B7280' }}>✕</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Pressable
      onPress={(e) => { e.stopPropagation(); setArmed(true) }}
      hitSlop={6}
      style={{ padding: compact ? 4 : 6, borderRadius: 6, flexShrink: 0 }}
    >
      <Trash2 size={compact ? 14 : 16} color="#9CA3AF" />
    </Pressable>
  )
}

type SortMode = 'time' | 'sessions' | 'alphabetical'

interface TaskGroup {
  taskId: number
  taskName: string
  blocks: LogBlock[]
  totalDur: number
  sessionCount: number
  pctOfDay: number
}

function TaskGroupList({
  blocks,
  taskNames,
  totalDayDur,
  sortMode,
  onPressBlock,
  onDeleteBlock,
}: {
  blocks: LogBlock[]
  taskNames: Record<number, string>
  totalDayDur: number
  sortMode: SortMode
  onPressBlock: (b: LogBlock) => void
  onDeleteBlock: (b: LogBlock) => Promise<void> | void
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // Auto-expand the first group
    const groups = groupBlocks(blocks, taskNames, totalDayDur)
    return new Set(groups.length > 0 ? [groups[0].taskId] : [])
  })

  const groups = useMemo(
    () => sortTaskGroups(groupBlocks(blocks, taskNames, totalDayDur), sortMode),
    [blocks, taskNames, totalDayDur, sortMode],
  )

  if (groups.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 }}>
        <Text style={{ fontSize: 13, color: '#9CA3AF' }}>No sessions recorded for this day.</Text>
      </View>
    )
  }

  const toggleExpanded = (taskId: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const blockName = (b: LogBlock) => taskNames[b.taskId] ?? b.taskName ?? `Task ${b.taskId}`

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }} showsVerticalScrollIndicator={false}>
      {groups.map(group => (
        <View key={group.taskId} style={{ backgroundColor: 'white', borderRadius: 10, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }}>
          {/* Group header */}
          <Pressable
            onPress={() => toggleExpanded(group.taskId)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 12,
              gap: 10,
              backgroundColor: '#F9FAFB',
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: taskColor(group.taskId) }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a' }} numberOfLines={1}>
                {group.taskName}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>{group.sessionCount} sessions</Text>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>•</Text>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>{fmtDur(group.totalDur)}</Text>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>•</Text>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>{Math.round(group.pctOfDay)}% of day</Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={{ width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden', marginRight: 4 }}>
              <View
                style={{
                  height: '100%',
                  width: `${Math.max(2, Math.min(100, group.pctOfDay))}%`,
                  backgroundColor: taskColor(group.taskId),
                }}
              />
            </View>

            <Pressable hitSlop={6} onPress={() => toggleExpanded(group.taskId)}>
              {expanded.has(group.taskId) ? (
                <ChevronUp size={16} color="#9CA3AF" />
              ) : (
                <ChevronDown size={16} color="#9CA3AF" />
              )}
            </Pressable>
          </Pressable>

          {/* Sessions (when expanded) */}
          {expanded.has(group.taskId) && (
            <View style={{ backgroundColor: 'white' }}>
              {group.blocks.map(block => (
                <Pressable
                  key={block.key}
                  onPress={() => onPressBlock(block)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderTopWidth: 1,
                    borderTopColor: '#F3F4F6',
                  }}
                >
                  <View style={{ width: 64 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{fmtMinTime(block.startMin)}</Text>
                    <Text style={{ fontSize: 10, color: '#9CA3AF' }}>{fmtMinTime(block.startMin + block.durationMin)}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a' }}>
                      {blockName(block)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={{ fontSize: 11, color: '#6B7280' }}>{fmtDur(block.durationMin)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: clientColor(block.clientId) }} />
                        <Text numberOfLines={1} style={{ fontSize: 11, color: '#9CA3AF' }}>{block.clientLabel ?? 'Unknown'}</Text>
                      </View>
                    </View>
                  </View>
                  <RowDeleteButton onDelete={() => onDeleteBlock(block)} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  )
}

function groupBlocks(blocks: LogBlock[], taskNames: Record<number, string>, totalDayDur: number): TaskGroup[] {
  const map = new Map<number, TaskGroup>()

  for (const b of blocks) {
    const existing = map.get(b.taskId)
    const dur = b.durationMin
    if (existing) {
      existing.blocks.push(b)
      existing.totalDur += dur
      existing.sessionCount++
    } else {
      map.set(b.taskId, {
        taskId: b.taskId,
        taskName: taskNames[b.taskId] ?? b.taskName ?? `Task ${b.taskId}`,
        blocks: [b],
        totalDur: dur,
        sessionCount: 1,
        pctOfDay: totalDayDur > 0 ? (dur / totalDayDur) * 100 : 0,
      })
    }
  }

  // Sort blocks within each group by start time
  for (const group of map.values()) {
    group.blocks.sort((a, b) => a.startMin - b.startMin)
    group.pctOfDay = totalDayDur > 0 ? (group.totalDur / totalDayDur) * 100 : 0
  }

  return Array.from(map.values())
}

function sortTaskGroups(groups: TaskGroup[], mode: SortMode): TaskGroup[] {
  const sorted = [...groups]
  if (mode === 'time') {
    sorted.sort((a, b) => b.totalDur - a.totalDur)
  } else if (mode === 'sessions') {
    sorted.sort((a, b) => b.sessionCount - a.sessionCount)
  } else if (mode === 'alphabetical') {
    sorted.sort((a, b) => a.taskName.localeCompare(b.taskName))
  }
  return sorted
}

export { TaskGroupList, type SortMode }
