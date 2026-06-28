/**
 * Deterministic taskId → color mapping, analogous to clientColor() in clientIdentity.ts.
 * Returns a stable color hex string for a given task ID across sessions.
 */

const TASK_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
  '#06B6D4', // cyan
]

export function taskColor(taskId?: number): string {
  if (!taskId) return TASK_COLORS[0]
  const idx = Math.abs(taskId) % TASK_COLORS.length
  return TASK_COLORS[idx]
}
