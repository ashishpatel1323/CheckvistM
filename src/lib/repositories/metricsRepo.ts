/**
 * Metrics repository — reads merged state from tasks + progress.
 * Always includes local/dirty items so metrics are never stale.
 * Uses the React Query cache directly (no direct API calls).
 */

import { queryClient } from '@/queryClient'
import { tasksQueryKey } from '@/features/tasks/list/useTasksQuery'
import type { CheckvistTask } from '@/api/types'

/** Get all tasks for a checklist from the cache — includes optimistic (unsyced) entries. */
export function getCachedTasks(checklistId: number): CheckvistTask[] {
  return queryClient.getQueryData<CheckvistTask[]>(tasksQueryKey(checklistId)) ?? []
}

/** Get tasks across all cached checklists. */
export function getAllCachedTasks(): CheckvistTask[] {
  const cache = queryClient.getQueryCache()
  const tasks: CheckvistTask[] = []
  for (const query of cache.getAll()) {
    const key = query.queryKey
    if (Array.isArray(key) && key[0] === 'tasks' && query.state.data) {
      tasks.push(...(query.state.data as CheckvistTask[]))
    }
  }
  return tasks
}
