import { useState } from 'react'
import { View, Text, Pressable, ScrollView, Alert } from 'react-native'
import {
  addDays, addMonths, addYears,
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, parseISO, format,
} from 'date-fns'
import { useTrackerEntries, useUpdateTracker, useDeleteTracker } from './hooks/useTrackers'
import { useCreateEntry, useUpdateEntry } from './hooks/useEntries'
import { buildTimeSeries } from './lib/replayEngine'
import { computeProjectedCompletion } from './lib/projections'
import { COLOR_PAIRS } from './lib/trackerEncoding'
import { ProgressChart } from './ProgressChart'
import { AddEntrySheet } from './AddEntrySheet'
import { AddTrackerSheet } from './AddTrackerSheet'
import type { Tracker, TrackerEntry, TrackerMeta, EntryMode } from './types'

type TimeRange = 'Day' | 'Week' | 'Month' | 'Year' | 'All-Time'

interface Props {
  tracker: Tracker
  onBack: () => void
  onDeleted: () => void
}


function buildCumulativeMap(entries: TrackerEntry[], initialValue: number): Map<number, number> {
  const sorted = [...entries].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
  )
  const map = new Map<number, number>()
  let value = initialValue
  for (const entry of sorted) {
    if (entry.meta.mode === 'set') value = entry.meta.value
    else if (entry.meta.mode === 'increase') value += entry.meta.value
    else if (entry.meta.mode === 'decrease') value -= entry.meta.value
    map.set(entry.taskId, value)
  }
  return map
}

function periodLabel(range: TimeRange, d: Date): string {
  if (range === 'Day') return format(d, 'MMM d, yyyy')
  if (range === 'Week') {
    const s = startOfWeek(d, { weekStartsOn: 0 })
    const e = endOfWeek(d, { weekStartsOn: 0 })
    return `${format(s, 'MMM d')}–${format(e, 'd, yyyy')}`
  }
  if (range === 'Month') return `${format(startOfMonth(d), 'MMM d')}–${format(endOfMonth(d), 'd, yyyy')}`
  if (range === 'Year') return `${format(startOfYear(d), 'MMM d')}–${format(endOfYear(d), 'MMM d, yyyy')}`
  return 'All Time'
}

function advancePeriod(range: TimeRange, d: Date, dir: 1 | -1): Date {
  if (range === 'Day') return addDays(d, dir)
  if (range === 'Week') return addDays(d, dir * 7)
  if (range === 'Month') return addMonths(d, dir)
  if (range === 'Year') return addYears(d, dir)
  return d
}

function periodBounds(range: TimeRange, d: Date): { start: Date; end: Date } | null {
  if (range === 'All-Time') return null
  if (range === 'Day') return { start: startOfDay(d), end: endOfDay(d) }
  if (range === 'Week') return { start: startOfWeek(d, { weekStartsOn: 0 }), end: endOfWeek(d, { weekStartsOn: 0 }) }
  if (range === 'Month') return { start: startOfMonth(d), end: endOfMonth(d) }
  return { start: startOfYear(d), end: endOfYear(d) }
}

