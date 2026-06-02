/**
 * Tests for the duration parser library
 * Run with: pnpm test src/lib/durationParser.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  parseDurationTag,
  extractDurationFromTags,
  isDurationTag,
} from './durationParser'

describe('durationParser', () => {
  describe('parseDurationTag', () => {
    it('should parse "Xh Ym" format', () => {
      const result = parseDurationTag('1h 30m')
      expect(result).toEqual({
        minutes: 90,
        formatted: '1h 30m',
      })
    })

    it('should parse "Xh" format', () => {
      const result = parseDurationTag('2h')
      expect(result).toEqual({
        minutes: 120,
        formatted: '2h',
      })
    })

    it('should parse "Xm" format', () => {
      const result = parseDurationTag('30m')
      expect(result).toEqual({
        minutes: 30,
        formatted: '30m',
      })
    })

    it('should parse decimal hours "X.Xh" format', () => {
      const result = parseDurationTag('1.5h')
      expect(result).toEqual({
        minutes: 90,
        formatted: '1h 30m',
      })
    })

    it('should handle case-insensitive parsing', () => {
      const result = parseDurationTag('1H 30M')
      expect(result).toEqual({
        minutes: 90,
        formatted: '1h 30m',
      })
    })

    it('should handle whitespace variations', () => {
      const result = parseDurationTag('  45   min  ')
      expect(result).toEqual({
        minutes: 45,
        formatted: '45m',
      })
    })

    it('should return null for non-duration tags', () => {
      expect(parseDurationTag('bug')).toBeNull()
      expect(parseDurationTag('urgent')).toBeNull()
      expect(parseDurationTag('feature')).toBeNull()
    })
  })

  describe('extractDurationFromTags', () => {
    it('should extract duration from comma-separated tags', () => {
      const result = extractDurationFromTags('bug,1h,urgent')
      expect(result).toEqual({
        minutes: 60,
        formatted: '1h',
      })
    })

    it('should return first valid duration tag', () => {
      const result = extractDurationFromTags('bug,30m,1h,urgent')
      expect(result).toEqual({
        minutes: 30,
        formatted: '30m',
      })
    })

    it('should return null if no duration tags', () => {
      expect(extractDurationFromTags('bug,urgent,feature')).toBeNull()
    })

    it('should handle null/undefined input', () => {
      expect(extractDurationFromTags(null)).toBeNull()
      expect(extractDurationFromTags(undefined)).toBeNull()
      expect(extractDurationFromTags('')).toBeNull()
    })
  })

  describe('isDurationTag', () => {
    it('should return true for duration tags', () => {
      expect(isDurationTag('30m')).toBe(true)
      expect(isDurationTag('1h')).toBe(true)
      expect(isDurationTag('2h 30m')).toBe(true)
      expect(isDurationTag('1.5h')).toBe(true)
    })

    it('should return false for non-duration tags', () => {
      expect(isDurationTag('bug')).toBe(false)
      expect(isDurationTag('urgent')).toBe(false)
      expect(isDurationTag('feature')).toBe(false)
    })
  })
})
