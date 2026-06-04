import { useState, useEffect, useRef, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, Modal } from 'react-native'
import { useExecuteLog, type ExecuteLogEntry } from './useExecuteLog'
import { useSystemLog } from './useSystemLog'
import { format, parseISO } from 'date-fns'
import { Pencil, Cloud } from 'lucide-react-native'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_H = 64          // px per hour
const MIN_H = HOUR_H / 60  // px per minute
const LABEL_W = 52         // left column width

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

interface LayoutBlock {
  block: LogBlock
  col: number
  totalCols: number
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

function fmtMinTime(totalMin: number): string {
  const h = Math.floor(totalMin / 60) % 24
  const m = Math.round(totalMin % 60)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const disp = h % 12 || 12
  return `${disp}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDur(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function bStart(b: LogBlock) { return b.overrideStartMin ?? b.startMin }
function bDur(b: LogBlock)   { return b.overrideDurationMin ?? b.durationMin }
function bEnd(b: LogBlock)   { return bStart(b) + bDur(b) }

/**
 * Google Calendar overlap layout.
 * Uses whole-minute boundaries to avoid false overlaps from second-level precision
 * (e.g. a session ending at 2:58:45 and the next starting at 2:58:30 is treated as sequential).
 * Minimum real overlap required: > 1 minute.
 */
function overlaps(a: LogBlock, b: LogBlock): boolean {
  // Round to whole minutes so sub-minute adjacency doesn't count as overlap
  const aStart = Math.round(bStart(a))
  const aEnd   = Math.round(bEnd(a))
  const bS     = Math.round(bStart(b))
  const bE     = Math.round(bEnd(b))
  // Must overlap by more than 1 minute
  const overlapMin = Math.min(aEnd, bE) - Math.max(aStart, bS)
  return overlapMin > 1
}

function layoutBlocks(blocks: LogBlock[]): LayoutBlock[] {
  if (blocks.length === 0) return []
  const sorted = [...blocks].sort((a, b) => bStart(a) - bStart(b))

  // Group into overlap clusters
  const clusters: LogBlock[][] = []
  for (const block of sorted) {
    const cluster = clusters.find(c => c.some(b => overlaps(b, block)))
    if (cluster) cluster.push(block)
    else clusters.push([block])
  }

  const result: LayoutBlock[] = []
  for (const cluster of clusters) {
    const colEnds: number[] = []
    const assigned: { block: LogBlock; col: number }[] = []
    for (const block of cluster.sort((a, b) => bStart(a) - bStart(b))) {
      const bS = Math.round(bStart(block))
      let col = colEnds.findIndex(end => end <= bS)
      if (col === -1) { col = colEnds.length; colEnds.push(0) }
      colEnds[col] = Math.round(bEnd(block))
      assigned.push({ block, col })
    }
    const totalCols = colEnds.length
    for (const { block, col } of assigned) result.push({ block, col, totalCols })
  }

  return result
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({ block, taskName, onSave, onClose }: {
  block: LogBlock; taskName: string
  onSave: (startMin: number, durationMin: number) => void
  onClose: () => void
}) {
  const curStart = bStart(block)
  const curDur   = bDur(block)
  const [sh, setSh] = useState(String(Math.floor(curStart / 60) % 24))
  const [sm, setSm] = useState(String(Math.round(curStart % 60)).padStart(2, '0'))
  const [dur, setDur] = useState(String(Math.round(curDur)))

  const parsedStart = Number(sh) * 60 + Number(sm)
  const parsedDur   = Number(dur)
  const valid = !isNaN(parsedStart) && !isNaN(parsedDur) && parsedDur > 0

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 300, backgroundColor: 'white', borderRadius: 16, padding: 20, gap: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>Edit session</Text>
            <Text style={{ fontSize: 12, color: '#6B7280' }} numberOfLines={1}>{taskName}</Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Start time</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TextInput value={sh} onChangeText={setSh} keyboardType="number-pad" maxLength={2}
                style={{ width: 48, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' }} />
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#374151' }}>:</Text>
              <TextInput value={sm} onChangeText={setSm} keyboardType="number-pad" maxLength={2}
                style={{ width: 48, height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 16, fontWeight: '600' }} />
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Duration (minutes)</Text>
            <TextInput value={dur} onChangeText={setDur} keyboardType="number-pad"
              style={{ height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, fontSize: 16, fontWeight: '600' }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onClose} style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => { if (valid) { onSave(parsedStart, parsedDur); onClose() } }}
              style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: valid ? '#4772FA' : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: valid ? 'white' : '#9CA3AF', fontWeight: '700' }}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  const [syncing, setSyncing] = useState(false)
  const [, tick] = useState(0)
  const [timelineWidth, setTimelineWidth] = useState(0)

  useEffect(() => {
    const id = setInterval(() => { setNow(new Date()); tick(n => n + 1) }, 10_000)
    return () => clearInterval(id)
  }, [])

  // Scroll to current hour on mount
  useEffect(() => {
    const h = new Date().getHours()
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, h - 1) * HOUR_H, animated: true })
    }, 300)
  }, [])

  useEffect(() => {
    setSyncing(true)
    fetchTodaySessions().finally(() => setSyncing(false))
  }, [fetchTodaySessions])

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const todayStr = format(now, 'yyyy-MM-dd')

  // Build all blocks (local entries take precedence over remote)
  const allBlocks = useMemo<LogBlock[]>(() => {
    const blocks: LogBlock[] = []
    const seen = new Set<string>()

    for (const [key, entry] of Object.entries(entries)) {
      const parts = key.split(':')
      if (parts.length < 3 || parts[1] !== todayStr || !entry.startedAt) continue
      seen.add(key)
      const isRunning = timerRunningKey === key && timerStartedAt !== null
      const actualSec = isRunning ? entry.actualSeconds + Math.floor((Date.now() - timerStartedAt) / 1000) : entry.actualSeconds
      const ov = overrides[key] ?? {}
      blocks.push({
        key, taskId: entry.taskId,
        startMin: minutesFromMidnight(entry.startedAt),
        durationMin: Math.max(1, actualSec / 60),
        entry,
        overrideStartMin: ov.startMin, overrideDurationMin: ov.durationMin,
      })
    }

    for (const [key, session] of Object.entries(remoteSessions)) {
      if (seen.has(key) || !session.startedAt) continue
      const parts = key.split(':')
      if (parts.length < 3 || parts[1] !== todayStr) continue
      const ov = overrides[key] ?? {}
      blocks.push({
        key, taskId: session.taskId,
        startMin: minutesFromMidnight(session.startedAt),
        durationMin: Math.max(1, session.actualSeconds / 60),
        entry: { taskId: session.taskId, estimateMin: 0, startedAt: session.startedAt, actualSeconds: session.actualSeconds, completedAt: session.completedAt },
        overrideStartMin: ov.startMin, overrideDurationMin: ov.durationMin,
      })
    }

    return blocks
  }, [entries, remoteSessions, todayStr, timerRunningKey, timerStartedAt, overrides])

  const laid = useMemo(() => layoutBlocks(allBlocks), [allBlocks])
  const totalDur = allBlocks.reduce((s, b) => s + bDur(b), 0)

  const saveOverride = (key: string, startMin: number, durationMin: number) =>
    setOverrides(prev => ({ ...prev, [key]: { startMin, durationMin } }))

  const totalHeight = 24 * HOUR_H

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAFA' }}>
      {/* Header */}
      <View style={{ backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EFEFEF', flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>Execution Log</Text>
          <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{format(now, 'EEEE, MMMM d')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Cloud size={14} color={syncing ? '#9CA3AF' : systemListId ? '#4772FA' : '#D1D5DB'} />
          {allBlocks.length > 0 && (
            <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#4772FA' }}>
                {allBlocks.length} session{allBlocks.length !== 1 ? 's' : ''} · {fmtDur(totalDur)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Calendar grid */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {/* The grid is absolutely positioned */}
        <View style={{ flexDirection: 'row', height: totalHeight + 32 }}>

          {/* Left: hour labels */}
          <View style={{ width: LABEL_W, paddingTop: 0 }}>
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={{ height: HOUR_H, justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: 10, paddingTop: 6 }}>
                <Text style={{
                  fontSize: 11,
                  color: h === now.getHours() ? '#4772FA' : '#B0B7C3',
                  fontWeight: h === now.getHours() ? '700' : '400',
                }}>
                  {fmtHour(h)}
                </Text>
              </View>
            ))}
          </View>

          {/* Right: timeline */}
          <View
            style={{ flex: 1, position: 'relative', paddingRight: 12 }}
            onLayout={e => setTimelineWidth(e.nativeEvent.layout.width - 12)}
          >

            {/* Hour grid lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={{
                position: 'absolute', left: 0, right: 0,
                top: h * HOUR_H,
                height: 1,
                backgroundColor: h === 0 ? 'transparent' : '#F0F0F0',
              }} />
            ))}

            {/* Half-hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <View key={`h-${h}`} style={{
                position: 'absolute', left: 0, right: 0,
                top: h * HOUR_H + HOUR_H / 2,
                height: 1,
                backgroundColor: '#F8F8F8',
              }} />
            ))}

            {/* Current time indicator */}
            {nowMin >= 0 && nowMin <= 1440 && (
              <View style={{ position: 'absolute', left: 0, right: 0, top: nowMin * MIN_H, zIndex: 10, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4772FA', marginLeft: -4 }} />
                <View style={{ flex: 1, height: 1.5, backgroundColor: '#4772FA' }} />
              </View>
            )}

            {/* Session blocks — absolutely positioned by time, pixel-based for column layout */}
            {timelineWidth > 0 && laid.map(({ block, col, totalCols }) => {
              const top = bStart(block) * MIN_H
              const height = Math.max(bDur(block) * MIN_H, 22)
              const name = taskNames[block.taskId] ?? `Task ${block.taskId}`
              const colW = (timelineWidth / totalCols) - 3
              const left = col * (timelineWidth / totalCols)
              const isShort = height < 38

              return (
                <Pressable
                  key={block.key}
                  onPress={() => setEditingBlock(block)}
                  style={{
                    position: 'absolute',
                    top,
                    height,
                    left,
                    width: colW,
                    paddingHorizontal: 1,
                  }}
                >
                  <View style={{
                    flex: 1,
                    backgroundColor: '#EEF2FF',
                    borderLeftWidth: 3,
                    borderLeftColor: '#4772FA',
                    borderRadius: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 3,
                    overflow: 'hidden',
                    flexDirection: isShort ? 'row' : 'column',
                    alignItems: isShort ? 'center' : 'flex-start',
                    gap: isShort ? 4 : 1,
                  }}>
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#1e3a8a', flex: isShort ? 1 : undefined }}>
                      {name}
                    </Text>
                    {!isShort && (
                      <Text style={{ fontSize: 10, color: '#6B7280' }}>
                        {fmtMinTime(bStart(block))} – {fmtMinTime(bEnd(block))} · {fmtDur(bDur(block))}
                      </Text>
                    )}
                    {isShort && (
                      <Text style={{ fontSize: 10, color: '#6B7280' }}>{fmtDur(bDur(block))}</Text>
                    )}
                  </View>
                </Pressable>
              )
            })}

            {/* No-work gaps — only render for past hours, as thin dashed strips */}
            {Array.from({ length: 24 }, (_, h) => {
              const slotStart = h * 60
              const slotEnd = slotStart + 60
              if (slotEnd > nowMin) return null // future

              const covered = laid.reduce((sum, { block }) => {
                const s = Math.max(slotStart, bStart(block))
                const e = Math.min(slotEnd, bEnd(block))
                return sum + Math.max(0, e - s)
              }, 0)
              const gap = Math.round(60 - covered)
              if (gap < 5) return null

              // Find uncovered spans within this hour
              const intervals = laid
                .map(({ block }) => [Math.max(slotStart, bStart(block)), Math.min(slotEnd, bEnd(block))] as [number, number])
                .filter(([s, e]) => e > s)
                .sort((a, b) => a[0] - b[0])

              const gaps: [number, number][] = []
              let cursor = slotStart
              for (const [s, e] of intervals) {
                if (s > cursor) gaps.push([cursor, s])
                cursor = Math.max(cursor, e)
              }
              if (cursor < Math.min(slotEnd, nowMin)) gaps.push([cursor, Math.min(slotEnd, nowMin)])

              return gaps.filter(([s, e]) => e - s >= 5).map(([s, e]) => (
                <View
                  key={`gap-${s}`}
                  style={{
                    position: 'absolute',
                    top: s * MIN_H + 1,
                    height: (e - s) * MIN_H - 2,
                    left: 0, right: 0,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderColor: '#EBEBEB',
                    borderStyle: 'dashed',
                    justifyContent: 'center',
                    paddingLeft: 8,
                  }}
                >
                  {(e - s) >= 12 && (
                    <Text style={{ fontSize: 9, color: '#D1D5DB' }}>
                      {fmtMinTime(s)} – {fmtMinTime(e)} · {Math.round(e - s)}m · no work recorded
                    </Text>
                  )}
                </View>
              ))
            })}
          </View>
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
