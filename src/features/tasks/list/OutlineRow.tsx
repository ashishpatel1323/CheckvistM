import { useState, useRef, useCallback, useEffect } from 'react'
import { View, Text, Pressable, Platform, StyleSheet, TextInput } from 'react-native'
import { Clock, MessageSquare } from 'lucide-react-native'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { useExpandedIds } from './useExpandedIds'
import { PriorityPicker, priorityDisplay, priorityTextColor } from '@/features/tasks/shared/PriorityPicker'
import { useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { InlineMarkdown } from '@/components/InlineMarkdown'
import { BottomSheet } from '@/components/BottomSheet'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useDragContext } from './DragContext'
import { hapticMedium } from '@/platform/haptics'
import { useOutlineEdit } from './useOutlineEdit'
import { useOutlineOps } from './outlineContext'

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
  const rowRef = useRef<View>(null)
  const inputRef = useRef<TextInput>(null)
  const submittedRef = useRef(false)

  const activeId = useOutlineEdit((s) => s.activeId)
  const setActiveId = useOutlineEdit((s) => s.setActiveId)
  const ops = useOutlineOps()

  const isEditing = activeId === task.id

  const [localText, setLocalText] = useState(task.content)

  // Keep localText in sync when not editing
  useEffect(() => {
    if (!isEditing) {
      setLocalText(task.content)
    }
  }, [task.content, isEditing])

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

  // Auto-focus TextInput when this row becomes active
  useEffect(() => {
    if (isEditing) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [isEditing])

  // Web keyboard handler for Tab/Shift+Tab/Escape
  useEffect(() => {
    if (!isEditing || Platform.OS !== 'web') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) {
          ops.indentOut(task)
        } else {
          ops.indentIn(task)
        }
      } else if (e.key === 'Escape') {
        handleSave()
        setActiveId(null)
      }
    }

    const domInput = (inputRef.current as unknown as HTMLInputElement)
    if (domInput) {
      domInput.addEventListener('keydown', handleKeyDown)
      return () => domInput.removeEventListener('keydown', handleKeyDown)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, task, ops])

  const handleSave = useCallback(() => {
    const trimmed = localText.trim()
    if (trimmed && trimmed !== task.content) {
      updateTask(
        { taskId: task.id, payload: { content: trimmed } },
        {
          onSuccess: () => toast.success('Task updated'),
          onError: () => toast.error('Failed to update task'),
        }
      )
    }
  }, [localText, task.content, task.id, updateTask, toast])

  const handleEnter = useCallback(() => {
    submittedRef.current = true
    handleSave()
    ops.createSiblingAfter(task)
  }, [handleSave, ops, task])

  const handleBlur = useCallback(() => {
    if (!submittedRef.current) {
      handleSave()
      if (activeId === task.id) {
        setActiveId(null)
      }
    }
    submittedRef.current = false
  }, [handleSave, activeId, task.id, setActiveId])

  const handlePriorityChange = (priority: number) => {
    updateTask(
      { taskId: task.id, payload: { priority } },
      {
        onSuccess: () => toast.success('Priority updated'),
        onError: () => toast.error('Failed to update priority'),
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

  // Disable drag when editing
  const dragGesture = Platform.OS !== 'web' && !isEditing
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
          isEditing && { backgroundColor: '#EEF2FF' },
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
          {isEditing ? (
            // Edit mode: TextInput in place
            <TextInput
              ref={inputRef}
              value={localText}
              onChangeText={setLocalText}
              onBlur={handleBlur}
              onSubmitEditing={handleEnter}
              submitBehavior="submit"
              multiline={false}
              style={[
                styles.textInput,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(Platform.OS === 'web' ? [{ outlineWidth: 0 } as any] : []),
              ]}
            />
          ) : dragGesture ? (
            <GestureDetector gesture={dragGesture}>
              <Pressable
                onPress={() => setActiveId(task.id)}
                style={[
                  styles.contentRow,
                  isFocused && styles.contentRowFocused,
                ]}
                {...webProps}
              >
                <RowContent
                  task={task}
                  isFocused={isFocused}
                  dueDateColor={dueDateColor}
                  setShowPriorityPicker={setShowPriorityPicker}
                  onDatePress={() => ops.openDatePicker(task.id)}
                />
              </Pressable>
            </GestureDetector>
          ) : (
            <Pressable
              onPress={() => setActiveId(task.id)}
              style={[styles.contentRow, isFocused && styles.contentRowFocused]}
              {...webProps}
            >
              <RowContent
                task={task}
                isFocused={isFocused}
                dueDateColor={dueDateColor}
                setShowPriorityPicker={setShowPriorityPicker}
                onDatePress={() => ops.openDatePicker(task.id)}
              />
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
    </>
  )
}

interface RowContentProps {
  task: TaskNode
  isFocused: boolean
  dueDateColor: string
  setShowPriorityPicker: (v: boolean) => void
  onDatePress: () => void
}

function RowContent({ task, dueDateColor, setShowPriorityPicker, onDatePress }: RowContentProps) {
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
          <Pressable hitSlop={6} onPress={onDatePress}>
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
    height: 36,
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
    minHeight: 36,
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
    fontSize: 15,
    lineHeight: 20,
    color: '#1C1C1E',
    letterSpacing: 0,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: '#1C1C1E',
    paddingVertical: 8,
    paddingRight: 12,
    minHeight: 36,
    backgroundColor: 'transparent',
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
