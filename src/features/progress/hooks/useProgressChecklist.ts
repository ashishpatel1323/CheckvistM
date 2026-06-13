import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchChecklists, createChecklist } from '@/api/endpoints'

const SYSTEM_CHECKLIST_NAME = '__progress_tracker__'
const STORAGE_KEY = 'progressChecklistId'

function getCachedId(): number | null {
  const v = localStorage.getItem(STORAGE_KEY)
  return v ? parseInt(v, 10) : null
}

function setCachedId(id: number) {
  localStorage.setItem(STORAGE_KEY, String(id))
}

export function useProgressChecklist() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['progress-checklist'],
    queryFn: async () => {
      const cached = getCachedId()
      const checklists = await fetchChecklists()
      const existing = checklists.find(c => c.name === SYSTEM_CHECKLIST_NAME)
      if (existing) {
        setCachedId(existing.id)
        return existing
      }
      if (cached) {
        // cached id but checklist deleted externally — fall through to create
        localStorage.removeItem(STORAGE_KEY)
      }
      const created = await createChecklist(SYSTEM_CHECKLIST_NAME)
      setCachedId(created.id)
      return created
    },
    staleTime: 10 * 60 * 1000,
  })

  return {
    checklistId: query.data?.id ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    queryClient,
  }
}
