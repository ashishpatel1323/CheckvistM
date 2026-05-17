import { useQuery } from '@tanstack/react-query'
import { fetchChecklists } from '@/api/endpoints'
import { useAuth } from '@/auth/useAuth'

export const checklistsQueryKey = ['checklists'] as const

export function useChecklists() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated)

  return useQuery({
    queryKey: checklistsQueryKey,
    queryFn: fetchChecklists,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
