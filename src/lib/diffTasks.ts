import type { CheckvistTask } from '@/api/types'

export interface TaskDiff {
  added: number
  completed: number
  removed: number
  changed: number
}

/**
 * Compare two raw task lists (e.g. before/after a manual refresh) and count what
 * changed. Used to show a counts-only summary toast after the user taps refresh.
 *
 * - added:     id present in next but not prev
 * - completed: id in both, status went open (0) → done, OR an open task disappeared
 *              from next because it was closed remotely
 * - removed:   id in prev but gone from next, not explained by completion
 * - changed:   id in both, still open, but content/due/priority differs
 *
 * Returns all-zero when prev is empty (cold first load → caller skips the toast).
 */
export function diffTaskLists(prev: CheckvistTask[], next: CheckvistTask[]): TaskDiff {
  const diff: TaskDiff = { added: 0, completed: 0, removed: 0, changed: 0 }
  if (prev.length === 0) return diff

  const prevById = new Map(prev.map((t) => [t.id, t]))
  const nextById = new Map(next.map((t) => [t.id, t]))

  for (const n of next) {
    if (!prevById.has(n.id)) diff.added++
  }

  for (const p of prev) {
    const n = nextById.get(p.id)
    const pOpen = p.status === 0
    if (!n) {
      // disappeared: treat an open task that vanished as completed/closed, else removed
      if (pOpen) diff.completed++
      else diff.removed++
      continue
    }
    const nOpen = n.status === 0
    if (pOpen && !nOpen) {
      diff.completed++
    } else if (pOpen && nOpen) {
      if (p.content !== n.content || p.due !== n.due || p.priority !== n.priority) {
        diff.changed++
      }
    }
  }

  return diff
}

/** Human summary like "3 added · 1 done · 2 changed", or "Up to date" when nothing changed. */
export function formatTaskDiff(d: TaskDiff): string {
  const parts: string[] = []
  if (d.added) parts.push(`${d.added} added`)
  if (d.completed) parts.push(`${d.completed} done`)
  if (d.removed) parts.push(`${d.removed} removed`)
  if (d.changed) parts.push(`${d.changed} changed`)
  return parts.length ? parts.join(' · ') : 'Up to date'
}
