import { useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/auth/useAuth'
import { Redirect } from 'expo-router'
import { TaskDetailView } from '@/features/tasks/detail/TaskDetailView'

export default function TaskDetailRoute() {
  const token = useAuth((s) => s.token)
  const { checklistId, taskId } = useLocalSearchParams<{ checklistId: string; taskId: string }>()

  if (!token) return <Redirect href="/login" />

  return <TaskDetailView checklistId={Number(checklistId)} taskId={Number(taskId)} />
}
