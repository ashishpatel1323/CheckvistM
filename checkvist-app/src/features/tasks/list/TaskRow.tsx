import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Circle, CheckCircle, CornerUpRight } from 'lucide-react'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { getExpandedState, setExpandedState } from '@/auth/tokenStore'
import { priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { ContextMenu } from '@/features/tasks/shared/ContextMenu'
import { classifyTask, GROUP_LABELS } from '@/lib/dateSort'
import { useCloseTask, useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'

interface TaskRowProps {
  task: TaskNode
  checklistId: number
  isMobile: boolean
  /** Indent level: 0 at the top of a bucket, +1 per nested level inside an expanded parent. */
  depth?: number
  /** True when this row is rendered nested under an expanded ancestor (not in its own bucket). */
  isNestedCopy?: boolean
  /** Number of descendants the current filter would hide. In Phase 1 always 0. */
  hiddenDescendantCount?: number
}

export function TaskRow({
  task,
  checklistId,
  isMobile,
  depth = 0,
  isNestedCopy = false,
  hiddenDescendantCount = 0,
}: TaskRowProps) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(() => getExpandedState(task.id))
  const [contextMenu, setContextMenu] = useState<{
    open: boolean
    position: { x: number; y: number } | null
  }>({ open: false, position: null })

  const { mutate: closeTask } = useCloseTask(checklistId)
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const toast = useToast()

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasChildren = task.children.length > 0
  const indent = depth * 20

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation()
    closeTask(task.id, {
      onSuccess: () => toast.success('Task completed'),
      onError: () => toast.error('Failed to close task'),
    })
  }

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !expanded
    setExpanded(next)
    setExpandedState(task.id, next)
  }

  const openDetail = () => {
    navigate(`/${checklistId}/tasks/${task.id}`)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isMobile) return
    e.preventDefault()
    setContextMenu({ open: true, position: { x: e.clientX, y: e.clientY } })
  }

  const handleTouchStart = () => {
    if (!isMobile) return
    longPressTimer.current = setTimeout(() => {
      setContextMenu({ open: true, position: null })
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
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

  // A nested copy that has its own due date also exists at the top level in its bucket.
  const showAlsoInBucketPill = isNestedCopy && task.due !== null && task.due !== undefined
  const bucketLabel = showAlsoInBucketPill ? GROUP_LABELS[classifyTask(task)] : null

  return (
    <>
      <div
        className={`group flex items-center gap-2 py-2 pr-3 hover:bg-gray-50 rounded-lg cursor-pointer select-none ${
          isNestedCopy ? 'opacity-80' : ''
        }`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={openDetail}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && openDetail()}
      >
        {/* Expand toggle */}
        <button
          onClick={handleExpand}
          className={`w-5 h-5 flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 transition-colors ${
            hasChildren ? 'visible' : 'invisible'
          }`}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-hidden={!hasChildren}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </button>

        {/* Check button */}
        <button
          onClick={handleCheck}
          className="w-5 h-5 flex items-center justify-center shrink-0 text-gray-300 hover:text-green-500 transition-colors"
          aria-label="Complete task"
        >
          {task.status === 1 ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
          ) : (
            <Circle className="w-4 h-4" />
          )}
        </button>

        {/* Content + meta */}
        <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
          {task.content}
          {hiddenDescendantCount > 0 && (
            <span className="ml-2 text-xs text-gray-400">· {hiddenDescendantCount} hidden</span>
          )}
        </span>

        {/* "Also in <bucket>" pill — only on nested copies that also show at top level */}
        {showAlsoInBucketPill && bucketLabel && (
          <span
            className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded shrink-0"
            title={`Also shown under ${bucketLabel}`}
          >
            <CornerUpRight className="w-2.5 h-2.5" />
            {bucketLabel}
          </span>
        )}

        {/* Priority badge — always shown; P11 = no priority set */}
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 ${priorityBadgeClass(task.priority)}`}
        >
          {priorityDisplay(task.priority)}
        </span>

        {/* Due date */}
        {task.due && (
          <span className={`text-xs font-medium shrink-0 ${dueDateColorClass(task.due)}`}>
            {humanizeDueDate(task.due)}
          </span>
        )}
      </div>

      {/* Children (when expanded) — rendered as nested copies at depth+1 */}
      {hasChildren && expanded && (
        <div>
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
        </div>
      )}

      {/* Context Menu */}
      <ContextMenu
        taskId={task.id}
        priority={task.priority}
        open={contextMenu.open}
        position={contextMenu.position}
        onClose={() => setContextMenu({ open: false, position: null })}
        onPriorityChange={handlePriorityChange}
        onDateChange={handleDateChange}
        isMobile={isMobile}
      />
    </>
  )
}
