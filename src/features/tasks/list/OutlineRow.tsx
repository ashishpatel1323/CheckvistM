import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { getExpandedState, setExpandedState } from '@/auth/tokenStore'
import { PriorityPicker, priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import { BottomSheet } from '@/components/BottomSheet'

interface OutlineRowProps {
  task: TaskNode
  checklistId: number
  isMobile: boolean
  depth?: number
}

export function OutlineRow({ task, checklistId, isMobile, depth = 0 }: OutlineRowProps) {
  const router = useRouter()
  const toast = useToast()
  const [expanded, setExpanded] = useState(() => getExpandedState(task.id))
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)

  const { mutate: updateTask } = useUpdateTask(checklistId)

  const hasChildren = task.children.length > 0
  const indent = depth * 24

  const handleExpand = () => {
    const next = !expanded
    setExpanded(next)
    setExpandedState(task.id, next)
  }

  const handlePriorityChange = (priority: number) => {
    updateTask(
      { taskId: task.id, payload: { priority } },
      {
        onSuccess: () => toast.success('Priority updated'),
        onError: () => toast.error('Failed to update priority'),
      }
    )
  }

  const handleDateChange = (date: string | null) => {
    updateTask(
      { taskId: task.id, payload: { due_date: date } },
      {
        onSuccess: () => toast.success('Due date updated'),
        onError: () => toast.error('Failed to update due date'),
      }
    )
  }

  return (
    <>
      <Pressable
        onPress={() => router.push(`/${checklistId}/tasks/${task.id}`)}
        className="flex-row items-center gap-2 py-1.5 pr-3 rounded-lg active:bg-gray-50"
        style={{ paddingLeft: indent + 4 }}
      >
        {hasChildren ? (
          <Pressable onPress={handleExpand} hitSlop={8} className="w-5 h-5 items-center justify-center">
            <ChevronRight
              size={14}
              color="#6b7280"
              style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
            />
          </Pressable>
        ) : (
          <View className="w-5 h-5 items-center justify-center">
            <View className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          </View>
        )}

        <Text className="flex-1 text-sm text-gray-800" numberOfLines={1}>
          <InlineMarkdown content={task.content} />
          {hasChildren && (
            <Text className="text-xs text-gray-400"> [{task.children.length}]</Text>
          )}
        </Text>

        <Pressable
          onPress={() => { setShowPriorityPicker(true); setShowDatePicker(false) }}
          hitSlop={6}
          className={`px-1.5 py-0.5 rounded ${priorityBadgeClass(task.priority)}`}
        >
          <Text className={`text-xs font-bold ${priorityBadgeClass(task.priority)}`}>
            {priorityDisplay(task.priority)}
          </Text>
        </Pressable>

        {task.due && (
          <Pressable
            onPress={() => { setShowDatePicker(true); setShowPriorityPicker(false) }}
            hitSlop={6}
          >
            <Text className={`text-xs font-medium rounded px-0.5 ${dueDateColorClass(task.due)}`}>
              {humanizeDueDate(task.due)}
            </Text>
          </Pressable>
        )}
      </Pressable>

      {hasChildren && expanded && (
        <View style={{ borderLeftWidth: 1, borderLeftColor: '#e5e7eb', marginLeft: indent + 12 }}>
          {task.children.map((child) => (
            <OutlineRow
              key={child.id}
              task={child}
              checklistId={checklistId}
              isMobile={isMobile}
              depth={depth + 1}
            />
          ))}
        </View>
      )}

      <BottomSheet open={showPriorityPicker} onClose={() => setShowPriorityPicker(false)} title="Set Priority">
        <PriorityPicker value={task.priority} onChange={(p) => { handlePriorityChange(p); setShowPriorityPicker(false) }} />
      </BottomSheet>

      {showDatePicker && (
        <QuickDatePicker
          taskId={task.id}
          onSelect={(date) => { handleDateChange(date); setShowDatePicker(false) }}
          onClose={() => setShowDatePicker(false)}
          isMobile
        />
      )}
    </>
  )
}
