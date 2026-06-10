import type { TimeSeriesPoint } from './replayEngine'
import { subDays, addDays, format, parseISO } from 'date-fns'

export function computeProjectedCompletion(
  series: TimeSeriesPoint[],
  currentValue: number,
  targetValue: number,
): string | null {
  if (currentValue >= targetValue) return 'Completed'
  if (series.length < 2) return null

  const now = new Date()
  const sevenDaysAgo = subDays(now, 7)
  const recent = series.filter(p => parseISO(p.date) >= sevenDaysAgo)

  if (recent.length < 2) return null

  const first = recent[0]
  const last = recent[recent.length - 1]
  const daysDiff = Math.max(
    1,
    (parseISO(last.date).getTime() - parseISO(first.date).getTime()) / 86400000
  )
  const velocityPerDay = (last.value - first.value) / daysDiff

  if (velocityPerDay <= 0) return null

  const daysLeft = (targetValue - currentValue) / velocityPerDay
  return format(addDays(now, daysLeft), 'MMM d, yyyy')
}

export function buildProjectionLine(
  series: TimeSeriesPoint[],
  initialValue: number,
  targetValue: number,
): TimeSeriesPoint[] {
  if (series.length === 0) return []
  const start = series[0]
  const end = series[series.length - 1]
  return [
    { date: start.date, value: initialValue },
    { date: end.date, value: targetValue },
  ]
}
