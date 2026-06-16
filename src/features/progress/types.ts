export type ColorKey =
  | 'blue' | 'teal' | 'green' | 'lime' | 'yellow' | 'orange'
  | 'red' | 'pink' | 'purple' | 'navy'

export type DisplayField = 'name' | 'values' | 'percentage' | 'lastUpdated' | 'remaining'

export type ResetPeriod = 'never' | 'daily' | 'weekly' | 'monthly'

export type EntryMode = 'set' | 'increase' | 'decrease'

export interface TrackerAction {
  label: string
  delta: number
}

export interface TrackerMeta {
  targetValue: number
  initialValue: number
  unit: string | null
  category: string | null
  colorKey: ColorKey
  displayFields: DisplayField[]
  resets: ResetPeriod
  actions: TrackerAction[]
  notes: string
}

export interface Tracker {
  taskId: number
  checklistId: number
  name: string
  meta: TrackerMeta
  currentValue: number
  lastUpdatedAt: string | null
}

export interface TrackerEntryMeta {
  mode: EntryMode
  value: number
  note: string
}

export interface TrackerEntry {
  taskId: number
  trackerId: number
  meta: TrackerEntryMeta
  effectiveDate: string // ISO date string from task due or created_at
  createdAt: string
}
