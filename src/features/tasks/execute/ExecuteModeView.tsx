import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, ScrollView, Platform } from 'react-native'
import { Play, Pause, Minus, Plus, Check, RotateCcw, Circle, CheckCircle2, ExternalLink, GripVertical } from 'lucide-react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate } from '@/lib/dateSort'
import {
  useExecuteLog,
  entryKey,
  liveSeconds,
  DEFAULT_ESTIMATE,
  ESTIMATE_STEP,
  type ExecuteLogEntry,
} from './useExecuteLog'
import { priorityTextColor, priorityDisplay, priorityRowBg } from '@/features/tasks/shared/PriorityPicker'
import { hapticMedium } from '@/platform/haptics'

const BLUE = '#4772FA'

interface ExecuteModeViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  onClose: () => void
  onJumpToRaw?: (taskId: number) => void
}

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function fmtMins(seconds: number): string {
  const m = Math.round(seconds / 60)
  return `${m}m`
}

function reorder<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr]
  const [item] = result.splice(from, 1)
  result.splice(to > from ? to - 1 : to, 0, item)
  return result
}

export function ExecuteModeView({ tasks, checklistId, onClose, onJumpToRaw }: ExecuteModeViewProps) {
  const todayTasks = useMemo(() => {
    const { allNodes } = buildTaskTree(tasks)
    const groups = groupTasksByDate(allNodes)
    return groups.find((g) => g.group === 'today')?.tasks ?? []
  }, [tasks])

  // Local ordered task IDs — drag reorders this without any API call
  const [orderedIds, setOrderedIds] = useState<number[]>([])
  useEffect(() => {
    setOrderedIds((prev) => {
      const newIds = todayTasks.map((t) => t.id)
      const kept = prev.filter((id) => newIds.includes(id))
      const added = newIds.filter((id) => !prev.includes(id))
      return [...kept, ...added]
    })
  }, [todayTasks])
  const orderedTasks = useMemo(
    () => orderedIds.map((id) => todayTasks.find((t) => t.id === id)).filter(Boolean) as typeof todayTasks,
    [orderedIds, todayTasks]
  )

  const { entries, timerRunningKey, timerStartedAt, seed, setEstimate, play, pause, markCompleted, reset } = useExecuteLog()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [, setTick] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Drag state — refs hold truth, state drives rendering
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [insertIdx, setInsertIdx] = useState<number | null>(null)
  const draggingIdxRef = useRef<number | null>(null)
  const insertIdxRef = useRef<number | null>(null)

  // Web: map of index → card DOM element, populated via callback refs
  const cardDomRefs = useRef<Map<number, HTMLElement>>(new Map())
  // Native: map of index → RN View ref
  const nativeRowRefs = useRef<Map<number, View>>(new Map())

  useEffect(() => {
    for (const t of todayTasks) {
      seed(entryKey(checklistId, t.id), t.id, t.duration?.minutes ?? DEFAULT_ESTIMATE)
    }
  }, [todayTasks, checklistId, seed])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (timerRunningKey) {
      intervalRef.current = setInterval(() => setTick((n) => n + 1), 1000)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerRunningKey])

  const currentTask = orderedTasks[currentIndex]
  const currentKey = currentTask ? entryKey(checklistId, currentTask.id) : null
  const isRunning = timerRunningKey === currentKey && currentKey !== null

  const getEntry = (taskId: number): ExecuteLogEntry | undefined =>
    entries[entryKey(checklistId, taskId)]

  const currentEntry = currentTask ? getEntry(currentTask.id) : undefined
  const currentSeconds = currentEntry && currentKey
    ? liveSeconds(currentEntry, timerRunningKey, timerStartedAt, currentKey)
    : 0

  const completedCount = orderedTasks.filter((t) => getEntry(t.id)?.completedAt).length
  const totalActualSeconds = orderedTasks.reduce((sum, t) => {
    const e = getEntry(t.id)
    if (!e) return sum
    return sum + liveSeconds(e, timerRunningKey, timerStartedAt, entryKey(checklistId, t.id))
  }, 0)
  const totalEstimateSeconds = orderedTasks.reduce((sum, t) => {
    const e = getEntry(t.id)
    return sum + (e?.estimateMin ?? DEFAULT_ESTIMATE) * 60
  }, 0)

  const togglePlay = () => { if (!currentKey) return; isRunning ? pause() : play(currentKey) }
  const adjust = (delta: number) => { if (!currentKey || !currentEntry) return; setEstimate(currentKey, currentEntry.estimateMin + delta) }
  const complete = () => {
    if (!currentKey) return
    markCompleted(currentKey)
    if (currentIndex < orderedTasks.length - 1) setCurrentIndex((i) => i + 1)
  }
  const resetCurrent = () => { if (!currentKey) return; reset(currentKey) }
  const jumpTo = (index: number) => setCurrentIndex(index)

  // ── Shared commit ──────────────────────────────────────────────────────────
  function commitReorder() {
    const from = draggingIdxRef.current
    const to = insertIdxRef.current
    draggingIdxRef.current = null
    insertIdxRef.current = null
    setDraggingIdx(null)
    setInsertIdx(null)
    if (from === null || to === null || from === to) return
    setOrderedIds((prev) => reorder(prev, from, to))
    setCurrentIndex((ci) => {
      const len = orderedTasks.length
      const idxMap = reorder(Array.from({ length: len }, (_, i) => i), from, to)
      const ni = idxMap.indexOf(ci)
      return ni >= 0 ? ni : ci
    })
  }

  // ── Keyboard reorder ──────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      setCurrentIndex((ci) => {
        const delta = e.key === 'ArrowUp' ? -1 : 1
        const next = ci + delta
        if (next < 0 || next >= orderedTasks.length) return ci
        setOrderedIds((prev) => {
          const result = [...prev]
          ;[result[ci], result[next]] = [result[next], result[ci]]
          return result
        })
        return next
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [orderedTasks.length])

  // ── Web drag ───────────────────────────────────────────────────────────────
  function onGripPointerDown(e: React.PointerEvent, idx: number) {
    e.preventDefault()
    draggingIdxRef.current = idx
    insertIdxRef.current = idx
    setDraggingIdx(idx)
    setInsertIdx(idx)

    function onMove(ev: PointerEvent) {
      // Walk up the element stack at the cursor to find the card div
      const els = document.elementsFromPoint(ev.clientX, ev.clientY)
      for (const el of els) {
        const raw = (el as HTMLElement).dataset?.executeIdx
        if (raw === undefined) continue
        const cardIdx = parseInt(raw)
        const rect = (el as HTMLElement).getBoundingClientRect()
        const ni = ev.clientY < rect.top + rect.height / 2 ? cardIdx : cardIdx + 1
        insertIdxRef.current = ni
        setInsertIdx(ni)
        return
      }
    }

    function onUp() {
      commitReorder()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ── Native drag ────────────────────────────────────────────────────────────
  function computeInsertFromAbsoluteY(absoluteY: number, measurements: Array<{ y: number; h: number }>) {
    for (let i = 0; i < measurements.length; i++) {
      if (absoluteY < measurements[i].y + measurements[i].h / 2) return i
    }
    return measurements.length
  }

  function makeNativeGesture(idx: number) {
    return Gesture.Pan()
      .activateAfterLongPress(400)
      .runOnJS(true)
      .onStart((e) => {
        hapticMedium()
        draggingIdxRef.current = idx
        insertIdxRef.current = idx
        setDraggingIdx(idx)
        setInsertIdx(idx)
        // Measure all row positions right now
        const len = nativeRowRefs.current.size
        const measurements: Array<{ y: number; h: number }> = Array(len).fill({ y: 0, h: 0 })
        const promises = Array.from({ length: len }, (_, i) => new Promise<void>((resolve) => {
            const ref = nativeRowRefs.current.get(i)
            if (!ref) { resolve(); return }
            ref.measureInWindow((_x, y, _w, h) => { measurements[i] = { y, h }; resolve() })
          })
        )
        Promise.all(promises).then(() => {
          const ni = computeInsertFromAbsoluteY(e.absoluteY, measurements)
          insertIdxRef.current = ni
          setInsertIdx(ni)
          // Store for onUpdate
          ;(makeNativeGesture as unknown as { _meas: typeof measurements })._meas = measurements
        })
      })
      .onUpdate((e) => {
        const meas = (makeNativeGesture as unknown as { _meas: Array<{ y: number; h: number }> })._meas
        if (!meas) return
        const ni = computeInsertFromAbsoluteY(e.absoluteY, meas)
        insertIdxRef.current = ni
        setInsertIdx(ni)
      })
      .onEnd(() => commitReorder())
      .onFinalize(() => {
        if (draggingIdxRef.current !== null) {
          draggingIdxRef.current = null
          insertIdxRef.current = null
          setDraggingIdx(null)
          setInsertIdx(null)
        }
      })
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#F5F5F5' }}>
      {orderedTasks.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-2 p-8">
          <Text className="text-sm text-gray-400">No tasks due today.</Text>
        </View>
      ) : (
        <>
          {/* ── Fixed header ─────────────────────────────────────── */}
          <View>
            <View className="bg-white mx-4 mt-4 rounded-2xl p-6 items-center" style={{ gap: 12 }}>
              <Text style={{ fontSize: 56, fontWeight: '800', color: '#1f2937', letterSpacing: 1 }}>
                {fmtClock(currentSeconds)}
              </Text>
              <Text className="text-base font-semibold text-center" style={{ color: '#222' }}>
                {currentTask?.content}
              </Text>
              <View className="flex-row items-center" style={{ gap: 8 }}>
                <View className="rounded-full px-3 py-1" style={{ backgroundColor: '#EEF2FF' }}>
                  <Text className="text-xs font-medium" style={{ color: BLUE }}>
                    Est. {currentEntry?.estimateMin ?? DEFAULT_ESTIMATE}m
                  </Text>
                </View>
                {currentTask && currentTask.priority > 0 && currentTask.priority <= 10 && (
                  <View className="rounded-full px-3 py-1" style={{ backgroundColor: priorityRowBg(currentTask.priority) ?? '#f3f4f6' }}>
                    <Text className="text-xs font-bold" style={{ color: priorityTextColor(currentTask.priority) }}>
                      {priorityDisplay(currentTask.priority)}
                    </Text>
                  </View>
                )}
              </View>
              {onJumpToRaw && currentTask && (
                <Pressable hitSlop={8} onPress={() => onJumpToRaw(currentTask.id)} className="flex-row items-center gap-1" style={{ opacity: 0.6 }}>
                  <ExternalLink size={13} color="#6B7280" />
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>Jump to Raw</Text>
                </Pressable>
              )}
              <View className="flex-row items-center justify-center mt-2" style={{ gap: 20 }}>
                <Pressable hitSlop={8} onPress={resetCurrent}><RotateCcw size={24} color="#9ca3af" /></Pressable>
                <Pressable hitSlop={8} onPress={() => adjust(-ESTIMATE_STEP)}><Minus size={28} color="#666" /></Pressable>
                <Pressable onPress={togglePlay} className="items-center justify-center rounded-full" style={{ width: 64, height: 64, backgroundColor: '#1f2937' }}>
                  {isRunning ? <Pause size={28} color="white" /> : <Play size={28} color="white" />}
                </Pressable>
                <Pressable hitSlop={8} onPress={() => adjust(ESTIMATE_STEP)}><Plus size={28} color="#666" /></Pressable>
                <Pressable hitSlop={8} onPress={complete} className="items-center justify-center rounded-full" style={{ width: 40, height: 40, backgroundColor: '#1f2937' }}>
                  <Check size={22} color="white" />
                </Pressable>
              </View>
            </View>

            <View className="mx-4 mt-4" style={{ gap: 10 }}>
              <View style={{ gap: 4 }}>
                <View className="flex-row justify-between">
                  <Text className="text-xs font-medium" style={{ color: '#6B7280' }}>Tasks done</Text>
                  <Text className="text-xs font-semibold" style={{ color: '#374151' }}>{completedCount}/{orderedTasks.length}</Text>
                </View>
                <View className="rounded-full overflow-hidden" style={{ height: 8, backgroundColor: '#E5E7EB' }}>
                  <View className="rounded-full" style={{ height: 8, backgroundColor: '#22C55E', width: orderedTasks.length > 0 ? `${Math.round((completedCount / orderedTasks.length) * 100)}%` : '0%' }} />
                </View>
              </View>
              <View style={{ gap: 4 }}>
                <View className="flex-row justify-between">
                  <Text className="text-xs font-medium" style={{ color: '#6B7280' }}>Time spent</Text>
                  <Text className="text-xs font-semibold" style={{ color: '#374151' }}>{fmtMins(totalActualSeconds)}/{fmtMins(totalEstimateSeconds)}</Text>
                </View>
                <View className="rounded-full overflow-hidden" style={{ height: 8, backgroundColor: '#E5E7EB' }}>
                  <View className="rounded-full" style={{ height: 8, backgroundColor: totalActualSeconds > totalEstimateSeconds ? '#EF4444' : BLUE, width: totalEstimateSeconds > 0 ? `${Math.min(Math.round((totalActualSeconds / totalEstimateSeconds) * 100), 100)}%` : '0%' }} />
                </View>
              </View>
            </View>
          </View>

          {/* ── Scrollable task sequence ─────────────────────────── */}
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}
            scrollEnabled={draggingIdx === null}
          >
            {orderedTasks.map((t, index) => {
              const entry = getEntry(t.id)
              const isDone = !!entry?.completedAt
              const isCurrent = index === currentIndex
              const isDragging = draggingIdx === index
              const showDropBefore = insertIdx !== null && insertIdx === index && draggingIdx !== null && draggingIdx !== index && draggingIdx !== index - 1

              const cardInner = (
                <Pressable
                  onPress={() => { if (draggingIdx === null) { jumpTo(index); onJumpToRaw?.(t.id) } }}
                  className="flex-row items-center bg-white rounded-xl px-3 py-3"
                  style={{ gap: 10, borderWidth: isCurrent ? 2 : 1, borderColor: isCurrent ? BLUE : '#F0F0F0', opacity: isDragging ? 0.35 : 1 }}
                >
                  {Platform.OS === 'web' ? (
                    <div onPointerDown={(e) => onGripPointerDown(e, index)} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', padding: 2 }}>
                      <GripVertical size={16} color="#D1D5DB" />
                    </div>
                  ) : (
                    <GestureDetector gesture={makeNativeGesture(index)}>
                      <View hitSlop={8} style={{ padding: 2 }}>
                        <GripVertical size={16} color="#D1D5DB" />
                      </View>
                    </GestureDetector>
                  )}
                  {isDone ? <CheckCircle2 size={20} color="#22c55e" /> : <Circle size={20} color="#d1d5db" />}
                  <View className="flex-1">
                    <Text style={{ fontSize: 14, color: isDone ? '#9ca3af' : '#1a1a1a', textDecorationLine: isDone ? 'line-through' : 'none', fontWeight: isCurrent ? '600' : '400' }} numberOfLines={1}>
                      {t.content}
                    </Text>
                  </View>
                  {t.priority > 0 && t.priority <= 10 && (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: priorityTextColor(t.priority) }}>{priorityDisplay(t.priority)}</Text>
                  )}
                  <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                    {(() => {
                      const k = entryKey(checklistId, t.id)
                      const s = entry ? liveSeconds(entry, timerRunningKey, timerStartedAt, k) : 0
                      return isDone || s > 0 ? fmtMins(s) : `${entry?.estimateMin ?? DEFAULT_ESTIMATE}m`
                    })()}
                  </Text>
                </Pressable>
              )

              if (Platform.OS === 'web') {
                return (
                  <div key={t.id} data-execute-idx={index} ref={(el) => { if (el) cardDomRefs.current.set(index, el); else cardDomRefs.current.delete(index) }} style={{ marginTop: 8 }}>
                    {showDropBefore && <div style={{ height: 2, backgroundColor: BLUE, borderRadius: 1, marginBottom: 6 }} />}
                    {cardInner}
                  </div>
                )
              }

              return (
                <View key={t.id} ref={(r) => { if (r) nativeRowRefs.current.set(index, r); else nativeRowRefs.current.delete(index) }} style={{ marginTop: 8 }}>
                  {showDropBefore && <View style={{ height: 2, backgroundColor: BLUE, borderRadius: 1, marginBottom: 6 }} />}
                  {cardInner}
                </View>
              )
            })}

            {/* Drop indicator at end */}
            {insertIdx === orderedTasks.length && draggingIdx !== null && draggingIdx !== orderedTasks.length - 1 && (
              <View style={{ height: 2, backgroundColor: BLUE, borderRadius: 1, marginHorizontal: 4, marginTop: 10 }} />
            )}
          </ScrollView>
        </>
      )}
    </View>
  )
}
