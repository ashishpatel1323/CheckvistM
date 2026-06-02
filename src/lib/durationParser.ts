/**
 * Duration parser library for parsing time estimates from task tags
 * Supports common time notations like: 30m, 1h, 2h30m, 1.5h, etc.
 */

export interface DurationResult {
  minutes: number
  formatted: string // Human-readable format like "30m" or "1h 30m"
}

/**
 * Regex patterns for different duration formats
 */
const DURATION_PATTERNS = [
  // Match: Xh Ym (e.g., "1h 30m", "2h 15m")
  /^(\d+)\s*h\s*(?:and\s+)?(\d+)\s*m(?:in)?s?$/i,
  // Match: Xh (e.g., "1h", "2h")
  /^(\d+)\s*h(?:ours?)?$/i,
  // Match: Xm (e.g., "30m", "45min")
  /^(\d+)\s*m(?:in)?s?$/i,
  // Match: X.Xh (e.g., "1.5h", "2.75h")
  /^(\d+(?:\.\d+)?)\s*h(?:ours?)?$/i,
]

/**
 * Parse a single tag string to extract duration
 * @param tag - The tag string to parse (e.g., "30m", "1h", "2h30m")
 * @returns DurationResult if valid duration tag, null otherwise
 */
export function parseDurationTag(tag: string): DurationResult | null {
  const trimmed = tag.trim().toLowerCase()

  // Try each pattern
  for (let i = 0; i < DURATION_PATTERNS.length; i++) {
    const pattern = DURATION_PATTERNS[i]
    const match = trimmed.match(pattern)

    if (match) {
      let minutes = 0

      if (i === 0) {
        // "Xh Ym" format
        const hours = parseInt(match[1], 10)
        const mins = parseInt(match[2], 10)
        minutes = hours * 60 + mins
      } else if (i === 1) {
        // "Xh" format
        const hours = parseInt(match[1], 10)
        minutes = hours * 60
      } else if (i === 2) {
        // "Xm" format
        minutes = parseInt(match[1], 10)
      } else if (i === 3) {
        // "X.Xh" format (decimal hours)
        const hours = parseFloat(match[1])
        minutes = Math.round(hours * 60)
      }

      return {
        minutes,
        formatted: formatDuration(minutes),
      }
    }
  }

  return null
}

/**
 * Extract duration from all tags in a comma-separated tag string
 * Returns the first valid duration tag found, or null if none
 * @param tagsAsText - Comma-separated tags (e.g., "bug,1h,urgent")
 * @returns DurationResult if a duration tag is found, null otherwise
 */
export function extractDurationFromTags(tagsAsText: string | null | undefined): DurationResult | null {
  if (!tagsAsText) return null

  const tags = tagsAsText.split(',')

  for (const tag of tags) {
    const duration = parseDurationTag(tag)
    if (duration) {
      return duration
    }
  }

  return null
}

/**
 * Format minutes into a human-readable duration string
 * @param minutes - Total minutes to format
 * @returns Formatted string like "30m" or "1h 30m"
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (mins === 0) {
    return `${hours}h`
  }

  return `${hours}h ${mins}m`
}

/**
 * Check if a tag looks like a duration tag (for UI purposes)
 * @param tag - The tag to check
 * @returns true if the tag appears to be a duration
 */
export function isDurationTag(tag: string): boolean {
  return parseDurationTag(tag) !== null
}
