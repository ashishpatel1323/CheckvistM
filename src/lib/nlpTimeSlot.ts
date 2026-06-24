import * as chrono from 'chrono-node'

/**
 * Lightweight natural-language time detection for task titles.
 *
 * Checkvist stores only a due *date* (no time-of-day), so this is used purely to
 * pre-place tasks on the local time-blocking calendar. Returns a start time in
 * minutes-from-midnight, clamped into the calendar's visible window (04:00–22:00).
 *
 * Pure function, no side effects.
 */

/** Calendar visible window — keep in sync with CalendarScheduleView slotMin/Max. */
export const DAY_START_MINUTES = 4 * 60 // 04:00
export const DAY_END_MINUTES = 22 * 60 // 22:00

/** Fuzzy parts-of-day → start minute, used when chrono finds no explicit clock time. */
const FUZZY_KEYWORDS: { re: RegExp; minutes: number }[] = [
  { re: /\bafter\s*lunch\b/i, minutes: 13 * 60 },
  { re: /\b(early\s*morning)\b/i, minutes: 7 * 60 },
  { re: /\b(morning|breakfast|am)\b/i, minutes: 9 * 60 },
  { re: /\b(noon|midday)\b/i, minutes: 12 * 60 },
  { re: /\b(afternoon)\b/i, minutes: 14 * 60 },
  { re: /\b(evening|tonight|dinner)\b/i, minutes: 18 * 60 },
  { re: /\b(night|late)\b/i, minutes: 20 * 60 },
]

export interface TimeHint {
  startMinutes: number
  confidence: 'explicit' | 'fuzzy'
}

function clamp(minutes: number): number {
  return Math.max(DAY_START_MINUTES, Math.min(DAY_END_MINUTES - 30, minutes))
}

export function detectTimeHint(content: string): TimeHint | null {
  if (!content) return null

  // 1. Explicit clock times: "3pm", "15:00", "at noon", "call at 9".
  try {
    const results = chrono.parse(content, new Date(), { forwardDate: true })
    for (const r of results) {
      // Only treat as explicit when chrono is certain an hour was stated — a bare
      // date like "tomorrow" has hour defaulted, not stated.
      if (r.start.isCertain('hour')) {
        const hour = r.start.get('hour')
        const minute = r.start.get('minute') ?? 0
        if (hour != null) {
          return { startMinutes: clamp(hour * 60 + minute), confidence: 'explicit' }
        }
      }
    }
  } catch {
    // chrono failures are non-fatal — fall through to keyword matching.
  }

  // 2. Fuzzy parts-of-day.
  for (const { re, minutes } of FUZZY_KEYWORDS) {
    if (re.test(content)) return { startMinutes: clamp(minutes), confidence: 'fuzzy' }
  }

  return null
}
