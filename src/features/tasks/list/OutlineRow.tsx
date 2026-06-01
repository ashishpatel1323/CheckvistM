import { useState, useRef, useCallback, useEffect } from 'react'
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native'
import { ChevronRight, GripVertical } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { useExpandedIds } from './useExpandedIds'
import { PriorityPicker, priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import { BottomSheet } from '@/components/BottomSheet'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useDragContext } from './DragContext'
import { hapticMedium } from '@/platform/haptics'

interface OutlineRowProps {
  task: TaskNode
  checklistId: number
  isMobile: boolean
  depth?: number
  focusedId?: number | null
}

export function OutlineRow({ task, checklistId, isMobile, depth = 0, focusedId }: OutlineRowProps) {
  const router = useRouter()
  const toast = useToast()
  const expanded = useExpandedIds((s) => s.expanded.has(task.id))
  const toggleExpanded = useExpandedIds((s) => s.toggle)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const rowRef = useRef<View>(null)

  const { mutate: updateTask } = useUpdateTask(checklistId)
  const { rowLayouts, measureFns, startDrag, updateDrag, endDrag, dropTargetId, dropZone, draggingId } = useDragContext()

  const hasChildren = task.children.length > 0
  const indent = depth * 24
  const isFocused = focusedId === task.id
  const isDropTarget = dropTargetId === task.id
  const isDragging = draggingId === task.id

  // Register this row's measureInWindow function so it can be called at drag start
  useEffect(() => {
    const measure = () => {
      rowRef.current?.measureInWindow((x, y, w, h) => {
        rowLayouts.current.set(task.id, {
          screenY: y,
          height: h,
          parentId: task.parent_id,
          position: task.position,
        })
      })
    }
    measureFns.current.set(task.id, measure)
    return () => { measureFns.current.delete(task.id) }
  }, [task.id, task.parent_id, task.position, rowLayouts, measureFns])

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

  const handleDrop = useCallback(() => {
    const { targetId, zone } = endDrag()
    if (targetId === null || targetId === task.id) return

    const targetInfo = rowLayouts.current.get(targetId)
    if (!targetInfo) return

    if (zone === 'onto') {
      updateTask(
        { taskId: task.id, payload: { parent_id: targetId, position: 1 } },
        {
          onSuccess: () => toast.success('Task moved'),
          onError: () => toast.error('Failed to move task'),
        }
      )
    } else {
      const position = zone === 'before' ? targetInfo.position : targetInfo.position + 1
      updateTask(
        { taskId: task.id, payload: { parent_id: targetInfo.parentId, position } },
        {
          onSuccess: () => toast.success('Task moved'),
          onError: () => toast.error('Failed to move task'),
        }
      )
    }
  }, [task.id, endDrag, updateTask, toast, rowLayouts])

  const handleCancel = useCallback(() => {
    endDrag()
  }, [endDrag])

  const dragGesture = Platform.OS !== 'web'
    ? Gesture.Pan()
      .activateAfterLongPress(400)
      .runOnJS(true)
      .onStart((e) => {
        hapticMedium()
        // Refresh all row measurements so positions are current
        measureFns.current.forEach((fn) => fn())
        setTimeout(() => {
          startDrag(task.id, task.content, e.absoluteY)
        }, 50)
      })
      .onUpdate((e) => {
        updateDrag(e.absoluteY)
      })
      .onEnd(() => {
        handleDrop()
      })
      .onFinalize(() => {
        // Clean up if gesture was cancelled before onEnd
        handleCancel()
      })
    : null

  const webProps = Platform.OS === 'web' ? { 'data-task-id': task.id } : {}

  const dropIndicatorColor = dropZone === 'onto' ? '#E8632A' : '#3b82f6'

  return (
    <>
      {/* Drop-before indicator */}
      {isDropTarget && dropZone === 'before' && (
        <View style={[styles.dropLine, { marginLeft: indent + 4 }]} />
      )}

      <View
        ref={rowRef}
        style={[
          styles.rowContainer,
          isDragging && styles.rowDragging,
          isDropTarget && dropZone === 'onto' && { borderColor: dropIndicatorColor, borderWidth: 1.5, borderRadius: 8 },
        ]}
      >
        <Pressable
          onPress={() => router.push(`/${checklistId}/tasks/${task.id}`)}
          className="flex-row items-center gap-2 py-1.5 pr-3 rounded-lg active:bg-gray-50"
          style={[
            { paddingLeft: indent + 4 },
            isFocused && { backgroundColor: '#fff7ed', borderLeftWidth: 2, borderLeftColor: '#E8632A', paddingLeft: indent + 2 },
          ]}
          {...webProps}
        >
          {/* Drag handle (native only) */}
          {Platform.OS !== 'web' && dragGesture && (
            <GestureDetector gesture={dragGesture}>
              <View style={styles.dragHandle} hitSlop={8}>
                <GripVertical size={14} color="#d1d5db" />
              </View>
            </GestureDetector>
          )}

          {hasChildren ? (
            <Pressable onPress={() => toggleExpanded(task.id)} hitSlop={8} className="w-5 h-5 items-center justify-center">
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
      </View>

      {/* Drop-after indicator */}
      {isDropTarget && dropZone === 'after' && (
        <View style={[styles.dropLine, { marginLeft: indent + 4 }]} />
      )}

      {hasChildren && expanded && (
        <View style={{ borderLeftWidth: 1, borderLeftColor: '#e5e7eb', marginLeft: indent + 12 }}>
          {task.children.map((child) => (
            <OutlineRow
              key={child.id}
              task={child}
              checklistId={checklistId}
              isMobile={isMobile}
              depth={depth + 1}
              focusedId={focusedId}
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

const styles = StyleSheet.create({
  rowContainer: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowDragging: {
    opacity: 0.4,
  },
  dragHandle: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropLine: {
    height: 2,
    backgroundColor: '#3b82f6',
    borderRadius: 1,
    marginVertical: 1,
    marginRight: 8,
  },
})
