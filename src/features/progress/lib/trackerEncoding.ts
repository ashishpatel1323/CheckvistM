import type { TrackerMeta, TrackerEntryMeta, ColorKey, DisplayField, ResetPeriod } from '../types'

// Encoding uses a sentinel suffix so Checkvist doesn't strip it.
// Format: "Tracker name [[TRACKER_META:{"targetValue":100,...}]]"
const TRACKER_META_RE = /\[\[TRACKER_META:(.*?)\]\]/s

const DEFAULT_META: TrackerMeta = {
  targetValue: 100,
  initialValue: 0,
  unit: null,
  category: null,
  colorKey: 'blue',
  displayFields: ['name', 'values', 'percentage'],
  resets: 'never',
  actions: [{ label: 'Add 1', delta: 1 }, { label: 'Add 5', delta: 5 }],
  notes: '',
}

export function encodeTrackerContent(name: string, meta: TrackerMeta): string {
  return `${name} [[TRACKER_META:${JSON.stringify(meta)}]]`
}

export function decodeTrackerContent(content: string): { name: string; meta: TrackerMeta } | null {
  const match = content.match(TRACKER_META_RE)
  if (!match) return null
  try {
    const meta = { ...DEFAULT_META, ...JSON.parse(match[1]) } as TrackerMeta
    const name = content.replace(TRACKER_META_RE, '').trim()
    return { name, meta }
  } catch {
    return null
  }
}

// Format: "[[ENTRY_META:{"mode":"increase","value":5,"note":""}]]"
const ENTRY_META_RE = /\[\[ENTRY_META:(.*?)\]\]/s

export function encodeEntryContent(meta: TrackerEntryMeta): string {
  return `[[ENTRY_META:${JSON.stringify(meta)}]]`
}

export function decodeEntryContent(content: string): TrackerEntryMeta | null {
  const match = content.match(ENTRY_META_RE)
  if (!match) return null
  try {
    return JSON.parse(match[1]) as TrackerEntryMeta
  } catch {
    return null
  }
}

export const COLOR_PAIRS: Record<ColorKey, { filled: string; background: string; text: string }> = {
  blue:   { filled: '#2B5BAD', background: '#B8CCE8', text: 'white' },
  teal:   { filled: '#1A8C8C', background: '#A8DEDE', text: 'white' },
  green:  { filled: '#2E7D32', background: '#A5D6A7', text: 'white' },
  lime:   { filled: '#558B2F', background: '#DCEDC8', text: 'white' },
  yellow: { filled: '#F9A825', background: '#FFF9C4', text: '#555' },
  orange: { filled: '#E65100', background: '#FFCCBC', text: 'white' },
  red:    { filled: '#C62828', background: '#FFCDD2', text: 'white' },
  pink:   { filled: '#AD1457', background: '#F8BBD9', text: 'white' },
  purple: { filled: '#6A1B9A', background: '#E1BEE7', text: 'white' },
  navy:   { filled: '#283593', background: '#C5CAE9', text: 'white' },
}

export const ALL_COLOR_KEYS = Object.keys(COLOR_PAIRS) as ColorKey[]

export const ALL_DISPLAY_FIELDS: { key: DisplayField; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'values', label: 'Values' },
  { key: 'percentage', label: 'Percentage' },
  { key: 'lastUpdated', label: 'Last Updated' },
  { key: 'remaining', label: 'Remaining Value' },
]

export const RESET_OPTIONS: { value: ResetPeriod; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
