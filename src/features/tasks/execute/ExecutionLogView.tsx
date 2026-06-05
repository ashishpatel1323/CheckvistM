import { useState, useEffect, useRef, useMemo } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, Modal, useWindowDimensions } from 'react-native'
import { useExecuteLog, type ExecuteLogEntry } from './useExecuteLog'
import { useSystemLog } from './useSystemLog'
import { format, parseISO } from 'date-fns'
import { Cloud } from 'lucide-react-native'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOUR_H   = 64           // px per hour
const MIN_H    = HOUR_H / 60  // px per minute
const LABEL_W  = 56           // left hour-label column
const PAD_R    = 12           // right padding

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

// A "lane" is one column inside a cluster
interface LaidBlock {
  block: LogBlock
  col: number       // 0-based column index within cluster
  totalCols: number // total columns in cluster
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
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const bStart = (b: LogBlock) => b.overrideStartMin ?? b.startMin
const bDur   = (b: LogBlock) => b.overrideDurationMin ?? b.durationMin
const bEnd   = (b: LogBlock) => bStart(b) + bDur(b)

/** True if two blocks genuinely overlap (rounded to minutes, >1 min overlap) */
function overlaps(a: LogBlock, b: LogBlock): boolean {
  const aS = Math.round(bStart(a)), aE = Math.round(bEnd(a))
  const bS = Math.round(bStart(b)), bE = Math.round(bEnd(b))
  return Math.min(aE, bE) - Math.max(aS, bS) > 0
}

/**
 * Google Calendar layout algorithm.
 * Groups blocks into overlap clusters, assigns columns within each cluster.
 */
function layoutBlocks(blocks: LogBlock[]): LaidBlock[] {
  if (!blocks.length) return []
  const sorted = [...blocks].sort((a, b) => bStart(a) - bStart(b))

  // 1. Build clusters (connected components of overlapping blocks)
  const clusters: LogBlock[][] = []
  for (const block of sorted) {
    const target = clusters.find(c => c.some(b => overlaps(b, block)))
    if (target) target.push(block)
    else clusters.push([block])
  }

  // 2. Assign columns within each cluster
  const result: LaidBlock[] = []
  for (const cluster of clusters) {
    const colEnds: number[] = []
    const assigned: { block: LogBlock; col: number }[] = []
    for (const block of cluster.sort((a, b) => bStart(a) - bStart(b))) {
      const s = Math.round(bStart(block))
      let col = colEnds.findIndex(e => e <= s)
      if (col === -1) { col = colEnds.length; colEnds.push(0) }
      colEnds[col] = Math.round(bEnd(block))
      assigned.push({ block, col })
    }
    const totalCols = colEnds.length
    assigned.forEach(({ block, col }) => result.push({ block, col, totalCols }))
  }
  return result
}

// ─── Block tile ───────────────────────────────────────────────────────────────

function BlockTile({ block, onPress, taskName, colWidth }: {
  block: LogBlock; onPress: () => void; taskName: string; colWidth: number
}) {
  const dur    = bDur(block)
  const height = Math.max(dur * MIN_H, 22)
  const isShort = height < 38

  return (
    <Pressable
      onPress={onPress}
      style={{
        width: colWidth - 2,
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
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#1e3a8a', flex: isShort ? 1 : undefined }}>
        {taskName}
      </Text>
      {!isShort && (
        <Text style={{ fontSize: 10, color: '#6B7280' }}>
          {fmtMinTime(bStart(block))} – {fmtMinTime(bEnd(block))} · {fmtDur(dur)}
        </Text>
      )}
      {isShort && <Text style={{ fontSize: 10, color: '#6B7280' }}>{fmtDur(dur)}</Text>}
    </Pressable>
  )
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function EditModal({ block, taskName, onSave, onClose }: {
  block: LogBlock; taskName: string
  onSave: (s: number, d: number) => void; onClose: () => void
}) {
  const [sh, setSh] = useState(String(Math.floor(bStart(block) / 60) % 24))
  const [sm, setSm] = useState(String(Math.round(bStart(block) % 60)).padStart(2, '0'))
  const [dur, setDur] = useState(String(Math.round(bDur(block))))
  const parsedStart = Number(sh) * 60 + Number(sm)
  const parsedDur   = Number(dur)
  const valid = !isNaN(parsedStart) && !isNaN(parsedDur) && parsedDur > 0

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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onClose} style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => { if (valid) { onSave(parsedStart, parsedDur); onClose() } }} style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: valid ? '#4772FA' : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: valid ? 'white' : '#9CA3AF', fontWeight: '700' }}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function ExecutionLogView({ checklistId, taskNames }: { checklistId: number; taskNames: Record<number, string> }) {
  const { entries, timerRunningKey, timerStartedAt } = useExecuteLog()
  const { remoteSessions, fetchTodaySessions, systemListId } = useSystemLog()
  const [now, setNow]           = useState(() => new Date())
  const scrollRef               = useRef<ScrollView>(null)
  const [overrides, setOverrides] = useState<Record<string, { startMin?: number; durationMin?: number }>>({})
  const [editingBlock, setEditingBlock] = useState<LogBlock | null>(null)
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
      blocks.push({ key, taskId: entry.taskId, startMin: minutesFromMidnight(entry.startedAt), durationMin: Math.max(1, actualSec / 60), entry, overrideStartMin: ov.startMin, overrideDurationMin: ov.durationMin })
    }

