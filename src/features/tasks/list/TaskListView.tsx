import { useMemo } from 'react'
import { Plus } from 'lucide-react'
import { useTasksQuery } from './useTasksQuery'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate } from '@/lib/dateSort'
import { TaskSkeleton } from '@/components/TaskSkeleton'
import { CreateTaskInput } from '@/features/tasks/shared/CreateTaskInput'
import { VirtualTaskList } from './VirtualTaskList'
import { FlatTaskList } from './FlatTaskList'
import { MindMapView } from './MindMapView'
import { useTaskView } from './useTaskView'
import { useState } from 'react'

interface TaskListViewProps {
  isMobile: boolean
}

export function TaskListView({ isMobile }: TaskListViewProps) {
  const { activeChecklistId } = useActiveChecklist()
  const { data: tasks, isLoading, isError } = useTasksQuery(activeChecklistId)
  const [showFabInput, setShowFabInput] = useState(false)
  const { view } = useTaskView()

  const groups = useMemo(() => {
    if (!tasks) return []
    const { allNodes } = buildTaskTree(tasks)
    return groupTasksByDate(allNodes)
  }, [tasks])

  if (!activeChecklistId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Select a checklist to get started
      </div>
    )
  }

  const isEmpty = !isLoading && !isError && groups.length === 0

  return (
    <div className="flex flex-col h-full relative">
      {/* Create task input (desktop & top of mobile) */}
      {!isMobile && view !== 'mindmap' && (
        <CreateTaskInput checklistId={activeChecklistId} />
      )}

      {isLoading && <TaskSkeleton count={8} />}

      {isError && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-red-600 font-medium">Failed to load tasks</p>
            <p className="text-gray-400 text-sm mt-1">Check your connection and try again</p>
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Plus className="w-6 h-6" />
          </div>
          <p className="text-sm">No open tasks. Create one!</p>
        </div>
      )}

      {!isLoading && !isError && !isEmpty && tasks && (
        <>
          {view === 'date' && (
            <VirtualTaskList
              groups={groups}
              checklistId={activeChecklistId}
              isMobile={isMobile}
            />
          )}
          {view === 'list' && (
            <FlatTaskList
              tasks={tasks}
              checklistId={activeChecklistId}
              isMobile={isMobile}
            />
          )}
          {view === 'mindmap' && (
            <MindMapView
              tasks={tasks}
              checklistId={activeChecklistId}
            />
          )}
        </>
      )}

      {/* Mobile FAB */}
      {isMobile && view !== 'mindmap' && (
        <>
          <button
            onClick={() => setShowFabInput(true)}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-orange-500 hover:bg-orange-600 shadow-xl flex items-center justify-center text-white z-20 transition-transform active:scale-95"
            aria-label="New task"
          >
            <Plus className="w-6 h-6" />
          </button>
          {showFabInput && (
            <div className="fixed bottom-24 left-4 right-4 bg-white rounded-2xl shadow-2xl border border-gray-100 z-20">
              <CreateTaskInput
                checklistId={activeChecklistId}
                placeholder="New task…"
                autoFocus
                onCreated={() => setShowFabInput(false)}
              />
              <button
                onClick={() => setShowFabInput(false)}
                className="w-full py-2 text-sm text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
