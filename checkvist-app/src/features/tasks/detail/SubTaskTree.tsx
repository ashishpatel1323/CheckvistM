import { useState } from 'react'
import { ChevronDown, ChevronRight, Circle, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { TaskNode } from '@/lib/taskTree'
import { useCloseTask } from '@/features/tasks/list/useTasksQuery'
import { useToast } from '@/components/Toast'
import { CreateTaskInput } from '@/features/tasks/shared/CreateTaskInput'
import { priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'

interface SubTaskNodeProps {
  task: TaskNode
  checklistId: number
  depth?: number
}

function SubTaskNode({ task, checklistId, depth = 0 }: SubTaskNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const navigate = useNavigate()
  const { mutate: closeTask } = useCloseTask(checklistId)
  const toast = useToast()
  const hasChildren = task.children.length > 0
  const indent = depth * 16

  return (
    <>
      <div
        className="flex items-center gap-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
        style={{ paddingLeft: `${indent + 8}px` }}
        onClick={() => navigate(`/${checklistId}/tasks/${task.id}`)}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          className={`w-4 h-4 flex items-center justify-center text-gray-300 hover:text-gray-500 ${hasChildren ? '' : 'invisible'}`}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>

        {/* Check */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            closeTask(task.id, {
              onSuccess: () => toast.success('Subtask completed'),
              onError: () => toast.error('Failed to complete subtask'),
            })
          }}
          className="w-4 h-4 flex items-center justify-center text-gray-300 hover:text-green-500 transition-colors shrink-0"
        >
          {task.status === 1 ? (
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Circle className="w-3.5 h-3.5" />
          )}
        </button>

        <span className="flex-1 text-sm text-gray-700">{task.content}</span>

        <span className={`text-xs font-bold px-1 py-0.5 rounded ${priorityBadgeClass(task.priority)}`}>
          {priorityDisplay(task.priority)}
        </span>
      </div>

      {hasChildren && expanded && (
        <div>
          {task.children.map((child) => (
            <SubTaskNode
              key={child.id}
              task={child}
              checklistId={checklistId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </>
  )
}

interface SubTaskTreeProps {
  parentTask: TaskNode
  checklistId: number
}

export function SubTaskTree({ parentTask, checklistId }: SubTaskTreeProps) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Sub-tasks ({parentTask.children.length})
      </h3>

      {parentTask.children.length > 0 && (
        <div className="space-y-0.5 mb-3">
          {parentTask.children.map((child) => (
            <SubTaskNode key={child.id} task={child} checklistId={checklistId} />
          ))}
        </div>
      )}

      {showAdd ? (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <CreateTaskInput
            checklistId={checklistId}
            parentId={parentTask.id}
            placeholder="New sub-task…"
            autoFocus
            onCreated={() => setShowAdd(false)}
          />
          <button
            onClick={() => setShowAdd(false)}
            className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-sm text-orange-500 hover:text-orange-600 font-medium"
        >
          + Add sub-task
        </button>
      )}
    </div>
  )
}