    for (const [key, session] of Object.entries(remoteSessions)) {
      if (seen.has(key) || !session.startedAt) continue
      const parts = key.split(':')
      if (parts.length < 3 || parts[1] !== todayStr) continue
      const ov = overrides[key] ?? {}
      blocks.push({ key, taskId: session.taskId, startMin: minutesFromMidnight(session.startedAt), durationMin: Math.max(1, session.actualSeconds / 60), entry: { taskId: session.taskId, estimateMin: 0, startedAt: session.startedAt, actualSeconds: session.actualSeconds, completedAt: session.completedAt }, overrideStartMin: ov.startMin, overrideDurationMin: ov.durationMin })
    }

    return blocks
  }, [entries, remoteSessions, todayStr, timerRunningKey, timerStartedAt, overrides])

  const laid = useMemo(() => layoutBlocks(allBlocks), [allBlocks])
  const totalDur = allBlocks.reduce((s, b) => s + bDur(b), 0)

  const saveOverride = (key: string, s: number, d: number) =>
    setOverrides(prev => ({ ...prev, [key]: { startMin: s, durationMin: d } }))

  // Build gap segments for each past hour
  const gapSegments = useMemo(() => {
    const segs: { startMin: number; endMin: number }[] = []
    for (let h = 0; h < 24; h++) {
      const slotStart = h * 60
      const slotEnd   = slotStart + 60
      if (slotEnd > nowMin) break

      // Find covered intervals in this slot
      const covered: [number, number][] = allBlocks
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
  }, [allBlocks, nowMin])

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

          {/* Timeline */}
          <View style={{ width: timelineWidth, position: 'relative', paddingRight: PAD_R }}>

            {/* Hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <View key={h} style={{ position: 'absolute', left: 0, right: PAD_R, top: h * HOUR_H, height: 1, backgroundColor: h === 0 ? 'transparent' : '#F0F0F0' }} />
            ))}

            {/* Half-hour lines */}
            {Array.from({ length: 24 }, (_, h) => (
              <View key={`hh-${h}`} style={{ position: 'absolute', left: 0, right: PAD_R, top: h * HOUR_H + HOUR_H / 2, height: 1, backgroundColor: '#F8F8F8' }} />
            ))}

            {/* Current time line */}
            {nowMin >= 0 && nowMin <= 1440 && (
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
                  borderColor: '#EBEBEB',
                  borderStyle: 'dashed',
                  justifyContent: 'center',
                  paddingLeft: 8,
                }}
              >
                {(g.endMin - g.startMin) >= 12 && (
                  <Text style={{ fontSize: 9, color: '#D1D5DB' }}>
                    {fmtMinTime(g.startMin)} – {fmtMinTime(g.endMin)} · {Math.round(g.endMin - g.startMin)}m · no work recorded
                  </Text>
                )}
              </View>
            ))}

            {/* Session blocks — grouped by cluster for reliable side-by-side rendering */}
            {laid.map(({ block, col, totalCols }) => {
              const top    = bStart(block) * MIN_H
              const colW   = (timelineWidth - PAD_R) / totalCols
              // Use absolute left pixel — derived from synchronous timelineWidth
              const left   = col * colW

              return (
                <View
                  key={block.key}
                  style={{ position: 'absolute', top, left, width: colW, paddingHorizontal: 1 }}
                >
                  <BlockTile
                    block={block}
                    onPress={() => setEditingBlock(block)}
                    taskName={taskNames[block.taskId] ?? `Task ${block.taskId}`}
                    colWidth={colW}
                  />
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>

      {editingBlock && (
        <EditModal
          block={editingBlock}
          taskName={taskNames[editingBlock.taskId] ?? `Task ${editingBlock.taskId}`}
          onSave={(s, d) => saveOverride(editingBlock.key, s, d)}
          onClose={() => setEditingBlock(null)}
        />
      )}
    </View>
  )
}
