/**
 * Task enrichment utilities
 * Adds computed properties like duration to tasks
 */

import type { CheckvistTask } from '@/api/types'
import { extractDurationFromTags } from './durationParser'

/**
 * Enrich a single task with computed properties
 * @param task - The task to enrich
 * @returns Task with computed properties populated
 */
export function enrichTask<T extends CheckvistTask>(task: T): T {
  return {
    ...task,
    duration: extractDurationFromTags(task.tags_as_text) ?? undefined,
    sub_tasks: task.sub_tasks?.map((subtask) => enrichTask(subtask)),
  }
}

/**
 * Enrich multiple tasks with computed properties
 * @param tasks - Array of tasks to enrich
 * @returns Tasks with computed properties populated
 */
export function enrichTasks(tasks: CheckvistTask[]): CheckvistTask[] {
  return tasks.map((task) => enrichTask(task))
}
