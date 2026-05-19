import { useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/auth/useAuth'
import { Redirect } from 'expo-router'
import { TaskListView } from '@/features/tasks/list/TaskListView'

export default function ChecklistRoute() {
  const token = useAuth((s) => s.token)
  const { checklistId } = useLocalSearchParams<{ checklistId: string }>()

  if (!token) return <Redirect href="/login" />

  return <TaskListView checklistId={Number(checklistId)} />
}
