import { useState, useEffect, useRef, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, Modal, useWindowDimensions, Platform } from 'react-native'
import { useExecuteLog, summarizeDaySessions, collectDayBlocks, hasTimeOverlap, type ExecuteLogEntry } from './useExecuteLog'
import { useSystemLog } from './useSystemLog'
import { clientColor } from '@/platform/clientIdentity'
import { format, parseISO, addDays, subDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, isToday } from 'date-fns'
import { Cloud, ChevronLeft, ChevronRight, Calendar, CalendarDays, List, Trash2 } from 'lucide-react-native'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_H   = 64           // px per hour
const MIN_H    = HOUR_H / 60  // px per minute
const MIN_TILE_H = 22         // minimum visible tile height in px
const MIN_TILE_MIN = MIN_TILE_H / MIN_H // minimum visible duration in minutes
const LABEL_W  = 56           // left hour-label column
const PAD_R    = 12           // right padding

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogBlock {
  key: string
  taskId: number
  startMin: number
  durationMin: number
  entry: ExecuteLogEntry
  taskName?: string
  clientId?: string
  clientLabel?: string
}

const UNKNOWN_CLIENT = '__unknown__'

// A cluster groups overlapping blocks into columns for side-by-side rendering
interface ClusterLayout {
  startMin: number
  endMin: number
  columns: LogBlock[][]  // each sub-array is one column of non-overlapping blocks
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesFromMidnight(iso: string): number {
  const d = parseISO(iso)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

function fmtHour(h: number): string {
  if (h === 0)  return '12 AM'
  if (h < 12)   return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function fmtMinTime(m: number): string {
  const h   = Math.floor(m / 60) % 24
  const min = Math.round(m % 60)
  const ap  = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(min).padStart(2, '0')} ${ap}`
}

function fmtDur(min: number): string {
  const totalSec = Math.floor(min * 60)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const bStart = (b: LogBlock) => b.startMin
const bDur   = (b: LogBlock) => b.durationMin
const bEnd   = (b: LogBlock) => bStart(b) + bDur(b)
const bVisualDur = (b: LogBlock) => Math.max(bDur(b), MIN_TILE_MIN)
const bVisualEnd = (b: LogBlock) => bStart(b) + bVisualDur(b)

/** True if two blocks genuinely overlap (rounded to minutes, >1 min overlap) */
function overlaps(a: LogBlock, b: LogBlock): boolean {
  const aS = Math.round(bStart(a)), aE = Math.round(bVisualEnd(a))
  const bS = Math.round(bStart(b)), bE = Math.round(bVisualEnd(b))
  return Math.min(aE, bE) - Math.max(aS, bS) > 0
}

/**
 * Google Calendar layout algorithm — returns clusters with column-grouped blocks.
 * Each cluster is rendered as a flex row; columns share width equally.
 */
function layoutBlocks(blocks: LogBlock[]): ClusterLayout[] {
  if (!blocks.length) return []
  const sorted = [...blocks].sort((a, b) => bStart(a) - bStart(b))

  // 1. Build clusters with a sweep-line so transitive overlaps stay in one cluster.
  const rawClusters: LogBlock[][] = []
  let current: LogBlock[] = []
  let currentEnd = -Infinity

  for (const block of sorted) {
    const s = bStart(block)
    const e = bVisualEnd(block)

    if (!current.length || s < currentEnd) {
      current.push(block)
      currentEnd = Math.max(currentEnd, e)
      continue
    }

    rawClusters.push(current)
    current = [block]
    currentEnd = e
  }
  if (current.length) rawClusters.push(current)

  // 2. Assign columns within each cluster
  return rawClusters.map(cluster => {
    const colEnds: number[] = []
    const columns: LogBlock[][] = []
    for (const block of [...cluster].sort((a, b) => bStart(a) - bStart(b))) {
      const s = Math.round(bStart(block))
      let col = colEnds.findIndex(e => e <= s)
      if (col === -1) { col = colEnds.length; colEnds.push(0); columns.push([]) }
      colEnds[col] = Math.round(bVisualEnd(block))
      columns[col].push(block)
    }
    return {
      startMin: Math.min(...cluster.map(bStart)),
      endMin:   Math.max(...cluster.map(bVisualEnd)),
      columns,
    }
  })
}

// ─── Block tile ───────────────────────────────────────────────────────────────

function BlockTile({ block, onPress, taskName, height }: {
  block: LogBlock; onPress: () => void; taskName: string; height: number
}) {
  const dur     = bDur(block)
  const isShort = height < 38

  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height,
        backgroundColor: '#EEF2FF',
        borderLeftWidth: 3,
        borderLeftColor: '#4772FA',
        borderRadius: 5,
        paddingHorizontal: 6,
        paddingVertical: 3,
        overflow: 'hidden',
        flexDirection: isShort ? 'row' : 'column',
        alignItems: isShort ? 'center' : 'flex-start',
        gap: isShort ? 4 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: isShort ? 1 : undefined }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: clientColor(block.clientId) }} />
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#1e3a8a', flex: 1 }}>
          {taskName}
        </Text>
      </View>
      {!isShort && (
        <Text style={{ fontSize: 10, color: '#6B7280' }}>
          {fmtMinTime(bStart(block))} – {fmtMinTime(bEnd(block))} · {fmtDur(dur)}
        </Text>
      )}
      {!isShort && block.clientLabel && (
        <Text numberOfLines={1} style={{ fontSize: 9, color: '#9CA3AF' }}>{block.clientLabel}</Text>
      )}
      {isShort && <Text style={{ fontSize: 10, color: '#6B7280' }}>{fmtDur(dur)}</Text>}
    </Pressable>
  )
}

// ─── Add Entry modal ──────────────────────────────────────────────────────────

const DURATION_OPTIONS = [5, 10, 30, 45, 60]

function AddEntryModal({ startMinutes, onSave, onClose }: {
  startMinutes: number
  onSave: (name: string, startMin: number, durationMin: number) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [sh, setSh] = useState(String(Math.floor(startMinutes / 60) % 24))
  const [sm, setSm] = useState(String(Math.round(startMinutes % 60)).padStart(2, '0'))
  const [dur, setDur] = useState('30')
  const parsedStart = Number(sh) * 60 + Number(sm)
  const parsedDur = Number(dur)
  const valid = name.trim().length > 0 && !isNaN(parsedStart) && !isNaN(parsedDur) && parsedDur > 0

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={{ width: 300, backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>Add time entry</Text>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Name</Text>
            <TextInput
              value={name} onChangeText={setName}
              placeholder="What did you work on?"
              placeholderTextColor="#C4C4C4"
              autoFocus
              style={{ height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, fontSize: 14 }}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Start time</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput value={sh} onChangeText={setSh} keyboardType="number-pad" maxLength={2} style={{ width: 48, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' }} />
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#374151' }}>:</Text>
              <TextInput value={sm} onChangeText={setSm} keyboardType="number-pad" maxLength={2} style={{ width: 48, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' }} />
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Duration</Text>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {DURATION_OPTIONS.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDur(String(d))}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
                    backgroundColor: dur === String(d) ? '#4772FA' : '#F3F4F6',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: dur === String(d) ? '#fff' : '#374151' }}>
                    {d < 60 ? `${d}m` : `${d / 60}h`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onClose} style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => { if (valid) onSave(name.trim(), parsedStart, parsedDur) }} style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: valid ? '#4772FA' : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: valid ? 'white' : '#9CA3AF', fontWeight: '700' }}>Add</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({ block, taskName, onSave, onClose }: {
  block: LogBlock; taskName: string
  onSave: (s: number, d: number) => void; onClose: () => void
}) {
  const { sessionLog } = useExecuteLog()
  const { deleteSession } = useSystemLog()
  const [sh, setSh] = useState(String(Math.floor(bStart(block) / 60) % 24))
  const [sm, setSm] = useState(String(Math.round(bStart(block) % 60)).padStart(2, '0'))
  const [dur, setDur] = useState(String(Math.round(bDur(block))))
  const [isDeleting, setIsDeleting] = useState(false)
  const parsedStart = Number(sh) * 60 + Number(sm)
  const parsedDur   = Number(dur)
  const valid = !isNaN(parsedStart) && !isNaN(parsedDur) && parsedDur > 0

  // Check for overlaps with other blocks for the same task on this day
  const parts = block.key.split(':')
  const checklistId = Number(parts[0])
  const dateStr = parts[1]
  const taskId = Number(parts[2])
  const overlapDetected = valid && hasTimeOverlap(sessionLog, checklistId, taskId, dateStr, parsedStart, parsedDur, block.key)
  const canSave = valid && !overlapDetected

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteSession(block.key)
      onClose()
    } catch (e) {
      console.error('Failed to delete session:', e)
      setIsDeleting(false)
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={{ width: 300, backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 }}>
          <View><Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>Edit session</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }} numberOfLines={1}>{taskName}</Text></View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Start time</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput value={sh} onChangeText={setSh} keyboardType="number-pad" maxLength={2} style={{ width: 48, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' }} />
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#374151' }}>:</Text>
              <TextInput value={sm} onChangeText={setSm} keyboardType="number-pad" maxLength={2} style={{ width: 48, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' }} />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Duration (minutes)</Text>
            <TextInput value={dur} onChangeText={setDur} keyboardType="number-pad" style={{ height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, fontSize: 16, fontWeight: '600' }} />
          </View>
          {overlapDetected && (
            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 3, borderLeftColor: '#DC2626' }}>
              <Text style={{ fontSize: 12, color: '#991B1B', fontWeight: '600' }}>
                ⚠️ This time overlaps with another session. Adjust the time or duration to avoid overlap.
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onClose} disabled={isDeleting} style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', opacity: isDeleting ? 0.5 : 1 }}>
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleDelete} disabled={isDeleting} style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: isDeleting ? '#FECACA' : '#EF4444', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: 'white', fontWeight: '700' }}>{isDeleting ? 'Deleting...' : 'Delete'}</Text>
            </Pressable>
            <Pressable onPress={() => { if (canSave) { onSave(parsedStart, parsedDur); onClose() } }} disabled={isDeleting} style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: canSave && !isDeleting ? '#4772FA' : '#E5E7EB', alignItems: 'center', justifyContent: 'center', opacity: isDeleting ? 0.5 : 1 }}>
              <Text style={{ fontSize: 14, color: canSave && !isDeleting ? 'white' : '#9CA3AF', fontWeight: '700' }}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

// ─── Calendar picker modal ────────────────────────────────────────────────────

function CalendarPicker({ selected, onSelect, onClose }: {
  selected: Date; onSelect: (d: Date) => void; onClose: () => void
}) {
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startDow = (startOfMonth(month).getDay() + 6) % 7 // Mon=0
  const today = new Date()

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={{ width: 320, backgroundColor: 'white', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 }}>
          {/* Month nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Pressable onPress={() => setMonth(m => subDays(startOfMonth(m), 1))} style={{ padding: 6 }}>
              <ChevronLeft size={18} color="#374151" />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111827' }}>
              {format(month, 'MMMM yyyy')}
            </Text>
            <Pressable onPress={() => setMonth(m => addDays(endOfMonth(m), 1))} style={{ padding: 6 }}>
              <ChevronRight size={18} color="#374151" />
            </Pressable>
          </View>
          {/* Day-of-week headers */}
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            {['M','T','W','T','F','S','S'].map((d, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#9CA3AF', fontWeight: '600' }}>{d}</Text>
            ))}
          </View>
          {/* Days grid */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: startDow }).map((_, i) => (
              <View key={`empty-${i}`} style={{ width: `${100/7}%` as any }} />
            ))}
            {days.map(day => {
              const isSel = isSameDay(day, selected)
              const isTod = isToday(day)
              const inMon = isSameMonth(day, month)
              return (
                <Pressable
                  key={day.toISOString()}
                  onPress={() => { onSelect(day); onClose() }}
                  style={{ width: `${100/7}%` as any, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isSel ? '#4772FA' : isTod ? '#EEF2FF' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: isSel || isTod ? '700' : '400', color: isSel ? 'white' : inMon ? '#111827' : '#D1D5DB' }}>{format(day, 'd')}</Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
          {/* Today button */}
          <Pressable onPress={() => { onSelect(new Date()); onClose() }} style={{ marginTop: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#4772FA' }}>Today</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Agenda list view ─────────────────────────────────────────────────────────

const IS_WEB = Platform.OS === 'web'

// Inline two-step delete: trash icon → Confirm/✕. Stops propagation so the row's
// edit-press never fires when interacting with the delete affordance.
function RowDeleteButton({ onDelete, compact }: { onDelete: () => Promise<void> | void; compact?: boolean }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleDelete = async () => {
    setBusy(true)
    try { await onDelete() }
    catch (e) { console.error('Failed to delete session:', e); setBusy(false); setArmed(false) }
  }

  if (armed) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); if (!busy) handleDelete() }}
          disabled={busy}
          style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: busy ? '#FECACA' : '#EF4444' }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: 'white' }}>{busy ? '…' : 'Confirm'}</Text>
        </Pressable>
        <Pressable
          onPress={(e) => { e.stopPropagation(); setArmed(false) }}
          disabled={busy}
          style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: '#F3F4F6' }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B7280' }}>✕</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Pressable
      onPress={(e) => { e.stopPropagation(); setArmed(true) }}
      hitSlop={6}
      style={{ padding: compact ? 4 : 6, borderRadius: 6, flexShrink: 0 }}
    >
      <Trash2 size={compact ? 14 : 16} color="#9CA3AF" />
    </Pressable>
  )
}

function AgendaList({ blocks, taskNames, onPressBlock, onDeleteBlock }: {
  blocks: LogBlock[]; taskNames: Record<number, string>
  onPressBlock: (b: LogBlock) => void; onDeleteBlock: (b: LogBlock) => Promise<void> | void
}) {
  const sorted = [...blocks].sort((a, b) => bStart(a) - bStart(b))
  const name = (b: LogBlock) => taskNames[b.taskId] ?? b.taskName ?? `Task ${b.taskId}`

  if (sorted.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64 }}>
        <Text style={{ fontSize: 13, color: '#9CA3AF' }}>No sessions recorded for this day.</Text>
      </View>
    )
  }

  // Web: compact rows (less height) since the list can get long. No client label here — the
  // name gets the space and wraps to two lines so it's always readable.
  if (IS_WEB) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 4 }} showsVerticalScrollIndicator={false}>
        {sorted.map(block => (
          <Pressable
            key={block.key}
            onPress={() => onPressBlock(block)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: 'white', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
              borderLeftWidth: 3, borderLeftColor: clientColor(block.clientId),
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151', flexShrink: 0 }} numberOfLines={1}>
              {fmtMinTime(bStart(block))} – {fmtMinTime(bEnd(block))}
            </Text>
            <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', color: '#1e3a8a' }}>
              {name(block)}
            </Text>
            <Text style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>{fmtDur(bDur(block))}</Text>
            <RowDeleteButton compact onDelete={() => onDeleteBlock(block)} />
          </Pressable>
        ))}
      </ScrollView>
    )
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }} showsVerticalScrollIndicator={false}>
      {sorted.map(block => (
        <Pressable
          key={block.key}
          onPress={() => onPressBlock(block)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: 'white', borderRadius: 10, padding: 12,
            borderLeftWidth: 3, borderLeftColor: '#4772FA',
            shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
          }}
        >
          <View style={{ width: 64 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{fmtMinTime(bStart(block))}</Text>
            <Text style={{ fontSize: 10, color: '#9CA3AF' }}>{fmtMinTime(bEnd(block))}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a' }}>
              {name(block)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, color: '#6B7280' }}>{fmtDur(bDur(block))}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: clientColor(block.clientId) }} />
                <Text numberOfLines={1} style={{ fontSize: 11, color: '#9CA3AF' }}>{block.clientLabel ?? 'Unknown'}</Text>
              </View>
            </View>
          </View>
          <RowDeleteButton onDelete={() => onDeleteBlock(block)} />
        </Pressable>
      ))}
    </ScrollView>
  )
}

export function ExecutionLogView({ checklistId, taskNames, initialViewMode }: { checklistId: number; taskNames: Record<number, string>; initialViewMode?: 'calendar' | 'agenda' }) {
  const { sessionLog, currentSessionKey, timerStartedAt, updateSessionTimes } = useExecuteLog()
  const { remoteSessions, fetchTodaySessions, systemListId, addManualSession, deleteSession } = useSystemLog()
  const [now, setNow]           = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [showCalendar, setShowCalendar] = useState(false)
  const [viewMode, setViewMode] = useState<'calendar' | 'agenda'>(initialViewMode ?? 'agenda')
  const scrollRef               = useRef<ScrollView>(null)
  const [editingBlock, setEditingBlock] = useState<LogBlock | null>(null)
  const [addingAt, setAddingAt] = useState<number | null>(null) // minutes from midnight
  const [clientFilter, setClientFilter] = useState<string | null>(null) // clientId or UNKNOWN_CLIENT
  const [taskFilter, setTaskFilter] = useState<number | null>(null) // taskId
  const [syncing, setSyncing]   = useState(false)
  const [, tick]                = useState(0)

  // Use window width synchronously — avoids onLayout timing issues
  const { width: screenWidth }  = useWindowDimensions()
  const timelineWidth = screenWidth - LABEL_W - PAD_R

  useEffect(() => {
    const id = setInterval(() => { setNow(new Date()); tick(n => n + 1) }, 10_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const h = new Date().getHours()
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, h - 1) * HOUR_H, animated: true }), 300)
  }, [])

  useEffect(() => {
    setSyncing(true)
    fetchTodaySessions().finally(() => setSyncing(false))
  }, [fetchTodaySessions])

  const nowMin   = now.getHours() * 60 + now.getMinutes()
  const todayStr = format(now, 'yyyy-MM-dd')
  const selectedStr = format(selectedDate, 'yyyy-MM-dd')
  const isViewingToday = selectedStr === todayStr

  // One block per play→pause session — sessionLog ∪ remoteSessions deduped by exact key.
  const allBlocks = useMemo<LogBlock[]>(() =>
    collectDayBlocks(selectedStr, sessionLog, remoteSessions, currentSessionKey, timerStartedAt).map((b) => ({
      key: b.key,
      taskId: b.taskId,
      startMin: minutesFromMidnight(b.startedAt),
      durationMin: Math.max(1, b.actualSeconds / 60),
      entry: { taskId: b.taskId, estimateMin: 0, startedAt: b.startedAt, actualSeconds: b.actualSeconds, completedAt: b.completedAt },
      taskName: b.taskName,
      clientId: b.clientId,
      clientLabel: b.clientLabel,
    })),
    [sessionLog, remoteSessions, selectedStr, currentSessionKey, timerStartedAt])

  // Resolve a block's display name: explicit task name prop → carried session name → fallback.
  const blockName = (b: LogBlock) => taskNames[b.taskId] ?? b.taskName ?? `Task ${b.taskId}`

  // Distinct clients present on the selected day, for the legend/filter strip.
  const clients = useMemo(() => {
    const map = new Map<string, { id: string; label: string; color: string; count: number }>()
    for (const b of allBlocks) {
      const id = b.clientId ?? UNKNOWN_CLIENT
      const existing = map.get(id)
      if (existing) { existing.count++; continue }
      map.set(id, { id, label: b.clientLabel ?? 'Unknown', color: clientColor(b.clientId), count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [allBlocks])

  // Distinct tasks worked on the selected day, for the task filter strip.
  const taskGroups = useMemo(() => {
    const map = new Map<number, { id: number; label: string; count: number }>()
    for (const b of allBlocks) {
      const existing = map.get(b.taskId)
      if (existing) { existing.count++; continue }
      map.set(b.taskId, { id: b.taskId, label: blockName(b), count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [allBlocks, taskNames])

  // Clear an active filter once that client/task has no sessions on the newly-selected day.
  useEffect(() => {
    if (clientFilter && !clients.some(c => c.id === clientFilter)) setClientFilter(null)
  }, [clients, clientFilter])
  useEffect(() => {
    if (taskFilter != null && !taskGroups.some(t => t.id === taskFilter)) setTaskFilter(null)
  }, [taskGroups, taskFilter])

  const visibleBlocks = useMemo(
    () => allBlocks.filter(b =>
      (!clientFilter || (b.clientId ?? UNKNOWN_CLIENT) === clientFilter) &&
      (taskFilter == null || b.taskId === taskFilter)
    ),
    [allBlocks, clientFilter, taskFilter],
  )

  // Build per-day summary for the 7-day strip (±3 days around selected)
  const dayStrip = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(selectedDate, i - 3)
      const ds = format(day, 'yyyy-MM-dd')
      const { sessionCount, sessionTotalSeconds } = summarizeDaySessions(ds, sessionLog, remoteSessions, currentSessionKey, timerStartedAt)
      return { day, ds, count: sessionCount, totalMin: sessionTotalSeconds / 60, isSelected: i === 3 }
    })
  }, [selectedDate, sessionLog, remoteSessions, currentSessionKey, timerStartedAt])

  const clusters = useMemo(() => layoutBlocks(visibleBlocks), [visibleBlocks])
  const totalDur = visibleBlocks.reduce((s, b) => s + bDur(b), 0)


  // Build gap segments for each past hour (only when viewing today)
  const gapSegments = useMemo(() => {
    if (!isViewingToday) return []
    const segs: { startMin: number; endMin: number }[] = []
    for (let h = 0; h < 24; h++) {
      const slotStart = h * 60
      const slotEnd   = slotStart + 60
      if (slotEnd > nowMin) break

      // Find covered intervals in this slot
      const covered: [number, number][] = visibleBlocks
        .map(b => [Math.max(slotStart, bStart(b)), Math.min(slotEnd, bEnd(b))] as [number, number])
        .filter(([s, e]) => e > s)
        .sort((a, b) => a[0] - b[0])

      let cursor = slotStart
      for (const [s, e] of covered) {
        if (s > cursor + 1) segs.push({ startMin: cursor, endMin: s })
        cursor = Math.max(cursor, e)
      }
      const cap = Math.min(slotEnd, nowMin)
      if (cursor < cap - 1) segs.push({ startMin: cursor, endMin: cap })
    }
    return segs
  }, [visibleBlocks, nowMin, isViewingToday])

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      {/* Header */}
      <View style={{ backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#EFEFEF', flexDirection: 'row', alignItems: 'center' }}>
        {/* Prev day */}
        <Pressable onPress={() => setSelectedDate(d => subDays(d, 1))} style={{ padding: 4, marginRight: 2 }}>
          <ChevronLeft size={16} color="#374151" />
        </Pressable>
        {/* Date label + calendar icon */}
        <Pressable onPress={() => setShowCalendar(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Execution Log</Text>
            <Text style={{ fontSize: 11, color: '#6B7280' }}>{format(selectedDate, 'EEEE, MMMM d')}</Text>
          </View>
          <Calendar size={12} color="#9CA3AF" />
        </Pressable>
        {/* Next day */}
        <Pressable onPress={() => setSelectedDate(d => addDays(d, 1))} style={{ padding: 4, marginLeft: 2 }}>
          <ChevronRight size={16} color="#374151" />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Calendar / Agenda toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 8, padding: 2 }}>
            <Pressable
              onPress={() => setViewMode('calendar')}
              style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: viewMode === 'calendar' ? 'white' : 'transparent' }}
            >
              <CalendarDays size={13} color={viewMode === 'calendar' ? '#4772FA' : '#9CA3AF'} />
            </Pressable>
            <Pressable
              onPress={() => setViewMode('agenda')}
              style={{ paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, backgroundColor: viewMode === 'agenda' ? 'white' : 'transparent' }}
            >
              <List size={13} color={viewMode === 'agenda' ? '#4772FA' : '#9CA3AF'} />
            </Pressable>
          </View>
          <Cloud size={13} color={syncing ? '#9CA3AF' : systemListId ? '#4772FA' : '#D1D5DB'} />
          {visibleBlocks.length > 0 && (
            <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#4772FA' }}>
                {visibleBlocks.length} · {fmtDur(totalDur)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 5-day strip */}
      <View style={{ backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#EFEFEF', flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8 }}>
        {dayStrip.map(({ day, ds, count, totalMin, isSelected }) => (
          <Pressable
            key={ds}
            onPress={() => setSelectedDate(day)}
            style={{ flex: 1, alignItems: 'center', gap: 2 }}
          >
            <Text style={{ fontSize: 9, color: isSelected ? '#4772FA' : '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' }}>
              {isToday(day) ? 'Today' : format(day, 'EEE')}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#4772FA' : '#374151' }}>
              {format(day, 'd')}
            </Text>
            {count > 0 ? (
              <>
                <Text style={{ fontSize: 9, fontWeight: '600', color: isSelected ? '#4772FA' : '#6B7280' }}>
                  {count} session{count !== 1 ? 's' : ''}
                </Text>
                <Text style={{ fontSize: 9, color: isSelected ? '#6B9FFF' : '#9CA3AF' }}>
                  {fmtDur(totalMin)}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 9, color: '#D1D5DB' }}>—</Text>
            )}
          </Pressable>
        ))}
      </View>

      {/* Task filter — chips per task worked that day, with session counts */}
      {taskGroups.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#EFEFEF', flexGrow: 0 }}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          {taskGroups.map(t => {
            const active = taskFilter === t.id
            return (
              <Pressable
                key={t.id}
                onPress={() => setTaskFilter(active ? null : t.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                  backgroundColor: active ? '#EEF2FF' : '#F3F4F6',
                  borderWidth: 1, borderColor: active ? '#4772FA' : 'transparent',
                }}
              >
                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: active ? '#4772FA' : '#374151', maxWidth: 160 }}>{t.label}</Text>
                <Text style={{ fontSize: 10, color: active ? '#6B9FFF' : '#9CA3AF' }}>{t.count}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      {/* Client legend / filter — only when more than one device contributed */}
      {clients.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#EFEFEF', flexGrow: 0 }}
          contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          {clients.map(c => {
            const active = clientFilter === c.id
            return (
              <Pressable
                key={c.id}
                onPress={() => setClientFilter(active ? null : c.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
                  backgroundColor: active ? '#EEF2FF' : '#F3F4F6',
                  borderWidth: 1, borderColor: active ? '#4772FA' : 'transparent',
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#4772FA' : '#374151' }}>{c.label}</Text>
                <Text style={{ fontSize: 10, color: active ? '#6B9FFF' : '#9CA3AF' }}>{c.count}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      {showCalendar && (
        <CalendarPicker
          selected={selectedDate}
          onSelect={setSelectedDate}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {viewMode === 'agenda' ? (
        <AgendaList blocks={visibleBlocks} taskNames={taskNames} onPressBlock={setEditingBlock} onDeleteBlock={(b) => deleteSession(b.key)} />
      ) : (
      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', height: 24 * HOUR_H + 32 }}>

          {/* Hour labels */}
          <View style={{ width: LABEL_W }}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={{ height: HOUR_H, justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: 10, paddingTop: 6 }}>
                <Text style={{ fontSize: 11, color: h === now.getHours() ? '#4772FA' : '#B0B7C3', fontWeight: h === now.getHours() ? '700' : '400' }}>
                  {fmtHour(h)}
                </Text>
              </View>
            ))}
          </View>

          {/* Timeline — long-press empty area to add entry */}
          <Pressable
            style={{ width: timelineWidth, position: 'relative', paddingRight: PAD_R }}
            onLongPress={(e) => {
              const y = e.nativeEvent.locationY
              const mins = Math.round(y / MIN_H / 5) * 5 // snap to 5-min
              setAddingAt(Math.min(Math.max(mins, 0), 23 * 60 + 55))
            }}
            delayLongPress={300}
          >

            {/* Hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={{ position: 'absolute', left: 0, right: PAD_R, top: h * HOUR_H, height: 1, backgroundColor: h === 0 ? 'transparent' : '#F0F0F0' }} />
            ))}

            {/* Half-hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <View key={`hh-${h}`} style={{ position: 'absolute', left: 0, right: PAD_R, top: h * HOUR_H + HOUR_H / 2, height: 1, backgroundColor: '#F8F8F8' }} />
            ))}

            {/* Current time line — only on today's view */}
            {isViewingToday && nowMin >= 0 && nowMin <= 1440 && (
              <View style={{ position: 'absolute', left: 0, right: PAD_R, top: nowMin * MIN_H, zIndex: 10, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4772FA', marginLeft: -4 }} />
                <View style={{ flex: 1, height: 1.5, backgroundColor: '#4772FA' }} />
              </View>
            )}

            {/* Gap indicators */}
            {gapSegments.filter(g => g.endMin - g.startMin >= 5).map(g => (
              <View
                key={`gap-${g.startMin}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: PAD_R,
                  top: g.startMin * MIN_H + 1,
                  height: (g.endMin - g.startMin) * MIN_H - 2,
                  borderRadius: 3,
                  borderWidth: 1,
                  borderColor: '#E2E2E2',
                  borderStyle: 'dashed',
                  backgroundColor: '#E8E9EB',
                  justifyContent: 'center',
                  paddingLeft: 8,
                }}
              >
                {(g.endMin - g.startMin) >= 12 && (
                  <Text style={{ fontSize: 9, color: '#9CA3AF' }}>
                    {fmtMinTime(g.startMin)} – {fmtMinTime(g.endMin)} · {Math.round(g.endMin - g.startMin)}m · no work recorded
                  </Text>
                )}
              </View>
            ))}

            {/* Session blocks — one absolute View per cluster, columns share width via flex */}
            {clusters.map((cluster, ci) => (
              <View
                key={`cluster-${ci}`}
                style={{
                  position: 'absolute',
                  top: cluster.startMin * MIN_H,
                  left: 0,
                  right: PAD_R,
                  height: (cluster.endMin - cluster.startMin) * MIN_H,
                  flexDirection: 'row',
                  gap: 2,
                }}
              >
                {cluster.columns.map((col, colIdx) => (
                  <View key={colIdx} style={{ flex: 1, position: 'relative' }}>
                    {col.map(block => {
                      const blockTop = (bStart(block) - cluster.startMin) * MIN_H
                      const blockH   = Math.max(bDur(block) * MIN_H, MIN_TILE_H)
                      return (
                        <View key={block.key} style={{ position: 'absolute', top: blockTop, left: 0, right: 0, height: blockH }}>
                          <BlockTile
                            block={block}
                            onPress={() => setEditingBlock(block)}
                            taskName={blockName(block)}
                            height={blockH}
                          />
                        </View>
                      )
                    })}
                  </View>
                ))}
              </View>
            ))}
          </Pressable>
        </View>
      </ScrollView>
      )}

      {addingAt !== null && (
        <AddEntryModal
          startMinutes={addingAt}
          onSave={async (name, startMin, durationMin) => {
            const ds = format(selectedDate, 'yyyy-MM-dd')
            await addManualSession(checklistId, ds, name, startMin, durationMin)
            setAddingAt(null)
          }}
          onClose={() => setAddingAt(null)}
        />
      )}

      {editingBlock && (
        <EditModal
          block={editingBlock}
          taskName={blockName(editingBlock)}
          onSave={(s, d) => updateSessionTimes(editingBlock.key, s, d)}
          onClose={() => setEditingBlock(null)}
        />
      )}
    </View>
  )
}
