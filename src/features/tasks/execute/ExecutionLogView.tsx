import { useState, useEffect, useRef, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native'
import { useExecuteLog, type ExecuteLogEntry } from './useExecuteLog'
import { useSystemLog } from './useSystemLog'
import { format, parseISO } from 'date-fns'
import { Pencil, Cloud, CloudOff } from 'lucide-react-native'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogBlock {
  key: string
  taskId: number
  startMin: number
  durationMin: number
  entry: ExecuteLogEntry
  overrideStartMin?: number
  overrideDurationMin?: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function minutesFromMidnight(iso: string): number {
  const d = parseISO(iso)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

function fmtHourLabel(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function fmtMinuteTime(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24
  const m = Math.round(totalMin % 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const disp = h % 12 || 12
  return `${disp}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDuration(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function bStart(b: LogBlock) { return b.overrideStartMin ?? b.startMin }
function bDur(b: LogBlock) { return b.overrideDurationMin ?? b.durationMin }
function bEnd(b: LogBlock) { return bStart(b) + bDur(b) }

// Assign column indices so overlapping blocks go side-by-side (Google Calendar style)
function layoutColumns(blocks: LogBlock[]): { block: LogBlock; col: number; totalCols: number }[] {
  if (blocks.length === 0) return []
  const sorted = [...blocks].sort((a, b) => bStart(a) - bStart(b))
  // Each item gets a column; track where each column's last block ends
  const colEnds: number[] = []
  const assigned: { block: LogBlock; col: number }[] = []

  for (const block of sorted) {
    const s = bStart(block)
    let col = colEnds.findIndex((end) => end <= s)
    if (col === -1) { col = colEnds.length; colEnds.push(0) }
    colEnds[col] = bEnd(block)
    assigned.push({ block, col })
  }

  const totalCols = colEnds.length
  return assigned.map(({ block, col }) => ({ block, col, totalCols }))
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({
  block,
  taskName,
  onSave,
  onClose,
}: {
  block: LogBlock
  taskName: string
  onSave: (startMin: number, durationMin: number) => void
  onClose: () => void
}) {
  const curStart = bStart(block)
  const curDur = bDur(block)
  const [startH, setStartH] = useState(String(Math.floor(curStart / 60) % 24))
  const [startM, setStartM] = useState(String(Math.round(curStart % 60)).padStart(2, '0'))
  const [dur, setDur] = useState(String(Math.round(curDur)))

  const parsedStart = Number(startH) * 60 + Number(startM)
  const parsedDur = Number(dur)
  const valid = !isNaN(parsedStart) && !isNaN(parsedDur) && parsedDur > 0

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{
          width: 300, backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 16,
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 10,
        }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>Edit session</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }} numberOfLines={1}>{taskName}</Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Start time</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput
                value={startH} onChangeText={setStartH} keyboardType="number-pad" maxLength={2}
                style={{ width: 48, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' }}
              />
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#374151' }}>:</Text>
              <TextInput
                value={startM} onChangeText={setStartM} keyboardType="number-pad" maxLength={2}
                style={{ width: 48, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' }}
              />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Duration (minutes)</Text>
            <TextInput
              value={dur} onChangeText={setDur} keyboardType="number-pad"
              style={{ height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, fontSize: 16, fontWeight: '600' }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onClose} style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => { if (valid) { onSave(parsedStart, parsedDur); onClose() } }}
              style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: valid ? '#4772FA' : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, color: valid ? 'white' : '#9CA3AF', fontWeight: '700' }}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Hour row ─────────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 72

function HourRow({
  hour,
  nowMin,
  blocks,
  onEdit,
  taskNames,
}: {
  hour: number
  nowMin: number
  blocks: LogBlock[]   // only blocks that START in this hour
  onEdit: (block: LogBlock) => void
  taskNames: Record<number, string>
}) {
  const slotStartMin = hour * 60
  const slotEndMin = slotStartMin + 60
  const isFuture = slotStartMin > nowMin
  const isCurrent = slotStartMin <= nowMin && nowMin < slotEndMin
  const cappedNow = isCurrent ? nowMin : (isFuture ? slotStartMin : slotEndMin)

  // Compute gap segments: past portions of this hour not covered by any block
  // We need ALL blocks active in this hour (including ones starting before but ending in it)
  // But since we only track start-hour, we only get blocks starting here.
  // Gap = elapsed time in slot minus covered time
  const coveredIntervals: [number, number][] = blocks
    .map((b): [number, number] => [Math.max(slotStartMin, bStart(b)), Math.min(slotEndMin, bEnd(b))])
    .filter(([s, e]) => e > s)

  // Merge intervals
  const merged: [number, number][] = []
  for (const iv of coveredIntervals.sort((a, b) => a[0] - b[0])) {
    if (merged.length > 0 && iv[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1])
    } else {
      merged.push([iv[0], iv[1]])
    }
  }

  // Gap segments between start-of-elapsed and cappedNow
  const gaps: [number, number][] = []
  if (!isFuture) {
    let cursor = slotStartMin
    for (const [s, e] of merged) {
      if (s > cursor) gaps.push([cursor, s])
      cursor = Math.max(cursor, e)
    }
    if (cursor < cappedNow) gaps.push([cursor, cappedNow])
  }

  const layout = layoutColumns(blocks)

  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F0F0F0', minHeight: HOUR_HEIGHT }}>
      {/* Hour label */}
      <View style={{ width: 52, paddingTop: 8, alignItems: 'flex-end', paddingRight: 10, flexShrink: 0 }}>
        <Text style={{ fontSize: 11, color: isCurrent ? '#4772FA' : '#9CA3AF', fontWeight: isCurrent ? '700' : '400' }}>
          {fmtHourLabel(hour)}
        </Text>
      </View>

      {/* Content area */}
      <View style={{ flex: 1, paddingVertical: 6, paddingRight: 12, gap: 4 }}>

        {/* Side-by-side block layout */}
        {layout.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {/* Build columns */}
            {Array.from({ length: layout[0]?.totalCols ?? 1 }, (_, colIdx) => (
              <View key={colIdx} style={{ flex: 1, gap: 4 }}>
                {layout
                  .filter((item) => item.col === colIdx)
                  .map(({ block }) => {
                    const name = taskNames[block.taskId] ?? `Task ${block.taskId}`
                    const s = bStart(block)
                    const e = bEnd(block)
                    return (
                      <View key={block.key} style={{
                        backgroundColor: '#EEF2FF',
                        borderLeftWidth: 3,
                        borderLeftColor: '#4772FA',
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: '#1e3a8a' }}>{name}</Text>
                          <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>
                            {fmtMinuteTime(s)} – {fmtMinuteTime(e)} · {fmtDuration(bDur(block))}
                          </Text>
                        </View>
                        <Pressable onPress={() => onEdit(block)} hitSlop={8}>
                          <Pencil size={13} color="#6B7280" />
                        </Pressable>
                      </View>
                    )
                  })}
              </View>
            ))}
          </View>
        )}

        {/* Gap segments */}
        {gaps.filter(([s, e]) => e - s >= 5).map(([s, e]) => (
          <View key={`${s}-${e}`} style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            borderStyle: 'dashed',
          }}>
            <Text style={{ fontSize: 11, color: '#C4C4C4' }}>
              {fmtMinuteTime(s)} – {fmtMinuteTime(e)} · {fmtDuration(e - s)} · no work recorded
            </Text>
          </View>
        ))}

        {/* Future — subtle empty line */}
        {isFuture && blocks.length === 0 && <View style={{ height: 2 }} />}
      </View>
    </View>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

interface ExecutionLogViewProps {
  checklistId: number
  taskNames: Record<number, string>
}

export function ExecutionLogView({ checklistId, taskNames }: ExecutionLogViewProps) {
  const { entries, timerRunningKey, timerStartedAt } = useExecuteLog()
  const { remoteSessions, fetchTodaySessions, systemListId } = useSystemLog()
  const [now, setNow] = useState(() => new Date())
  const scrollRef = useRef<ScrollView>(null)
  const [overrides, setOverrides] = useState<Record<string, { startMin?: number; durationMin?: number }>>({})
  const [editingBlock, setEditingBlock] = useState<LogBlock | null>(null)
  const [, tick] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const id = setInterval(() => { setNow(new Date()); tick((n) => n + 1) }, 10_000)
    return () => clearInterval(id)
  }, [])

  // Hydrate remote sessions when log tab opens
  useEffect(() => {
    if (!systemListId) return
    setSyncing(true)
    fetchTodaySessions().finally(() => setSyncing(false))
  }, [systemListId, fetchTodaySessions])

  useEffect(() => {
    const h = new Date().getHours()
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, (h - 1)) * HOUR_HEIGHT, animated: true })
    }, 300)
  }, [])

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todayStr = format(now, 'yyyy-MM-dd')

  const allBlocks = useMemo<LogBlock[]>(() => {
    const blocks: LogBlock[] = []
    const seenKeys = new Set<string>()

    // Local entries (live / most up-to-date)
    for (const [key, entry] of Object.entries(entries)) {
      const parts = key.split(':')
      if (parts.length < 3 || parts[1] !== todayStr || !entry.startedAt) continue
      seenKeys.add(key)

      const startM = minutesFromMidnight(entry.startedAt)
      const isRunning = timerRunningKey === key && timerStartedAt !== null
      const actualSec = isRunning
        ? entry.actualSeconds + Math.floor((Date.now() - timerStartedAt) / 1000)
        : entry.actualSeconds
      const durMin = Math.max(1, actualSec / 60)
      const ov = overrides[key] ?? {}

      blocks.push({
        key, taskId: entry.taskId, startMin: startM, durationMin: durMin, entry,
        overrideStartMin: ov.startMin, overrideDurationMin: ov.durationMin,
      })
    }

    // Remote-only sessions (from other devices / previous app sessions)
    for (const [key, session] of Object.entries(remoteSessions)) {
      if (seenKeys.has(key)) continue
      if (!session.startedAt) continue
      const parts = key.split(':')
      if (parts.length < 3 || parts[1] !== todayStr) continue

      const startM = minutesFromMidnight(session.startedAt)
      const durMin = Math.max(1, session.actualSeconds / 60)
      const ov = overrides[key] ?? {}

      const syntheticEntry: ExecuteLogEntry = {
        taskId: session.taskId, estimateMin: 0,
        startedAt: session.startedAt, actualSeconds: session.actualSeconds,
        completedAt: session.completedAt,
      }
      blocks.push({
        key, taskId: session.taskId, startMin: startM, durationMin: durMin,
        entry: syntheticEntry, overrideStartMin: ov.startMin, overrideDurationMin: ov.durationMin,
      })
    }

    return blocks
  }, [entries, remoteSessions, todayStr, timerRunningKey, timerStartedAt, overrides])

  // Group blocks by START hour only (prevents duplicates across hours)
  const blocksByStartHour = useMemo(() => {
    const map: Record<number, LogBlock[]> = {}
    for (const b of allBlocks) {
      const h = Math.floor(bStart(b) / 60) % 24
      if (!map[h]) map[h] = []
      map[h].push(b)
    }
    return map
  }, [allBlocks])

  const totalDur = allBlocks.reduce((s, b) => s + bDur(b), 0)

  const saveOverride = (key: string, startMin: number, durationMin: number) =>
    setOverrides((prev) => ({ ...prev, [key]: { startMin, durationMin } }))

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      {/* Header */}
      <View style={{
        backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#EFEFEF',
        flexDirection: 'row', alignItems: 'center', gap: 8,
      }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Execution Log</Text>
          <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{format(now, 'EEEE, MMMM d')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {syncing
            ? <Cloud size={14} color="#9CA3AF" />
            : systemListId
              ? <Cloud size={14} color="#4772FA" />
              : <CloudOff size={14} color="#D1D5DB" />}
          {allBlocks.length > 0 && (
            <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#4772FA' }}>
                {allBlocks.length} session{allBlocks.length !== 1 ? 's' : ''} · {fmtDuration(totalDur)}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingBottom: 40 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <HourRow
              key={h}
              hour={h}
              nowMin={nowMin}
              blocks={blocksByStartHour[h] ?? []}
              onEdit={setEditingBlock}
              taskNames={taskNames}
            />
          ))}
        </View>
      </ScrollView>

      {editingBlock && (
        <EditModal
          block={editingBlock}
          taskName={taskNames[editingBlock.taskId] ?? `Task ${editingBlock.taskId}`}
          onSave={(startMin, durationMin) => saveOverride(editingBlock.key, startMin, durationMin)}
          onClose={() => setEditingBlock(null)}
        />
      )}
    </View>
  )
}
