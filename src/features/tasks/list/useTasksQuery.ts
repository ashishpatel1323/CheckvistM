import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { fetchTasks, createTask, updateTask, closeTask } from '@/api/endpoints'
import type { CreateTaskPayload, UpdateTaskPayload } from '@/api/types'
import { useAuth } from '@/auth/useAuth'
import { getCachedTasks } from '@/lib/taskCache'

export const tasksQueryKey = (checklistId: number) =>
  ['tasks', checklistId] as const

export function useTasksQuery(checklistId: number | null) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated)
  const queryClient = useQueryClient()

  // Pre-populate React Query cache from IndexedDB when switching checklists.
  // updatedAt: 0 marks data as immediately stale so the API fetch still fires in background.
  useEffect(() => {
    if (!checklistId) return
    const key = tasksQueryKey(checklistId)
    if (queryClient.getQueryData(key) !== undefined) return
    getCachedTasks(checklistId)
      .then((tasks) => {
        if (tasks.length > 0 && queryClient.getQueryData(key) === undefined) {
          queryClient.setQueryData(key, tasks, { updatedAt: 0 })
        }
      })
      .catch(() => {})
  }, [checklistId, queryClient])

  return useQuery({
    queryKey: tasksQueryKey(checklistId ?? 0),
    queryFn: () => fetchTasks(checklistId!),
    enabled: isAuthenticated && checklistId !== null,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateTask(checklistId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateTaskPayload) => createTask(checklistId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey(checklistId) })
    },
  })
}

export function useUpdateTask(checklistId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: UpdateTaskPayload }) =>
      updateTask(checklistId, taskId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey(checklistId) })
    },
  })
}

export function useCloseTask(checklistId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (taskId: number) => closeTask(checklistId, taskId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tasksQueryKey(checklistId) })
    },
  })
}
