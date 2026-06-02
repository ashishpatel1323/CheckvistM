import { useQuery } from '@tanstack/react-query'
import { fetchTaskNotes } from '@/api/endpoints'
import { useAuth } from '@/auth/useAuth'

export const taskNotesQueryKey = (checklistId: number, taskId: number) =>
  ['notes', checklistId, taskId] as const

export function useTaskNotesQuery(checklistId: number, taskId: number) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated)

  return useQuery({
    queryKey: taskNotesQueryKey(checklistId, taskId),
    queryFn: () => fetchTaskNotes(checklistId, taskId),
    enabled: isAuthenticated && !!checklistId && !!taskId,
    staleTime: 30 * 1000,
  })
}
