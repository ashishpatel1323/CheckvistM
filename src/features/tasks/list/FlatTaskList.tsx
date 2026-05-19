import { useMemo } from 'react'
import { ScrollView } from 'react-native'
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
    <ScrollView className="flex-1" contentContainerClassName="px-3 py-3">
      {roots.map((task) => (
        <OutlineRow key={task.id} task={task} checklistId={checklistId} isMobile={isMobile} depth={0} />
      ))}
    </ScrollView>
  )
}
