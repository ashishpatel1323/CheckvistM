import { useRef, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronRight, Circle, CheckCircle, CornerUpRight } from 'lucide-react-native'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { getExpandedState, setExpandedState } from '@/auth/tokenStore'
import { PriorityPicker, priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { ContextMenu } from '@/features/tasks/shared/ContextMenu'
import { classifyTask, GROUP_LABELS } from '@/lib/dateSort'
import { useCloseTask, useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import { hapticMedium, hapticSuccess } from '@/platform/haptics'
import { BottomSheet } from '@/components/BottomSheet'

interface TaskRowProps {
  task: TaskNode
  checklistId: number
  isMobile: boolean
  depth?: number
  isNestedCopy?: boolean
  hiddenDescendantCount?: number
}

export function TaskRow({
  task, checklistId, isMobile,
  depth = 0, isNestedCopy = false, hiddenDescendantCount = 0,
}: TaskRowProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(() => getExpandedState(task.id))
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { mutate: closeTask } = useCloseTask(checklistId)
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const toast = useToast()

  const hasChildren = task.children.length > 0
  const indent = depth * 20

  const handleCheck = () => {
    hapticSuccess()
    closeTask(task.id, {
      onSuccess: () => toast.success('Task completed'),
      onError: () => toast.error('Failed to close task'),
    })
  }

  const handleExpand = () => {
    const next = !expanded
    setExpanded(next)
    setExpandedState(task.id, next)
  }

  const openDetail = () => {
    router.push(`/${checklistId}/tasks/${task.id}`)
  }

  const handleLongPress = () => {
    hapticMedium()
    setContextMenuOpen(true)
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

  const showAlsoInBucketPill = isNestedCopy && task.due !== null && task.due !== undefined
  const bucketLabel = showAlsoInBucketPill ? GROUP_LABELS[classifyTask(task)] : null

  // Determine text color from dueDateColorClass (Tailwind class string → extract color)
  const dateColorClass = task.due ? dueDateColorClass(task.due) : ''

  return (
    <>
      <Pressable
        onPress={openDetail}
        onLongPress={handleLongPress}
        delayLongPress={500}
        className={`flex-row items-center gap-2 py-2 pr-3 rounded-lg active:bg-gray-50 ${isNestedCopy ? 'opacity-80' : ''}`}
        style={{ paddingLeft: indent + 8 }}
      >
        {/* Expand toggle */}
        <Pressable
          onPress={handleExpand}
          hitSlop={8}
          className="w-5 h-5 items-center justify-center"
          style={{ opacity: hasChildren ? 1 : 0 }}
          disabled={!hasChildren}
        >
          <ChevronRight
            size={14}
            color="#9ca3af"
            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
          />
        </Pressable>

        {/* Check button */}
        <Pressable onPress={handleCheck} hitSlop={8} className="w-5 h-5 items-center justify-center">
          {task.status === 1 ? (
            <CheckCircle size={16} color="#22c55e" />
          ) : (
            <Circle size={16} color="#d1d5db" />
          )}
        </Pressable>

        {/* Content */}
        <Text className="flex-1 text-sm text-gray-800" numberOfLines={1}>
          <InlineMarkdown content={task.content} />
          {hiddenDescendantCount > 0 && (
            <Text className="text-xs text-gray-400"> · {hiddenDescendantCount} hidden</Text>
          )}
        </Text>

        {/* Also-in-bucket pill */}
        {showAlsoInBucketPill && bucketLabel && (
          <View className="flex-row items-center gap-0.5 bg-gray-50 px-1.5 py-0.5 rounded">
            <CornerUpRight size={10} color="#9ca3af" />
            <Text className="text-gray-400" style={{ fontSize: 10 }}>{bucketLabel}</Text>
          </View>
        )}

        {/* Priority badge */}
        <Pressable
          onPress={() => { setShowPriorityPicker(true); setShowDatePicker(false) }}
          hitSlop={6}
          className={`px-1.5 py-0.5 rounded ${priorityBadgeClass(task.priority)}`}
        >
          <Text className={`text-xs font-bold ${priorityBadgeClass(task.priority)}`}>
            {priorityDisplay(task.priority)}
          </Text>
        </Pressable>

        {/* Due date */}
        {task.due && (
          <Pressable
            onPress={() => { setShowDatePicker(true); setShowPriorityPicker(false) }}
            hitSlop={6}
          >
            <Text className={`text-xs font-medium rounded px-0.5 ${dateColorClass}`}>
              {humanizeDueDate(task.due)}
            </Text>
          </Pressable>
        )}
      </Pressable>

      {/* Children when expanded */}
      {hasChildren && expanded && (
        <View>
          {task.children.map((child) => (
            <TaskRow
              key={child.id}
              task={child}
              checklistId={checklistId}
              isMobile={isMobile}
              depth={depth + 1}
              isNestedCopy
            />
          ))}
        </View>
      )}

      {/* Context Menu */}
      <ContextMenu
        taskId={task.id}
        priority={task.priority}
        open={contextMenuOpen}
        position={null}
        onClose={() => setContextMenuOpen(false)}
        onPriorityChange={handlePriorityChange}
        onDateChange={handleDateChange}
        isMobile={isMobile}
      />

      {/* Priority picker bottom sheet */}
      <BottomSheet open={showPriorityPicker} onClose={() => setShowPriorityPicker(false)} title="Set Priority">
        <PriorityPicker value={task.priority} onChange={(p) => { handlePriorityChange(p); setShowPriorityPicker(false) }} />
      </BottomSheet>

      {/* Date picker bottom sheet */}
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
