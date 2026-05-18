import { useMemo } from 'react'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree } from '@/lib/taskTree'
import { TaskRow } from './TaskRow'

interface FlatTaskListProps {
  tasks: CheckvistTask[]
  checklistId: number
  isMobile: boolean
}

export function FlatTaskList({ tasks, checklistId, isMobile }: FlatTaskListProps) {
  const { roots } = useMemo(() => buildTaskTree(tasks), [tasks])

  return (
    <div className="overflow-y-auto flex-1 px-2 py-2">
      {roots.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          checklistId={checklistId}
          isMobile={isMobile}
          depth={0}
        />
      ))}
    </div>
  )
}
