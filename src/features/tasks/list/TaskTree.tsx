import { View } from 'react-native'
import type { TaskNode } from '@/lib/taskTree'
import { TaskRow } from './TaskRow'

interface TaskTreeProps {
  tasks: TaskNode[]
  checklistId: number
  isMobile: boolean
}

export function TaskTree({ tasks, checklistId, isMobile }: TaskTreeProps) {
  return (
    <View>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} checklistId={checklistId} isMobile={isMobile} />
      ))}
    </View>
  )
}
