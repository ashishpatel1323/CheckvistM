import { isToday, isTomorrow, isPast, isThisWeek } from 'date-fns'
import type { TaskNode } from './taskTree'
import { parseApiDate } from './dateUtils'

export type DateGroup =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'thisWeek'
  | 'later'
  | 'noDueDate'

export const GROUP_LABELS: Record<DateGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This Week',
  later: 'Later',
  noDueDate: 'No Due Date',
}

export const GROUP_ORDER: DateGroup[] = [
  'overdue',
  'today',
  'tomorrow',
  'thisWeek',
  'later',
  'noDueDate',
]

export function classifyTask(task: TaskNode): DateGroup {
  if (!task.due) return 'noDueDate'
  const date = parseApiDate(task.due)
  if (!date) return 'noDueDate'
  if (isToday(date)) return 'today'
  if (isTomorrow(date)) return 'tomorrow'
  if (isPast(date)) return 'overdue'
  if (isThisWeek(date, { weekStartsOn: 1 })) return 'thisWeek'
  return 'later'
}

export interface GroupedTasks {
  group: DateGroup
  label: string
  tasks: TaskNode[]
}

/**
 * Buckets EVERY task by its own due date. Hierarchy is irrelevant here —
 * a child task with its own due date appears in its bucket at the top level,
 * and will appear again nested under its parent when the parent is expanded.
 */
export function groupTasksByDate(nodes: TaskNode[]): GroupedTasks[] {
  const buckets: Record<DateGroup, TaskNode[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
    noDueDate: [],
  }

  for (const task of nodes) {
    buckets[classifyTask(task)].push(task)
  }

  const sortByDue = (a: TaskNode, b: TaskNode) => {
    // Primary: due date ascending, null last
    if (!a.due && !b.due) {
      // fall through to priority
    } else if (!a.due) {
      return 1
    } else if (!b.due) {
      return -1
    } else {
      const dateCmp = a.due.localeCompare(b.due)
      if (dateCmp !== 0) return dateCmp
    }
    // Secondary: priority ascending — P1 first, 0 (unset) last
    const pa = a.priority > 0 ? a.priority : Infinity
    const pb = b.priority > 0 ? b.priority : Infinity
    if (pa !== pb) return pa - pb
    // Tertiary: manual position
    return a.position - b.position
  }

  const groups: GroupedTasks[] = []
  for (const groupKey of GROUP_ORDER) {
    const tasks = buckets[groupKey]
    if (tasks.length > 0) {
      tasks.sort(sortByDue)
      groups.push({
        group: groupKey,
        label: GROUP_LABELS[groupKey],
        tasks,
      })
    }
  }

  return groups
}
