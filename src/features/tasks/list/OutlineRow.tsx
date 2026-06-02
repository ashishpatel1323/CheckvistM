import { useState, useRef, useCallback, useEffect } from 'react'
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native'
import { ChevronRight, GripVertical } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { useExpandedIds } from './useExpandedIds'
import { PriorityPicker, priorityBadgeClass, priorityDisplay, priorityTextColor } from '@/features/tasks/shared/PriorityPicker'
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

  const BLUE = '#4772FA'
  const dropIndicatorColor = dropZone === 'onto' ? BLUE : BLUE

  return (
    <>
      {/* Drop-before indicator */}
      {isDropTarget && dropZone === 'before' && (
        <View style={[styles.dropLine, { marginLeft: indent + 4, backgroundColor: BLUE }]} />
      )}

      <View
        ref={rowRef}
        style={[
          styles.rowContainer,
          isDragging && styles.rowDragging,
          isDropTarget && dropZone === 'onto' && { borderColor: dropIndicatorColor, borderWidth: 1.5, borderRadius: 10 },
        ]}
      >
        <Pressable
          onPress={() => router.push(`/${checklistId}/tasks/${task.id}`)}
          className="flex-row items-center gap-3 pr-4 active:bg-gray-50"
          style={[
            { paddingLeft: indent + 16, paddingVertical: 11 },
            isFocused && { backgroundColor: '#EEF2FF', borderLeftWidth: 3, borderLeftColor: BLUE, paddingLeft: indent + 13 },
          ]}
          {...webProps}
        >
          {/* Drag handle (native only) */}
          {Platform.OS !== 'web' && dragGesture && (
            <GestureDetector gesture={dragGesture}>
              <View style={styles.dragHandle} hitSlop={8}>
                <GripVertical size={14} color="#CFCFCF" />
              </View>
            </GestureDetector>
          )}

          {hasChildren ? (
            <Pressable onPress={() => toggleExpanded(task.id)} hitSlop={8} className="w-4 h-4 items-center justify-center">
              <ChevronRight
                size={13}
                color="#BDBDBD"
                style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
              />
            </Pressable>
          ) : (
            <View className="w-4 h-4 items-center justify-center">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#CFCFCF' }} />
            </View>
          )}

          <Text style={{ flex: 1, fontSize: 14.5, color: '#222', letterSpacing: 0.1 }} numberOfLines={1}>
            <InlineMarkdown content={task.content} />
            {hasChildren && (
              <Text style={{ fontSize: 12, color: '#BDBDBD' }}> [{task.children.length}]</Text>
            )}
          </Text>

          <View className="items-end gap-0.5">
            {task.due && (
              <Pressable
                onPress={() => { setShowDatePicker(true); setShowPriorityPicker(false) }}
                hitSlop={6}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: dueDateColorClass(task.due).includes('red') ? '#E53935' : BLUE }}>
                  {humanizeDueDate(task.due)}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => { setShowPriorityPicker(true); setShowDatePicker(false) }}
              hitSlop={6}
            >
              <Text style={{ fontSize: 11, color: priorityTextColor(task.priority || 0), fontWeight: '600' }}>
                {priorityDisplay(task.priority || 0)}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </View>

      {/* Drop-after indicator */}
      {isDropTarget && dropZone === 'after' && (
        <View style={[styles.dropLine, { marginLeft: indent + 4, backgroundColor: BLUE }]} />
      )}

      {hasChildren && expanded && (
        <View style={{ borderLeftWidth: 1, borderLeftColor: '#EFEFEF', marginLeft: indent + 28 }}>
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
