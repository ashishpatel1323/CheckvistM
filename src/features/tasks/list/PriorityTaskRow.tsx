import { useState, useEffect } from 'react'
import { View, Pressable, Platform } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
import { useRouter } from 'expo-router'
import { Calendar } from 'lucide-react-native'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, parseApiDate } from '@/lib/dateUtils'
import { useCloseTask, useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { hapticSuccess, hapticMedium } from '@/platform/haptics'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { PriorityPicker } from '@/features/tasks/shared/PriorityPicker'
import { DurationPicker } from '@/features/tasks/shared/DurationPicker'
import { BottomSheet } from '@/components/BottomSheet'
import { ContextMenu } from '@/features/tasks/shared/ContextMenu'
import { updateDurationTag } from '@/lib/durationTagUtils'
import { useTaskView } from './useTaskView'
import { isPast, isToday } from 'date-fns'
import { priorityDisplay, priorityTextColor, priorityRowBg } from '@/features/tasks/shared/PriorityPicker'

export const COL_TAGS = 110
export const COL_TIME = 52
export const COL_DATE = 68
export const COL_PRI  = 36


interface PriorityTaskRowProps {
  task: TaskNode
  checklistId: number
  checklistName?: string
  checkColor: string
  focusedId: number | null
  isLast: boolean
  onMoveUp?: () => void
  onMoveDown?: () => void
}

export function PriorityTaskRow({
  task,
  checklistId,
  checklistName,
  checkColor,
  focusedId,
  isLast,
  onMoveUp,
  onMoveDown,
}: PriorityTaskRowProps) {
  const router = useRouter()
  const setView = useTaskView((s) => s.setView)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [showDurationPicker, setShowDurationPicker] = useState(false)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)

  const { mutate: closeTask } = useCloseTask(checklistId)
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const toast = useToast()

  const isFocused = focusedId === task.id

  // Keyboard move (Shift+ArrowUp / Shift+ArrowDown) when this row is focused
  useEffect(() => {
    if (!isFocused || Platform.OS !== 'web') return
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'ArrowUp') { e.preventDefault(); onMoveUp?.() }
      if (e.shiftKey && e.key === 'ArrowDown') { e.preventDefault(); onMoveDown?.() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFocused, onMoveUp, onMoveDown])

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
        className={`flex-row items-start px-3.5 py-2.5 gap-2.5 ${
          isLast ? '' : 'border-b border-border'
        } ${isFocused ? 'bg-secondary/10' : 'bg-background'}`}
      >
        {/* Square checkbox */}
        <Pressable
          onPress={handleCheck}
          hitSlop={10}
          style={{
            width: 20,
            height: 20,
            marginTop: 1,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: checkColor,
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

        {/* Title + meta chips */}
        <View className="flex-1 min-w-0 gap-1">
          <UIText
            numberOfLines={2}
            className={`text-sm ${task.status === 1 ? 'text-muted-foreground line-through' : 'text-foreground'}`}
            style={{ lineHeight: 20 }}
          >
            {task.content}
          </UIText>

          {/* Meta row: date · duration · priority · tags */}
          <View className="flex-row items-center gap-1.5 flex-wrap">
            {/* Due date */}
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); setShowDatePicker(true) }}
              hitSlop={6}
              className="flex-row items-center gap-1 rounded px-1.25 py-0.5 border border-border bg-muted"
            >
              <Calendar size={9} color={task.due ? dateColor : '#9CA3AF'} />
              <UIText className="text-[10px] font-medium" style={{ color: task.due ? dateColor : '#9CA3AF' }}>
                {task.due ? humanizeDueDate(task.due) : 'Date'}
              </UIText>
            </Pressable>

            {/* Duration */}
            {task.duration && (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); setShowDurationPicker(true) }}
                hitSlop={6}
                className="px-1.25 py-0.5 rounded bg-secondary/10"
              >
                <UIText className="text-[10px] font-semibold" style={{ color: '#4772FA' }}>
                  {task.duration.formatted}
                </UIText>
              </Pressable>
            )}

            {/* Priority */}
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); setShowPriorityPicker(true) }}
              hitSlop={6}
              className="px-1.25 py-0.5 rounded"
              style={{
                backgroundColor: task.priority > 0 && task.priority <= 10 ? priorityRowBg(task.priority) : '#F5F3FF',
              }}
            >
              <UIText className="text-[10px] font-bold" style={{
                color: task.priority > 0 && task.priority <= 10 ? priorityTextColor(task.priority) : '#7c3aed',
              }}>
                {task.priority > 0 && task.priority <= 10 ? priorityDisplay(task.priority) : 'TBD'}
              </UIText>
            </Pressable>

            {/* Tags */}
            {task.tags_as_text ? (
              <UIText numberOfLines={1} className="text-[10px] font-medium flex-shrink" style={{ color: '#4772FA' }}>
                {task.tags_as_text.split(/\s+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}
              </UIText>
            ) : null}
          </View>
        </View>
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

      {/* Duration picker */}
      <BottomSheet open={showDurationPicker} onClose={() => setShowDurationPicker(false)} title="Set Duration">
        <DurationPicker
          value={task.duration}
          onChange={(dur) => {
            const newTags = updateDurationTag(task.tags_as_text, dur?.formatted ?? null)
            updateTask({ taskId: task.id, payload: { tags_as_text: newTags } })
            setShowDurationPicker(false)
          }}
          onClose={() => setShowDurationPicker(false)}
        />
      </BottomSheet>
    </>
  )
}
