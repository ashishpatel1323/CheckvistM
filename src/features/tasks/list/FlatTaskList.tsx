import { useMemo } from 'react'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree } from '@/lib/taskTree'
import { OutlineRow } from './OutlineRow'

interface FlatTaskListProps {
  tasks: CheckvistTask[]
  checklistId: number
  isMobile: boolean
}

export function FlatTaskList({ tasks, checklistId, isMobile }: FlatTaskListProps) {
  const { roots } = useMemo(() => buildTaskTree(tasks), [tasks])

  return (
    <div className="overflow-y-auto flex-1 px-3 py-3 space-y-0.5">
      {roots.map((task) => (
        <OutlineRow
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
