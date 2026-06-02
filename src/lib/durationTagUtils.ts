/**
 * Utilities for managing duration tags
 */

import { isDurationTag } from '@/lib/durationParser'

/**
 * Update tags by replacing or adding a duration tag
 * @param tagsAsText - Current comma-separated tags
 * @param newDuration - New duration formatted string (e.g., "1h 30m") or null to remove
 * @returns Updated tags string
 */
export function updateDurationTag(tagsAsText: string | undefined | null, newDuration: string | null): string {
  if (!tagsAsText) {
    // No existing tags
    return newDuration ? newDuration : ''
  }

  const tags = tagsAsText.split(',').map((t) => t.trim())

  // Find and remove existing duration tag
  const nonDurationTags = tags.filter((tag) => !isDurationTag(tag))

  // Add new duration if provided
  if (newDuration) {
    nonDurationTags.push(newDuration)
  }

  return nonDurationTags.join(', ')
}
