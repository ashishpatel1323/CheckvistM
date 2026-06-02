import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTasks, createTask, updateTask, closeTask, deleteTask } from '@/api/endpoints'
import type { CheckvistTask, CreateTaskPayload, UpdateTaskPayload } from '@/api/types'
import { useAuth } from '@/auth/useAuth'

export const tasksQueryKey = (checklistId: number) =>
  ['tasks', checklistId] as const

export function useTasksQuery(checklistId: number | null) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated)

  return useQuery({
    queryKey: tasksQueryKey(checklistId ?? 0),
    queryFn: () => fetchTasks(checklistId!),
    enabled: isAuthenticated && checklistId !== null,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateTask(checklistId: number) {
  const queryClient = useQueryClient()
  const key = tasksQueryKey(checklistId)

  return useMutation({
    networkMode: 'offlineFirst',
    mutationFn: (payload: CreateTaskPayload) => createTask(checklistId, payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CheckvistTask[]>(key)

      const optimistic: CheckvistTask = {
        id: -Date.now(), // temporary negative id
        content: payload.content,
        due: payload.due_date ?? null,
        priority: payload.priority ?? 1,
        status: 0,
        parent_id: payload.parent_id ?? null,
        position: (previous?.length ?? 0) + 1,
        checklist_id: checklistId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      queryClient.setQueryData<CheckvistTask[]>(key, (old = []) => [...old, optimistic])
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useUpdateTask(checklistId: number) {
  const queryClient = useQueryClient()
  const key = tasksQueryKey(checklistId)

  return useMutation({
    networkMode: 'offlineFirst',
    mutationFn: ({ taskId, payload }: { taskId: number; payload: UpdateTaskPayload }) =>
      updateTask(checklistId, taskId, payload),
    onMutate: async ({ taskId, payload }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CheckvistTask[]>(key)

      queryClient.setQueryData<CheckvistTask[]>(key, (old = []) =>
        old.map((t) => (t.id === taskId ? { ...t, ...payload } : t))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useCloseTask(checklistId: number) {
  const queryClient = useQueryClient()
  const key = tasksQueryKey(checklistId)

  return useMutation({
    networkMode: 'offlineFirst',
    mutationFn: (taskId: number) => closeTask(checklistId, taskId),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CheckvistTask[]>(key)

      // Optimistically remove the closed task from the list
      queryClient.setQueryData<CheckvistTask[]>(key, (old = []) =>
        old.filter((t) => t.id !== taskId)
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

export function useDeleteTask(checklistId: number) {
  const queryClient = useQueryClient()
  const key = tasksQueryKey(checklistId)

  return useMutation({
    networkMode: 'offlineFirst',
    mutationFn: (taskId: number) => deleteTask(checklistId, taskId),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<CheckvistTask[]>(key)

      queryClient.setQueryData<CheckvistTask[]>(key, (old = []) =>
        old.filter((t) => t.id !== taskId)
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
