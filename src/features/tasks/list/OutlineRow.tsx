import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { TaskNode } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { getExpandedState, setExpandedState } from '@/auth/tokenStore'
import { PriorityPicker, priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'

interface OutlineRowProps {
  task: TaskNode
  checklistId: number
  isMobile: boolean
  depth?: number
}

export function OutlineRow({ task, checklistId, isMobile, depth = 0 }: OutlineRowProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const [expanded, setExpanded] = useState(() => getExpandedState(task.id))
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [priorityPos, setPriorityPos] = useState<{ x: number; y: number } | null>(null)
  const [datePos, setDatePos] = useState<{ x: number; y: number } | null>(null)
  const priorityBtnRef = useRef<HTMLButtonElement>(null)
  const dateBtnRef = useRef<HTMLButtonElement>(null)

  const { mutate: updateTask } = useUpdateTask(checklistId)

  const hasChildren = task.children.length > 0
  const indent = depth * 24

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !expanded
    setExpanded(next)
    setExpandedState(task.id, next)
  }

  const openDetail = () => navigate(`/${checklistId}/tasks/${task.id}`)

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

  const handlePriorityBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = priorityBtnRef.current?.getBoundingClientRect()
    if (rect) setPriorityPos({ x: rect.left, y: rect.bottom + 4 })
    setShowPriorityPicker((v) => !v)
    setShowDatePicker(false)
  }

  const handleDateBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = dateBtnRef.current?.getBoundingClientRect()
    if (rect) setDatePos({ x: rect.left, y: rect.bottom + 4 })
    setShowDatePicker((v) => !v)
    setShowPriorityPicker(false)
  }

  // Depth-based styles
  const rowTextClass =
    depth === 0
      ? 'text-[15px] font-bold text-gray-900'
      : depth === 1
        ? 'text-[13.5px] font-medium text-gray-800'
        : 'text-[13px] text-gray-700'

  const rowPaddingY = depth === 0 ? 'py-2' : 'py-1'

  return (
    <>
      <div
        className={`group flex items-center gap-1.5 ${rowPaddingY} pr-3 hover:bg-gray-50 rounded-lg cursor-pointer select-none`}
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={openDetail}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && openDetail()}
      >
        {/* Expand toggle or bullet */}
        {hasChildren ? (
          <button
            onClick={handleExpand}
            onKeyDown={(e) => e.stopPropagation()}
            className="w-5 h-5 flex items-center justify-center shrink-0 text-gray-500 hover:text-gray-800 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <span className={`text-[10px] transition-transform inline-block ${expanded ? 'rotate-90' : ''}`}>
              ▶
            </span>
          </button>
        ) : (
          <span className="w-5 h-5 flex items-center justify-center shrink-0 text-gray-400 text-[8px]">
            •
          </span>
        )}

        {/* Content */}
        <span className={`flex-1 min-w-0 truncate leading-snug ${rowTextClass}`}>
          {task.content}
        </span>

        {/* Child count badge (collapsed only) */}
        {hasChildren && !expanded && (
          <span className="text-[11px] text-gray-400 font-normal shrink-0 tabular-nums">
            {task.children.length}
          </span>
        )}

        {/* Due date bucket pill */}
        {task.due && (
          <button
            ref={dateBtnRef}
            onClick={handleDateBadgeClick}
            onKeyDown={(e) => e.stopPropagation()}
            className={`text-xs font-medium shrink-0 hover:opacity-75 transition-opacity rounded px-1 ${dueDateColorClass(task.due)}`}
            title="Change due date"
          >
            {humanizeDueDate(task.due)}
          </button>
        )}

        {/* Priority badge */}
        <button
          ref={priorityBtnRef}
          onClick={handlePriorityBadgeClick}
          onKeyDown={(e) => e.stopPropagation()}
          className={`text-xs font-bold px-1.5 py-0.5 rounded shrink-0 hover:opacity-75 transition-opacity ${priorityBadgeClass(task.priority)}`}
          title="Change priority"
        >
          {priorityDisplay(task.priority)}
        </button>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {task.children.map((child) => (
            <OutlineRow
              key={child.id}
              task={child}
              checklistId={checklistId}
              isMobile={isMobile}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Priority picker portal */}
      {showPriorityPicker && !isMobile && priorityPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPriorityPicker(false)} />
            <div
              style={{ position: 'fixed', left: priorityPos.x, top: priorityPos.y, zIndex: 50 }}
              className="bg-white rounded-xl shadow-xl border border-gray-100 p-2"
              onClick={(e) => e.stopPropagation()}
            >
              <PriorityPicker value={task.priority} onChange={(p) => { handlePriorityChange(p); setShowPriorityPicker(false) }} />
            </div>
          </>,
          document.body
        )}

      {showPriorityPicker && isMobile &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowPriorityPicker(false)} />
            <div className="fixed inset-x-4 bottom-24 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3">
              <PriorityPicker value={task.priority} onChange={(p) => { handlePriorityChange(p); setShowPriorityPicker(false) }} />
            </div>
          </>,
          document.body
        )}

      {/* Date picker portal */}
      {showDatePicker && !isMobile && datePos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDatePicker(false)} />
            <div
              style={{ position: 'fixed', left: datePos.x, top: datePos.y, zIndex: 50 }}
              onClick={(e) => e.stopPropagation()}
            >
              <QuickDatePicker
                taskId={task.id}
                onSelect={(date) => { handleDateChange(date); setShowDatePicker(false) }}
                onClose={() => setShowDatePicker(false)}
              />
            </div>
          </>,
          document.body
        )}

      {showDatePicker && isMobile &&
        createPortal(
          <QuickDatePicker
            taskId={task.id}
            onSelect={(date) => { handleDateChange(date); setShowDatePicker(false) }}
            onClose={() => setShowDatePicker(false)}
            isMobile
          />,
          document.body
        )}
    </>
  )
}
