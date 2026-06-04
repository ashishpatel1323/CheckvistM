import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, parseApiDate } from '@/lib/dateUtils'
import { useCloseTask, useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { hapticSuccess, hapticMedium } from '@/platform/haptics'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { PriorityPicker } from '@/features/tasks/shared/PriorityPicker'
import { BottomSheet } from '@/components/BottomSheet'
import { ContextMenu } from '@/features/tasks/shared/ContextMenu'
import { useTaskView } from './useTaskView'
import { isPast, isToday } from 'date-fns'

interface PriorityTaskRowProps {
  task: TaskNode
  checklistId: number
  checklistName?: string
  checkColor: string
  focusedId: number | null
  isLast: boolean
}

export function PriorityTaskRow({
  task,
  checklistId,
  checklistName,
  checkColor,
  focusedId,
  isLast,
}: PriorityTaskRowProps) {
  const router = useRouter()
  const setView = useTaskView((s) => s.setView)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)

  const { mutate: closeTask } = useCloseTask(checklistId)
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const toast = useToast()

  const isFocused = focusedId === task.id

  const handleCheck = () => {
    hapticSuccess()
    closeTask(task.id, {
      onSuccess: () => toast.success('Task completed'),
      onError: () => toast.error('Failed to complete task'),
    })
  }

  const dueDate = task.due ? parseApiDate(task.due) : null
  const isOverdue = dueDate ? isPast(dueDate) && !isToday(dueDate) : false
  const dateColor = isOverdue ? '#EF4444' : '#6B7280'

  return (
    <>
      <Pressable
        onPress={() => router.push(`/${checklistId}/tasks/${task.id}`)}
        onLongPress={() => { hapticMedium(); setContextMenuOpen(true) }}
        delayLongPress={500}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: '#F3F4F6',
          backgroundColor: isFocused ? '#F5F8FF' : '#FFFFFF',
          gap: 10,
        }}
      >
        {/* Square checkbox */}
        <Pressable
          onPress={handleCheck}
          hitSlop={10}
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: task.status === 1 ? checkColor : checkColor,
            backgroundColor: task.status === 1 ? checkColor : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {task.status === 1 && (
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: 'white' }} />
          )}
        </Pressable>

        {/* Title + checklist name */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 14,
              color: task.status === 1 ? '#9CA3AF' : '#111827',
              textDecorationLine: task.status === 1 ? 'line-through' : 'none',
              fontWeight: '400',
            }}
          >
            {task.content}
            {checklistName ? (
              <Text style={{ color: '#9CA3AF', fontWeight: '400' }}> — {checklistName}</Text>
            ) : null}
          </Text>
        </View>

        {/* Due date */}
        {task.due ? (
          <Pressable onPress={() => setShowDatePicker(true)} hitSlop={6}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: dateColor, flexShrink: 0 }}>
              {humanizeDueDate(task.due)}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>

      {/* Context menu */}
      <ContextMenu
        taskId={task.id}
        priority={task.priority}
        open={contextMenuOpen}
        position={null}
        onClose={() => setContextMenuOpen(false)}
        onPriorityChange={(p) => updateTask({ taskId: task.id, payload: { priority: p } })}
        onDateChange={(d) => updateTask({ taskId: task.id, payload: { due_date: d } })}
        onViewRaw={() => setView('raw', task.id)}
        isMobile
      />

      {/* Priority picker */}
      <BottomSheet open={showPriorityPicker} onClose={() => setShowPriorityPicker(false)} title="Set Priority">
        <PriorityPicker
          value={task.priority}
          onChange={(p) => {
            updateTask({ taskId: task.id, payload: { priority: p } })
            setShowPriorityPicker(false)
          }}
        />
      </BottomSheet>

      {/* Date picker */}
      {showDatePicker && (
        <QuickDatePicker
          taskId={task.id}
          onSelect={(d) => {
            updateTask({ taskId: task.id, payload: { due_date: d } })
            setShowDatePicker(false)
          }}
          onClose={() => setShowDatePicker(false)}
          isMobile
        />
      )}
    </>
  )
}
