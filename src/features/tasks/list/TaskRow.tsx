import { useRef, useState } from 'react'
import { View, Text, Pressable, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { useExpandedIds } from './useExpandedIds'
import { ChevronRight, Circle, CheckCircle, CornerUpRight, ExternalLink } from 'lucide-react-native'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { PriorityPicker, priorityBadgeClass, priorityDisplay, priorityTextColor } from '@/features/tasks/shared/PriorityPicker'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { ContextMenu } from '@/features/tasks/shared/ContextMenu'
import { classifyTask, GROUP_LABELS } from '@/lib/dateSort'
import { useCloseTask, useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import { hapticMedium, hapticSuccess } from '@/platform/haptics'
import { BottomSheet } from '@/components/BottomSheet'
import { RawTaskModal } from '@/features/tasks/raw/RawTaskModal'

interface TaskRowProps {
  task: TaskNode
  checklistId: number
  isMobile: boolean
  depth?: number
  isNestedCopy?: boolean
  hiddenDescendantCount?: number
  focusedId?: number | null
}

export function TaskRow({
  task, checklistId, isMobile,
  depth = 0, isNestedCopy = false, hiddenDescendantCount = 0,
  focusedId,
}: TaskRowProps) {
  const router = useRouter()
  const expanded = useExpandedIds((s) => s.expanded.has(task.id))
  const toggleExpanded = useExpandedIds((s) => s.toggle)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
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

  const handleExpand = () => { toggleExpanded(task.id) }

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

  const dateColorClass = task.due ? dueDateColorClass(task.due) : ''
  const isFocused = focusedId === task.id

  const webProps = Platform.OS === 'web' ? { 'data-task-id': task.id } : {}

  return (
    <>
      <Pressable
        onPress={openDetail}
        onLongPress={handleLongPress}
        delayLongPress={500}
        className={`flex-row items-center gap-3 pr-4 active:bg-gray-50 ${isNestedCopy ? 'opacity-75' : ''}`}
        style={[
          { paddingLeft: indent + 16, paddingVertical: 11 },
          isFocused && { backgroundColor: '#EEF2FF', borderLeftWidth: 3, borderLeftColor: '#4772FA', paddingLeft: indent + 13 },
        ]}
        {...webProps}
      >
        {/* Expand toggle */}
        <Pressable
          onPress={handleExpand}
          hitSlop={8}
          className="w-4 h-4 items-center justify-center"
          style={{ opacity: hasChildren ? 1 : 0 }}
          disabled={!hasChildren}
        >
          <ChevronRight
            size={13}
            color="#BDBDBD"
            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
          />
        </Pressable>

        {/* Check button */}
        <Pressable onPress={handleCheck} hitSlop={10} className="w-5 h-5 items-center justify-center">
          {task.status === 1 ? (
            <CheckCircle size={18} color="#4772FA" />
          ) : (
            <Circle size={18} color="#CFCFCF" />
          )}
        </Pressable>

        {/* Content */}
        <Text style={{ flex: 1, fontSize: 14.5, color: '#222', letterSpacing: 0.1 }} numberOfLines={1}>
          <InlineMarkdown content={task.content} />
          {hiddenDescendantCount > 0 && (
            <Text style={{ fontSize: 12, color: '#BDBDBD' }}> · {hiddenDescendantCount} hidden</Text>
          )}
        </Text>

        {/* Also-in-bucket pill */}
        {showAlsoInBucketPill && bucketLabel && (
          <View className="flex-row items-center gap-0.5 bg-gray-50 px-1.5 py-0.5 rounded">
            <CornerUpRight size={10} color="#9ca3af" />
            <Text className="text-gray-400" style={{ fontSize: 10 }}>{bucketLabel}</Text>
          </View>
        )}

        {/* Right side: due date + priority, side by side */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {/* Priority badge */}
          <Pressable
            onPress={() => { setShowPriorityPicker(true); setShowDatePicker(false) }}
            hitSlop={6}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: priorityTextColor(task.priority || 0) }}>
              {priorityDisplay(task.priority || 0)}
            </Text>
          </Pressable>

          {/* Due date */}
          {task.due && (
            <Pressable
              onPress={() => { setShowDatePicker(true); setShowPriorityPicker(false) }}
              hitSlop={6}
            >
              <Text style={{ fontSize: 12, fontWeight: '500', color: dateColorClass.includes('red') ? '#E53935' : '#4772FA' }}>
                {humanizeDueDate(task.due)}
              </Text>
            </Pressable>
          )}

          {/* Jump to raw view icon */}
          <Pressable
            onPress={() => setShowRaw(true)}
            hitSlop={8}
            className="ml-1"
          >
            <ExternalLink size={16} color="#9ca3af" />
          </Pressable>
        </View>
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
              focusedId={focusedId}
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
        onViewRaw={() => setShowRaw(true)}
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

      {/* Raw task modal */}
      {showRaw && (
        <RawTaskModal
          checklistId={checklistId}
          taskId={task.id}
          onClose={() => setShowRaw(false)}
        />
      )}
    </>
  )
}
