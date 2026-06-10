import type { TrackerEntry } from '../types'
import type { ResetPeriod } from '../types'
import {
  startOfDay, startOfWeek, startOfMonth,
  isAfter, parseISO,
} from 'date-fns'

function getWindowStart(resets: ResetPeriod, now: Date): Date | null {
  if (resets === 'never') return null
  if (resets === 'daily') return startOfDay(now)
  if (resets === 'weekly') return startOfWeek(now, { weekStartsOn: 1 })
  if (resets === 'monthly') return startOfMonth(now)
  return null
}

export function computeCurrentValue(
  entries: TrackerEntry[],
  initialValue: number,
  resets: ResetPeriod,
): number {
  const sorted = [...entries].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
  )

  const windowStart = getWindowStart(resets, new Date())
  const filtered = windowStart
    ? sorted.filter(e => isAfter(parseISO(e.effectiveDate), windowStart))
    : sorted

  let value = initialValue
  for (const entry of filtered) {
    if (entry.meta.mode === 'set') value = entry.meta.value
    else if (entry.meta.mode === 'increase') value += entry.meta.value
    else if (entry.meta.mode === 'decrease') value -= entry.meta.value
  }
  return value
}

export interface TimeSeriesPoint {
  date: string
  value: number
}

export function buildTimeSeries(
  entries: TrackerEntry[],
  initialValue: number,
): TimeSeriesPoint[] {
  const sorted = [...entries].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
  )

  const points: TimeSeriesPoint[] = []
  let value = initialValue

  for (const entry of sorted) {
    if (entry.meta.mode === 'set') value = entry.meta.value
    else if (entry.meta.mode === 'increase') value += entry.meta.value
    else if (entry.meta.mode === 'decrease') value -= entry.meta.value
    points.push({ date: entry.effectiveDate, value })
  }

  return points
}
