import { useLocalSearchParams } from 'expo-router'
import { useAuth } from '@/auth/useAuth'
import { Redirect } from 'expo-router'
import { TaskNotesView } from '@/features/tasks/detail/TaskNotesView'

export default function TaskNotesRoute() {
  const token = useAuth((s) => s.token)
  const { checklistId, taskId } = useLocalSearchParams<{ checklistId: string; taskId: string }>()

  if (!token) return <Redirect href="/login" />

  return <TaskNotesView checklistId={Number(checklistId)} taskId={Number(taskId)} />
}
