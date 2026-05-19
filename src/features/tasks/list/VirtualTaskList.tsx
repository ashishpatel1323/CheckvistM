import { ScrollView } from 'react-native'
import type { GroupedTasks } from '@/lib/dateSort'
import { TaskGroup } from './TaskGroup'

interface VirtualTaskListProps {
  groups: GroupedTasks[]
  checklistId: number
  isMobile: boolean
}

// On native, FlashList handles virtualization. On web, a simple ScrollView is used.
// True virtualization via @tanstack/react-virtual can be restored for web if needed for
// very large lists — for now ScrollView is sufficient for typical checklist sizes.
export function VirtualTaskList({ groups, checklistId, isMobile }: VirtualTaskListProps) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="px-2 py-2">
      {groups.map((group) => (
        <TaskGroup key={group.group} group={group} checklistId={checklistId} isMobile={isMobile} />
      ))}
    </ScrollView>
  )
}
