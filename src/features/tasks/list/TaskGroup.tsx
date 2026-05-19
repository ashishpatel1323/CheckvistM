import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { ChevronDown } from 'lucide-react-native'
import type { GroupedTasks } from '@/lib/dateSort'
import { TaskRow } from './TaskRow'

interface TaskGroupProps {
  group: GroupedTasks
  checklistId: number
  isMobile: boolean
  focusedId?: number | null
}

const groupColors: Record<string, { text: string; bg: string }> = {
  overdue:    { text: '#dc2626', bg: '#fef2f2' },
  today:      { text: '#ea580c', bg: '#fff7ed' },
  tomorrow:   { text: '#ca8a04', bg: '#fefce8' },
  thisWeek:   { text: '#2563eb', bg: '#eff6ff' },
  later:      { text: '#4f46e5', bg: '#eef2ff' },
  noDueDate:  { text: '#6b7280', bg: '#f9fafb' },
}

export function TaskGroup({ group, checklistId, isMobile, focusedId }: TaskGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const colors = groupColors[group.group] ?? { text: '#6b7280', bg: '#f9fafb' }

  return (
    <View className="mb-2">
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        className="flex-row items-center gap-2 px-3 py-1.5 rounded-lg mb-1"
        style={{ backgroundColor: colors.bg }}
      >
        <ChevronDown
          size={14}
          color={colors.text}
          style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}
        />
        <Text className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.text }}>
          {group.label}
        </Text>
        <Text className="ml-auto text-xs" style={{ color: colors.text, opacity: 0.6 }}>
          {group.tasks.length}
        </Text>
      </Pressable>

      {!collapsed && (
        <View>
          {group.tasks.map((task) => (
            <TaskRow key={task.id} task={task} checklistId={checklistId} isMobile={isMobile} focusedId={focusedId} />
          ))}
        </View>
      )}
    </View>
  )
}
