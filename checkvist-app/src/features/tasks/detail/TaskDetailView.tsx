import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, X, Calendar, Tag, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchTask } from '@/api/endpoints'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree } from '@/lib/taskTree'
import type { TaskNode } from '@/lib/taskTree'
import { useTasksQuery, useUpdateTask, useCloseTask } from '@/features/tasks/list/useTasksQuery'
import { humanizeDueDate, dueDateColorClass, timeAgo } from '@/lib/dateUtils'
import { Spinner } from '@/components/Spinner'
import { MarkdownRenderer } from './MarkdownRenderer'
import { SubTaskTree } from './SubTaskTree'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { PriorityPicker, priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { useToast } from '@/components/Toast'
import { tasksQueryKey } from '@/features/tasks/list/useTasksQuery'
import { useQueryClient } from '@tanstack/react-query'

interface TaskDetailViewProps {
  isMobile: boolean
  onClose?: () => void
}

export function TaskDetailView({ isMobile, onClose }: TaskDetailViewProps) {
  const { checklistId: checklistIdStr, taskId: taskIdStr } = useParams<{
    checklistId: string
    taskId: string
  }>()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const checklistId = Number(checklistIdStr)
  const taskId = Number(taskIdStr)

  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const dateAnchorRef = useRef<HTMLButtonElement>(null)

  const { data: allTasks } = useTasksQuery(checklistId)
  const { mutate: updateTask, isPending: isUpdating } = useUpdateTask(checklistId)
  const { mutate: closeTask } = useCloseTask(checklistId)

  // Fetch single task for freshest data
  const { data: singleTask, isLoading } = useQuery({
    queryKey: ['task', checklistId, taskId],
    queryFn: () => fetchTask(checklistId, taskId),
    enabled: !!checklistId && !!taskId,
    staleTime: 30 * 1000,
  })

  // Build tree to get the node with children
  const taskNode = useMemo(() => {
    if (!allTasks) return null
    const { getById } = buildTaskTree(allTasks)
    return getById(taskId) ?? null
  }, [allTasks, taskId])

  // Merge taskNode (reliable list data + children) with singleTask (fresher metadata).
  // taskNode is the base; singleTask overrides only fields that are not null/undefined.
  // This prevents a partial/null API response from wiping out good taskNode data.
  const task = useMemo((): (TaskNode & Partial<CheckvistTask>) | null => {
    if (!taskNode && !singleTask) return null
    if (!taskNode) return { ...singleTask!, children: [] as TaskNode[] }
    if (!singleTask) return taskNode
    const merged: TaskNode = { ...taskNode }
    for (const k of Object.keys(singleTask) as Array<keyof CheckvistTask>) {
      const v = singleTask[k]
      if (v !== null && v !== undefined) {
        (merged as unknown as Record<string, unknown>)[k] = v
      }
    }
    return merged
  }, [singleTask, taskNode])

  const titleRef = useRef<HTMLHeadingElement>(null)
  const [editedContent, setEditedContent] = useState(task?.content ?? '')

  // Sync task content to the contentEditable DOM when the task data arrives or changes.
  // React won't update a contentEditable element's inner text after first render,
  // so we drive it manually via a ref.
  useEffect(() => {
    if (!task) return
    setEditedContent(task.content)
    if (titleRef.current && titleRef.current.textContent !== task.content) {
      titleRef.current.textContent = task.content
    }
  }, [task?.id, task?.content])

  const handleClose = () => {
    if (onClose) onClose()
    else navigate(-1)
  }

  const saveContent = () => {
    if (!task || editedContent.trim() === task.content) return
    updateTask(
      { taskId, payload: { content: editedContent.trim() } },
      {
        onSuccess: () => {
          toast.success('Task updated')
          void queryClient.invalidateQueries({ queryKey: ['task', checklistId, taskId] })
        },
        onError: () => {
          toast.error('Failed to update task')
          setEditedContent(task.content)
        },
      }
    )
  }

  const handlePriorityChange = (priority: number) => {
    updateTask(
      { taskId, payload: { priority } },
      {
        onSuccess: () => {
          toast.success('Priority updated')
          void queryClient.invalidateQueries({ queryKey: tasksQueryKey(checklistId) })
          void queryClient.invalidateQueries({ queryKey: ['task', checklistId, taskId] })
          setShowPriorityPicker(false)
        },
        onError: () => toast.error('Failed to update priority'),
      }
    )
  }

  const handleDateChange = (date: string | null) => {
    updateTask(
      { taskId, payload: { due_date: date } },
      {
        onSuccess: () => {
          toast.success('Due date updated')
          void queryClient.invalidateQueries({ queryKey: tasksQueryKey(checklistId) })
          void queryClient.invalidateQueries({ queryKey: ['task', checklistId, taskId] })
          setShowDatePicker(false)
        },
        onError: () => toast.error('Failed to update due date'),
      }
    )
  }

  const handleComplete = () => {
    closeTask(taskId, {
      onSuccess: () => {
        toast.success('Task completed')
        handleClose()
      },
      onError: () => toast.error('Failed to complete task'),
    })
  }

  // Fetch parent task directly so the breadcrumb doesn't depend on allTasks being loaded.
  const parentId = task?.parent_id ?? null
  const { data: parentTask } = useQuery({
    queryKey: ['task', checklistId, parentId],
    queryFn: () => fetchTask(checklistId, parentId!),
    enabled: !!parentId && !!checklistId,
    staleTime: 30 * 1000,
  })

  const wrapperClass = isMobile
    ? 'fixed inset-0 z-30 bg-white flex flex-col'
    : 'h-full flex flex-col bg-white border-l border-gray-100'

  if (isLoading && !task) {
    return (
      <div className={`${wrapperClass} items-center justify-center`}>
        <Spinner size="lg" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className={`${wrapperClass} items-center justify-center`}>
        <p className="text-gray-400">Task not found</p>
        <button onClick={handleClose} className="mt-2 text-orange-500 text-sm">
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
        <button
          onClick={handleClose}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          aria-label="Back"
        >
          {isMobile ? <ArrowLeft className="w-5 h-5" /> : <X className="w-4 h-4" />}
        </button>
        <div className="flex-1" />
        <button
          onClick={handleComplete}
          className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
        >
          Complete
        </button>
        {isUpdating && <Spinner size="sm" />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Parent breadcrumb */}
        {parentTask && (
          <button
            onClick={() => navigate(`/${checklistId}/tasks/${parentTask.id}`)}
            className="flex items-center gap-1 text-sm text-orange-500 hover:text-orange-600 font-medium"
          >
            <ChevronRight className="w-3.5 h-3.5 rotate-180 shrink-0" />
            <span className="truncate">{parentTask.content}</span>
          </button>
        )}

        {/* Title */}
        <h1
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          className="text-xl font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-orange-400 rounded-lg px-1 -mx-1 leading-snug"
          onBlur={(e) => {
            setEditedContent(e.currentTarget.textContent ?? '')
            saveContent()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
        >
          {task.content}
        </h1>

        {/* Meta pills */}
        <div className="flex flex-wrap gap-2">
          {/* Due date pill */}
          <div className="relative">
            <button
              ref={dateAnchorRef}
              onClick={() => {
                setShowDatePicker((v) => !v)
                setShowPriorityPicker(false)
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${
                task.due
                  ? `${dueDateColorClass(task.due)} border-current/30 bg-current/10`
                  : 'text-gray-400 border-gray-200 bg-gray-50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {humanizeDueDate(task.due)}
            </button>
            {showDatePicker && !isMobile && (
              <div className="absolute left-0 top-full mt-2 z-50">
                <QuickDatePicker
                  taskId={task.id}
                  onSelect={handleDateChange}
                  onClose={() => setShowDatePicker(false)}
                  anchorRef={dateAnchorRef}
                />
              </div>
            )}
            {showDatePicker && isMobile && (
              <QuickDatePicker
                taskId={task.id}
                onSelect={handleDateChange}
                onClose={() => setShowDatePicker(false)}
                isMobile
              />
            )}
          </div>

          {/* Priority badge */}
          <div className="relative">
            <button
              onClick={() => {
                setShowPriorityPicker((v) => !v)
                setShowDatePicker(false)
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${priorityBadgeClass(task.priority)}`}
            >
              <Tag className="w-3.5 h-3.5" />
              {priorityDisplay(task.priority ?? 0)}
            </button>
            {showPriorityPicker && !isMobile && (
              <div className="absolute left-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-2">
                <PriorityPicker value={task.priority} onChange={handlePriorityChange} />
              </div>
            )}
            {showPriorityPicker && isMobile && (
              <div className="fixed inset-x-4 bottom-24 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3">
                <PriorityPicker value={task.priority} onChange={handlePriorityChange} />
              </div>
            )}
          </div>

          {/* Status */}
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              task.status === 1
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {task.status === 1 ? 'Done' : 'Open'}
          </span>
        </div>

        {/* Tags */}
        {task.tags_as_text && (
          <div className="flex flex-wrap gap-1">
            {task.tags_as_text.split(',').map((tag) => (
              <span
                key={tag.trim()}
                className="px-2 py-0.5 text-xs bg-blue-50 text-blue-600 rounded-full"
              >
                #{tag.trim()}
              </span>
            ))}
          </div>
        )}

        {/* Notes / Markdown content */}
        {task.notes_count !== undefined && task.notes_count > 0 && (
          <div className="border border-gray-100 rounded-xl p-3 bg-gray-50">
            <MarkdownRenderer content={task.content} />
          </div>
        )}


        {/* Sub-tasks */}
        {taskNode && (
          <SubTaskTree parentTask={taskNode} checklistId={checklistId} />
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
          <p>Created {timeAgo(task.created_at)}</p>
          <p>Updated {timeAgo(task.updated_at)}</p>
          <p className="text-gray-300">ID: {task.id}</p>
        </div>
      </div>
    </div>
  )
}
