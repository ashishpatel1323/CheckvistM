import type { EventInput } from '@fullcalendar/core'
import type { TaskNode } from './taskTree'
import type { TimeSlot } from '@/features/tasks/calendar/useTimeSlotStore'
import { stripMarkdown } from '@/components/InlineMarkdown'
import { detectTimeHint, DAY_START_MINUTES, DAY_END_MINUTES } from './nlpTimeSlot'
import { classifyTime, TIME_QUADRANTS } from '@/features/tasks/list/EisenhowerMatrixView'
import { toApiDate } from './dateUtils'

/** Where sequential auto-placement starts when a task has no time hint. */
const AUTO_FILL_START_MINUTES = 9 * 60 // 09:00
const MIN_DURATION = 5

export interface CalendarEventProps {
  taskId: number
  source: 'manual' | 'nlp'
}

function dateAt(day: Date, minutes: number): Date {
  const d = new Date(day)
  d.setHours(0, 0, 0, 0)
  d.setMinutes(minutes)
  return d
}

/** Block colors mirror the "By Time" tab buckets (classifyTime + TIME_QUADRANTS). */
function colorsForTask(task: TaskNode): { backgroundColor: string; borderColor: string } {
  const q = TIME_QUADRANTS.find((qd) => qd.bucket === classifyTime(task)) ?? TIME_QUADRANTS[0]
  return { backgroundColor: q.color, borderColor: q.border }
}

interface Interval {
  start: number
  end: number
}

/** Advance `start` past any overlapping interval, keeping the block inside the day window. */
function firstFreeStart(start: number, duration: number, taken: Interval[]): number {
  let s = Math.max(DAY_START_MINUTES, start)
  let moved = true
  while (moved) {
    moved = false
    for (const iv of taken) {
      if (s < iv.end && s + duration > iv.start) {
        s = iv.end
        moved = true
      }
    }
  }
  // Don't let a block start past the end of the visible day.
  return Math.min(s, DAY_END_MINUTES - duration)
}

/**
 * Builds FullCalendar events for the day from today's open tasks.
 *
 * - Stored slots (manual or previously-accepted NLP) are authoritative and placed first.
 * - Remaining tasks are auto-placed: at their detected time hint when present (source 'nlp'),
 *   otherwise stacked sequentially from 09:00. Auto blocks avoid overlapping existing ones.
 *
 * Duration = stored durationMinutes, else the task's Execute estimate.
 * Pure function — placement is derived, never written back here.
 */
export function tasksToCalendarEvents(
  tasks: TaskNode[],
  slots: Record<number, TimeSlot>,
  getEstimateMin: (task: TaskNode) => number,
  day: Date = new Date()
): EventInput[] {
  const events: EventInput[] = []
  const taken: Interval[] = []

  // 1. Stored slots first — fixed anchors.
  const stored: TaskNode[] = []
  const auto: TaskNode[] = []
  for (const t of tasks) {
    if (slots[t.id]) stored.push(t)
    else auto.push(t)
  }

  for (const t of stored) {
    const slot = slots[t.id]
    const duration = Math.max(MIN_DURATION, slot.durationMinutes)
    taken.push({ start: slot.startMinutes, end: slot.startMinutes + duration })
    events.push({
      id: String(t.id),
      title: stripMarkdown(t.content) || '(empty)',
      start: dateAt(day, slot.startMinutes),
      end: dateAt(day, slot.startMinutes + duration),
      ...colorsForTask(t),
      textColor: '#fff',
      extendedProps: { taskId: t.id, source: slot.source } as CalendarEventProps,
    })
  }

  // 2. Auto-placed: NLP hint first, else sequential cursor.
  let cursor = AUTO_FILL_START_MINUTES
  for (const t of auto) {
    const duration = Math.max(MIN_DURATION, getEstimateMin(t))
    const hint = detectTimeHint(t.content)
    const desired = hint ? hint.startMinutes : cursor
    const start = firstFreeStart(desired, duration, taken)
    taken.push({ start, end: start + duration })
    if (!hint) cursor = start + duration
    events.push({
      id: String(t.id),
      title: stripMarkdown(t.content) || '(empty)',
      start: dateAt(day, start),
      end: dateAt(day, start + duration),
      ...colorsForTask(t),
      textColor: '#fff',
      extendedProps: { taskId: t.id, source: hint ? 'nlp' : 'manual' } as CalendarEventProps,
    })
  }

  return events
}

/**
 * Calibrate: re-spread ALL today's tasks across the window [max(now, 04:00), 22:00].
 *
 * NLP-hinted tasks are anchored at/after their detected time; the rest pack sequentially.
 * When the total exceeds the window, the tail clamps near 22:00 → minimal overlap (compress).
 * Returns a full slot map to write into the local store. Pure — caller persists it.
 * No due-date change: every task is already due today, so only the local time-of-day moves.
 */
export function calibrateSlots(
  tasks: TaskNode[],
  nowMinutes: number,
  getEstimateMin: (task: TaskNode) => number,
  day: Date = new Date()
): Record<number, TimeSlot> {
  const dateStr = toApiDate(day)
  const winStart = Math.max(DAY_START_MINUTES, Math.min(nowMinutes, DAY_END_MINUTES - MIN_DURATION))
  const winEnd = DAY_END_MINUTES

  // Order by desired start: hinted at their time, others at window start (stable by index).
  const items = tasks.map((t, index) => {
    const hint = detectTimeHint(t.content)
    return {
      task: t,
      index,
      duration: Math.max(MIN_DURATION, getEstimateMin(t)),
      hint,
      sortKey: hint ? hint.startMinutes : winStart,
    }
  })
  items.sort((a, b) => a.sortKey - b.sortKey || a.index - b.index)

  // Spread to fill the window: when total work is less than the window, insert an even gap
  // between blocks so the last one ends near 22:00. When work overflows, gap=0 and the tail
  // clamps near the end → minimal overlap.
  const W = winEnd - winStart
  const T = items.reduce((sum, it) => sum + it.duration, 0)
  const gap = T < W ? (W - T) / Math.max(1, items.length - 1) : 0

  const result: Record<number, TimeSlot> = {}
  let cursor = winStart
  for (const it of items) {
    const desired = it.hint ? Math.max(cursor, it.hint.startMinutes) : cursor
    const start = Math.round(Math.max(winStart, Math.min(desired, winEnd - it.duration)))
    result[it.task.id] = {
      date: dateStr,
      startMinutes: start,
      durationMinutes: it.duration,
      source: it.hint ? 'nlp' : 'manual',
    }
    cursor = start + it.duration + gap
  }
  return result
}
