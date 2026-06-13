import { useState, useRef, useCallback, useEffect } from 'react'
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native'
import { Clock, MessageSquare } from 'lucide-react-native'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { useExpandedIds } from './useExpandedIds'
import { PriorityPicker, priorityDisplay, priorityTextColor } from '@/features/tasks/shared/PriorityPicker'
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
  onZoomIn?: (task: TaskNode) => void
}

const BLUE = '#4772FA'

export function OutlineRow({ task, checklistId, isMobile, depth = 0, focusedId, onZoomIn }: OutlineRowProps) {
  const toast = useToast()
  const expanded = useExpandedIds((s) => s.expanded.has(task.id))
  const toggleExpanded = useExpandedIds((s) => s.toggle)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const rowRef = useRef<View>(null)

  const { mutate: updateTask } = useUpdateTask(checklistId)
  const { rowLayouts, measureFns, startDrag, updateDrag, endDrag, dropTargetId, dropZone, draggingId } = useDragContext()

  const hasChildren = task.children.length > 0
  const indent = depth * 22
  const isFocused = focusedId === task.id
  const isDropTarget = dropTargetId === task.id
  const isDragging = draggingId === task.id

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
        { onSuccess: () => toast.success('Task moved'), onError: () => toast.error('Failed to move task') }
      )
    } else {
      const position = zone === 'before' ? targetInfo.position : targetInfo.position + 1
      updateTask(
        { taskId: task.id, payload: { parent_id: targetInfo.parentId, position } },
        { onSuccess: () => toast.success('Task moved'), onError: () => toast.error('Failed to move task') }
      )
    }
  }, [task.id, endDrag, updateTask, toast, rowLayouts])

  const handleCancel = useCallback(() => { endDrag() }, [endDrag])

  const dragGesture = Platform.OS !== 'web'
    ? Gesture.Pan()
      .activateAfterLongPress(400)
      .runOnJS(true)
      .onStart((e) => {
        hapticMedium()
        measureFns.current.forEach((fn) => fn())
        setTimeout(() => { startDrag(task.id, task.content, e.absoluteY) }, 50)
      })
      .onUpdate((e) => { updateDrag(e.absoluteY) })
      .onEnd(() => { handleDrop() })
      .onFinalize(() => { handleCancel() })
    : null

  const webProps = Platform.OS === 'web' ? { 'data-task-id': task.id } : {}

  const dueDateColor = task.due
    ? (dueDateColorClass(task.due).includes('red') ? '#E53935' : '#6B7280')
    : '#6B7280'

  return (
    <>
      {isDropTarget && dropZone === 'before' && (
        <View style={[styles.dropLine, { marginLeft: indent + 28, backgroundColor: BLUE }]} />
      )}

      <View
        ref={rowRef}
        style={[
          styles.rowContainer,
          isDragging && styles.rowDragging,
          isDropTarget && dropZone === 'onto' && { backgroundColor: '#EEF2FF' },
        ]}
      >
        {/* Indented row with bullet */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingLeft: indent + 8 }}>

          {/* Expand/collapse toggle or bullet */}
          <Pressable
            onPress={() => hasChildren ? toggleExpanded(task.id) : (onZoomIn && onZoomIn(task))}
            hitSlop={8}
            style={styles.bulletWrap}
          >
            {hasChildren ? (
              // Triangle bullet — rotates when expanded
              <View style={[
                styles.triangle,
                expanded && styles.triangleExpanded,
              ]} />
            ) : (
              // Filled circle for leaf
              <View style={styles.dot} />
            )}
          </Pressable>

          {/* Row content */}
          {dragGesture ? (
            <GestureDetector gesture={dragGesture}>
              <Pressable
                onPress={() => onZoomIn && onZoomIn(task)}
                style={[
                  styles.contentRow,
                  isFocused && styles.contentRowFocused,
                ]}
                {...webProps}
              >
                <RowContent task={task} isFocused={isFocused} dueDateColor={dueDateColor}
                  setShowPriorityPicker={setShowPriorityPicker} setShowDatePicker={setShowDatePicker} />
              </Pressable>
            </GestureDetector>
          ) : (
            <Pressable
              onPress={() => onZoomIn && onZoomIn(task)}
              style={[styles.contentRow, isFocused && styles.contentRowFocused]}
              {...webProps}
            >
              <RowContent task={task} isFocused={isFocused} dueDateColor={dueDateColor}
                setShowPriorityPicker={setShowPriorityPicker} setShowDatePicker={setShowDatePicker} />
            </Pressable>
          )}
        </View>
      </View>

      {isDropTarget && dropZone === 'after' && (
        <View style={[styles.dropLine, { marginLeft: indent + 28, backgroundColor: BLUE }]} />
      )}

      {hasChildren && expanded && (
        <>
          {/* Vertical guide line */}
          <View
            style={{
              position: 'absolute',
              left: indent + 8 + 10, // align with bullet center
              top: 32,
              width: 1,
              backgroundColor: '#DDDDE3',
              // can't use absolute easily in RN without known height; use border on children wrapper
            }}
          />
          <View style={{ borderLeftWidth: 1, borderLeftColor: '#DDDDE3', marginLeft: indent + 18 }}>
            {task.children.map((child) => (
              <OutlineRow
                key={child.id}
                task={child}
                checklistId={checklistId}
                isMobile={isMobile}
                depth={depth + 1}
                focusedId={focusedId}
                onZoomIn={onZoomIn}
              />
            ))}
          </View>
        </>
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

interface RowContentProps {
  task: TaskNode
  isFocused: boolean
  dueDateColor: string
  setShowPriorityPicker: (v: boolean) => void
  setShowDatePicker: (v: boolean) => void
}

function RowContent({ task, dueDateColor, setShowPriorityPicker, setShowDatePicker }: RowContentProps) {
  return (
    <View style={styles.contentInner}>
      <Text style={styles.taskText} numberOfLines={1}>
        <InlineMarkdown content={task.content} />
      </Text>

      {/* Meta badges */}
      <View style={styles.metaRow}>
        {task.duration && (
          <View style={styles.metaItem}>
            <Clock size={11} color="#9CA3AF" />
            <Text style={styles.metaText}>{task.duration.formatted}</Text>
          </View>
        )}
        {(task.comments_count ?? 0) > 0 && (
          <View style={styles.metaItem}>
            <MessageSquare size={11} color="#9CA3AF" />
            <Text style={styles.metaText}>{task.comments_count}</Text>
          </View>
        )}
        {(task.priority ?? 0) > 0 && (
          <Pressable hitSlop={6} onPress={() => setShowPriorityPicker(true)}>
            <Text style={[styles.metaText, { color: priorityTextColor(task.priority || 0), fontWeight: '600' }]}>
              {priorityDisplay(task.priority || 0)}
            </Text>
          </Pressable>
        )}
        {task.due && (
          <Pressable hitSlop={6} onPress={() => setShowDatePicker(true)}>
            <Text style={[styles.metaText, { color: dueDateColor }]}>
              {humanizeDueDate(task.due)}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  rowContainer: {
    position: 'relative',
  },
  rowDragging: {
    opacity: 0.35,
  },
  bulletWrap: {
    width: 20,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C4C4C8',
  },
  triangle: {
    width: 0,
    height: 0,
    borderTopWidth: 5,
    borderBottomWidth: 5,
    borderLeftWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#A0A0A8',
  },
  triangleExpanded: {
    transform: [{ rotate: '90deg' }],
    borderLeftColor: '#4772FA',
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 32,
    paddingRight: 12,
    paddingVertical: 4,
  },
  contentRowFocused: {
    backgroundColor: '#EEF2FF',
    borderRadius: 4,
  },
  contentInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#1C1C1E',
    letterSpacing: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  metaText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  dropLine: {
    height: 2,
    borderRadius: 1,
    marginVertical: 1,
    marginRight: 8,
  },
})