export function TrackerDetailView({ tracker, onBack, onDeleted }: Props) {
  const [range, setRange] = useState<TimeRange>('All-Time')
  const [periodDate, setPeriodDate] = useState(new Date())
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [editEntry, setEditEntry] = useState<TrackerEntry | null>(null)
  const [editing, setEditing] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(true)
  const [trendsExpanded, setTrendsExpanded] = useState(true)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [chartCardWidth, setChartCardWidth] = useState(0)

  const { data: entries = [], isLoading } = useTrackerEntries(tracker.taskId)
  const createEntry = useCreateEntry()
  const updateEntry = useUpdateEntry()
  const updateTracker = useUpdateTracker()
  const deleteTracker = useDeleteTracker()

  const { filled, background } = COLOR_PAIRS[tracker.meta.colorKey] ?? COLOR_PAIRS.blue

  const series = buildTimeSeries(entries, tracker.meta.initialValue)
  const cumulativeMap = buildCumulativeMap(entries, tracker.meta.initialValue)

  function filterSeriesByRange(pts: typeof series) {
    const bounds = periodBounds(range, periodDate)
    if (!bounds) return pts
    return pts.filter(p => {
      const d = parseISO(p.date)
      return d >= bounds.start && d <= bounds.end
    })
  }

  const chartData = filterSeriesByRange(series)
  const projected = computeProjectedCompletion(series, tracker.currentValue, tracker.meta.targetValue)

  const today = new Date()
  const isCurrentPeriod = range === 'All-Time' || (() => {
    const cur = periodBounds(range, periodDate)!
    const now = periodBounds(range, today)!
    return cur.start.getTime() === now.start.getTime()
  })()

  function handleRangeChange(r: TimeRange) {
    setRange(r)
    setPeriodDate(new Date())
  }

  async function handleSaveEntry(mode: EntryMode, value: number, note: string, date: Date) {
    if (editEntry) {
      await updateEntry.mutateAsync({ taskId: editEntry.taskId, trackerId: tracker.taskId, mode, value, note, date })
      setEditEntry(null)
    } else {
      await createEntry.mutateAsync({ trackerId: tracker.taskId, mode, value, note, date })
      setShowAddEntry(false)
    }
  }

  async function handleSaveTracker(name: string, meta: TrackerMeta) {
    await updateTracker.mutateAsync({ taskId: tracker.taskId, name, meta })
    setEditing(false)
  }

  async function handleDelete() {
    try {
      await deleteTracker.mutateAsync(tracker.taskId)
      onDeleted()
    } catch (e) {
      setConfirmingDelete(false)
      Alert.alert('Error', String(e))
    }
  }

  if (editing) {
    return (
      <View style={{ flex: 1 }}>
        <AddTrackerSheet initial={tracker} onSave={handleSaveTracker} onCancel={() => setEditing(false)} />
      </View>
    )
  }

  if (showAddEntry || editEntry) {
    return (
      <View style={{ flex: 1 }}>
        <AddEntrySheet
          currentValue={tracker.currentValue}
          initial={editEntry ?? undefined}
          onSave={handleSaveEntry}
          onCancel={() => { setShowAddEntry(false); setEditEntry(null) }}
        />
      </View>
    )
  }

  const pct = tracker.meta.targetValue > 0
    ? Math.min(100, (tracker.currentValue / tracker.meta.targetValue) * 100)
    : 0

  const chartWidth = chartCardWidth > 0 ? chartCardWidth - 32 : 0

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => setEditing(true)} hitSlop={8}>
            <Text style={{ color: '#FF3B30', fontSize: 15, fontWeight: '500' }}>Edit</Text>
          </Pressable>
          <Pressable onPress={() => setShowAddEntry(true)} hitSlop={8}>
            <Text style={{ color: '#FF3B30', fontSize: 22, fontWeight: '300' }}>+</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 17, fontWeight: '600', color: '#1C1C1E', flex: 1, textAlign: 'center' }} numberOfLines={1}>
          {tracker.name}
        </Text>
        {confirmingDelete ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => setConfirmingDelete(false)} hitSlop={8}>
              <Text style={{ color: '#8E8E93', fontSize: 14 }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleDelete} hitSlop={8} style={{ backgroundColor: '#FF3B30', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 }}>
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>Delete</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => setConfirmingDelete(true)} hitSlop={8}>
              <Text style={{ color: '#FF3B30', fontSize: 13 }}>Delete</Text>
            </Pressable>
            <Pressable onPress={onBack} hitSlop={8}>
              <Text style={{ color: '#FF3B30', fontSize: 15, fontWeight: '600' }}>Done</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Quick action buttons */}
      {tracker.meta.actions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F2F2F7' }}>
          {tracker.meta.actions.map((action, i) => (
            <Pressable
              key={i}
              onPress={() => createEntry.mutate({
                trackerId: tracker.taskId, mode: 'increase', value: action.delta, note: '', date: new Date(),
              })}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: filled }}
            >
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView style={{ flex: 1 }}>
        {/* Chart card */}
        <View
          style={{ margin: 16, backgroundColor: 'white', borderRadius: 16, overflow: 'hidden' }}
          onLayout={e => setChartCardWidth(e.nativeEvent.layout.width)}
        >
          {/* Range tabs */}
          <View style={{ flexDirection: 'row', padding: 4, backgroundColor: '#F2F2F7', margin: 8, borderRadius: 10 }}>
            {(['Day', 'Week', 'Month', 'Year', 'All-Time'] as TimeRange[]).map(r => (
              <Pressable
                key={r}
                onPress={() => handleRangeChange(r)}
                style={{
                  flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 8,
                  backgroundColor: range === r ? 'white' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: range === r ? '#1C1C1E' : '#8E8E93' }}>{r}</Text>
              </Pressable>
            ))}
          </View>

          {/* Period navigation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: 4, gap: 8 }}>
            {range !== 'All-Time' && (
              <Pressable onPress={() => setPeriodDate(d => advancePeriod(range, d, -1))} hitSlop={12}>
                <Text style={{ color: '#FF3B30', fontSize: 22, fontWeight: '400' }}>‹</Text>
              </Pressable>
            )}
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1C1C1E', flex: 1, textAlign: 'center' }}>
              {range === 'All-Time'
                ? series.length > 0
                  ? `${format(parseISO(series[0].date), 'MMM d')} – ${format(parseISO(series[series.length - 1].date), 'MMM d, yyyy')}`
                  : 'No data yet'
                : periodLabel(range, periodDate)}
            </Text>
            {range !== 'All-Time' && (
              <Pressable
                onPress={() => { if (!isCurrentPeriod) setPeriodDate(d => advancePeriod(range, d, 1)) }}
                hitSlop={12}
                style={{ opacity: isCurrentPeriod ? 0.25 : 1 }}
              >
                <Text style={{ color: '#FF3B30', fontSize: 22, fontWeight: '400' }}>›</Text>
              </Pressable>
            )}
          </View>

          {isLoading || chartWidth === 0 ? (
            <View style={{ height: 190, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#8E8E93', fontSize: 13 }}>{isLoading ? 'Loading…' : ''}</Text>
            </View>
          ) : (
            <ProgressChart
              data={chartData}
              targetValue={tracker.meta.targetValue}
              filledColor={filled}
              backgroundColor={background}
              width={chartWidth}
              height={190}
              range={range}
              periodDate={periodDate}
            />
          )}
        </View>

        {/* Progress summary bar */}
        <View style={{ marginHorizontal: 16, backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: background, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%` as `${number}%`, height: 8, borderRadius: 4, backgroundColor: filled }} />
          </View>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#1C1C1E' }}>
            {tracker.currentValue}{tracker.meta.unit ? ` ${tracker.meta.unit}` : ''} / {tracker.meta.targetValue}
          </Text>
          <Text style={{ fontSize: 13, color: '#8E8E93' }}>{pct.toFixed(1)}%</Text>
        </View>

        {/* Trends */}
        <View style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: 'white', borderRadius: 12, overflow: 'hidden' }}>
          <Pressable onPress={() => setTrendsExpanded(!trendsExpanded)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E' }}>Trends</Text>
            <Text style={{ color: '#FF3B30', fontSize: 18 }}>{trendsExpanded ? '▾' : '▸'}</Text>
          </Pressable>
          {trendsExpanded && (
            <View style={{ borderTopWidth: 1, borderTopColor: '#F2F2F7', paddingHorizontal: 16, paddingVertical: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, color: '#1C1C1E' }}>Projected Completion</Text>
                <Text style={{ fontSize: 15, color: '#8E8E93', fontWeight: '500' }}>{projected ?? '—'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* History */}
        <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 24, backgroundColor: 'white', borderRadius: 12, overflow: 'hidden' }}>
          <Pressable onPress={() => setHistoryExpanded(!historyExpanded)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E' }}>History</Text>
            <Text style={{ color: '#FF3B30', fontSize: 18 }}>{historyExpanded ? '▾' : '▸'}</Text>
          </Pressable>
          {historyExpanded && (
            <View style={{ borderTopWidth: 1, borderTopColor: '#F2F2F7' }}>
              {entries.length === 0 ? (
                <Text style={{ textAlign: 'center', padding: 24, color: '#8E8E93', fontSize: 14 }}>No entries yet</Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {[...entries].reverse().map((entry, idx) => {
                    const cumValue = cumulativeMap.get(entry.taskId) ?? entry.meta.value
                    return (
                      <Pressable
                        key={entry.taskId}
                        onPress={() => setEditEntry(entry)}
                        style={{ width: '50%', padding: 14, borderTopWidth: 1, borderTopColor: '#F2F2F7', borderRightWidth: idx % 2 === 0 ? 1 : 0, borderRightColor: '#F2F2F7' }}
                      >
                        <Text style={{ fontSize: 20, fontWeight: '600', color: '#1C1C1E' }}>
                          {cumValue}{tracker.meta.unit ? ` ${tracker.meta.unit}` : ''}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#8E8E93', marginTop: 1 }}>
                          {entry.meta.mode === 'set' ? 'set' :
                           entry.meta.mode === 'increase' ? `+${entry.meta.value}` :
                           `-${entry.meta.value}`}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }}>
                          {(() => {
                            try { return format(parseISO(entry.effectiveDate), 'MMM d, h:mm a') }
                            catch { return entry.effectiveDate }
                          })()}
                        </Text>
                        {entry.meta.note ? (
                          <Text style={{ fontSize: 11, color: '#C7C7CC', marginTop: 2 }} numberOfLines={1}>{entry.meta.note}</Text>
                        ) : null}
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
