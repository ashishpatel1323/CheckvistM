import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTasks, createTask, updateTask, closeTask, deleteTask } from '@/api/endpoints'
import type { CheckvistTask, CreateTaskPayload, UpdateTaskPayload } from '@/api/types'
import { useAuth } from '@/auth/useAuth'
import { useSyncState } from '@/lib/sync/syncState'

function recordTaskHistory(
  operation: 'create' | 'update' | 'delete',
  action: string,
  localId: string,
  status: 'synced' | 'failed',
  taskContent?: string,
) {
  const snippet = taskContent
    ? taskContent.replace(/\*\*/g, '').replace(/\*/g, '').trim().slice(0, 60)
    : null
  useSyncState.getState().addHistoryItem({
    id: `task-${localId}-${Date.now()}`,
    entityType: 'task',
    operation,
    localId,
    label: snippet ? `${action} · ${snippet}` : action,
    syncedAt: Date.now(),
    status,
  })
}

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
        id: -Date.now(),
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
    onSuccess: (data, payload) => {
      recordTaskHistory('create', 'Task created', String(data.id), 'synced', payload.content)
    },
    onError: (_err, payload, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous)
      recordTaskHistory('create', 'Task create failed', String(Date.now()), 'failed', payload.content)
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
      const taskContent = previous?.find((t) => t.id === taskId)?.content

      queryClient.setQueryData<CheckvistTask[]>(key, (old = []) =>
        old.map((t) => (t.id === taskId ? { ...t, ...payload } : t))
      )
      return { previous, taskContent }
    },
    onSuccess: (data, { taskId, payload }, context) => {
      const action = payload.priority != null ? 'Priority changed'
        : payload.due_date !== undefined ? 'Due date updated'
        : payload.content != null ? 'Task renamed'
        : payload.status != null ? 'Task status updated'
        : 'Task updated'
      recordTaskHistory('update', action, String(taskId), 'synced', context?.taskContent ?? data.content)
    },
    onError: (_err, { taskId }, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous)
      recordTaskHistory('update', 'Task update failed', String(taskId), 'failed', context?.taskContent)
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
      const taskContent = previous?.find((t) => t.id === taskId)?.content

      queryClient.setQueryData<CheckvistTask[]>(key, (old = []) =>
        old.filter((t) => t.id !== taskId)
      )
      return { previous, taskContent }
    },
    onSuccess: (_data, taskId, context) => {
      recordTaskHistory('update', 'Task completed', String(taskId), 'synced', context?.taskContent)
    },
    onError: (_err, taskId, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous)
      recordTaskHistory('update', 'Task complete failed', String(taskId), 'failed', context?.taskContent)
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
      const taskContent = previous?.find((t) => t.id === taskId)?.content

      queryClient.setQueryData<CheckvistTask[]>(key, (old = []) =>
        old.filter((t) => t.id !== taskId)
      )
      return { previous, taskContent }
    },
    onSuccess: (_data, taskId, context) => {
      recordTaskHistory('delete', 'Task deleted', String(taskId), 'synced', context?.taskContent)
    },
    onError: (_err, taskId, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(key, context.previous)
      recordTaskHistory('delete', 'Task delete failed', String(taskId), 'failed', context?.taskContent)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
