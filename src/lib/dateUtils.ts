import { format, parse, isToday, isTomorrow, isPast, formatDistanceToNow } from 'date-fns'

/**
 * Utility: Check if a Date object is valid.
 */
export function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime())
}

export const API_DATE_FORMAT = 'yyyy/MM/dd'
export const DISPLAY_DATE_FORMAT = 'MMM d'
export const FULL_DISPLAY_FORMAT = 'MMM d, yyyy'

/**
 * Parse a Checkvist API date string "YYYY/MM/DD" to a Date object.
 */
export function parseApiDate(due: string | null | undefined): Date | null {
  if (!due || typeof due !== 'string') return null
  try {
    const parsed = parse(due.slice(0, 10), API_DATE_FORMAT, new Date())
    return isValidDate(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Format a Date to the API format "YYYY/MM/DD".
 */
export function toApiDate(date: Date | null | undefined): string {
  if (!date || !isValidDate(date)) return ''
  try {
    return format(date, API_DATE_FORMAT)
  } catch {
    return ''
  }
}

/**
 * Return a human-friendly label for a due date.
 */
export function humanizeDueDate(due: string | null): string {
  if (!due) return 'No date'
  const date = parseApiDate(due)
  if (!date) return 'No date'
  try {
    if (isToday(date)) return 'Today'
    if (isTomorrow(date)) return 'Tomorrow'
    return format(date, DISPLAY_DATE_FORMAT)
  } catch {
    return 'No date'
  }
}

/**
 * Return color class for due date label.
 */
export function dueDateColorClass(due: string | null): string {
  if (!due) return 'text-gray-400'
  const date = parseApiDate(due)
  if (!date) return 'text-gray-400'
  try {
    if (isPast(date) && !isToday(date)) return 'text-red-600'
    if (isToday(date)) return 'text-orange-600'
    if (isTomorrow(date)) return 'text-yellow-600'
  } catch {
    return 'text-gray-400'
  }
  return 'text-blue-600'
}

/**
 * Format a full ISO date string to relative time (e.g. "3 hours ago").
 */
export function timeAgo(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    if (!isValidDate(date)) return ''
    return formatDistanceToNow(date, { addSuffix: true })
  } catch {
    return ''
  }
}

/**
 * Get upcoming Saturday date.
 */
export function getUpcomingSaturday(): Date {
  const today = new Date()
  if (!isValidDate(today)) return new Date(NaN)
  const day = today.getDay() // 0=Sun, 6=Sat
  const daysUntilSaturday = day === 6 ? 7 : 6 - day
  const saturday = new Date(today)
  saturday.setDate(today.getDate() + daysUntilSaturday)
  return saturday
}
