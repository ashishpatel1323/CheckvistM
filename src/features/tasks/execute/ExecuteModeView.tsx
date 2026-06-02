import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native'
import { X, Play, Pause, Minus, Plus, Check, RotateCcw, Circle, CheckCircle2 } from 'lucide-react-native'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate } from '@/lib/dateSort'
import {
  useExecuteLog,
  entryKey,
  DEFAULT_ESTIMATE,
  ESTIMATE_STEP,
  type ExecuteLogEntry,
} from './useExecuteLog'

const BLUE = '#4772FA'

interface ExecuteModeViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  onClose: () => void
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

export function ExecuteModeView({ tasks, checklistId, onClose }: ExecuteModeViewProps) {
  const todayTasks = useMemo(() => {
    const { allNodes } = buildTaskTree(tasks)
    const groups = groupTasksByDate(allNodes)
    return groups.find((g) => g.group === 'today')?.tasks ?? []
  }, [tasks])

  const { entries, seed, setEstimate, markStarted, addElapsed, markCompleted, reset } = useExecuteLog()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Seed an entry for every task (estimate from duration tag, else default).
  useEffect(() => {
    for (const t of todayTasks) {
      seed(entryKey(checklistId, t.id), t.id, t.duration?.minutes ?? DEFAULT_ESTIMATE)
    }
  }, [todayTasks, checklistId, seed])

  const currentTask = todayTasks[currentIndex]
  const currentKey = currentTask ? entryKey(checklistId, currentTask.id) : null

  // Tick the running timer once per second.
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (isRunning && currentKey) {
      intervalRef.current = setInterval(() => addElapsed(currentKey, 1), 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning, currentKey, addElapsed])

  const getEntry = (taskId: number): ExecuteLogEntry | undefined =>
    entries[entryKey(checklistId, taskId)]

  const currentEntry = currentTask ? getEntry(currentTask.id) : undefined

  const completedCount = todayTasks.filter((t) => getEntry(t.id)?.completedAt).length
  const totalActualSeconds = todayTasks.reduce((sum, t) => sum + (getEntry(t.id)?.actualSeconds ?? 0), 0)

  const togglePlay = () => {
    if (!currentKey) return
    if (!isRunning) markStarted(currentKey)
    setIsRunning((v) => !v)
  }

  const adjust = (delta: number) => {
    if (!currentKey || !currentEntry) return
    setEstimate(currentKey, currentEntry.estimateMin + delta)
  }

  const complete = () => {
    if (!currentKey) return
    markCompleted(currentKey)
    setIsRunning(false)
    if (currentIndex < todayTasks.length - 1) setCurrentIndex((i) => i + 1)
  }

  const resetCurrent = () => {
    if (!currentKey) return
    reset(currentKey)
    setIsRunning(false)
  }

  const jumpTo = (index: number) => {
    setIsRunning(false)
    setCurrentIndex(index)
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: '#F5F5F5' }}>
        {/* Header */}
        <View
          className="flex-row items-center bg-white px-4"
          style={{
            paddingTop: Platform.OS === 'android' ? 44 : 52,
            paddingBottom: 14,
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#EFEFEF',
          }}
        >
          <Pressable hitSlop={8} onPress={onClose}>
            <X size={22} color="#333" />
          </Pressable>
          <Text className="text-base font-semibold" style={{ color: '#222' }}>
            Execute · Today
          </Text>
        </View>

        {todayTasks.length === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 p-8">
            <Text className="text-sm text-gray-400">No tasks due today.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {/* Current task card */}
            <View className="bg-white mx-4 mt-4 rounded-2xl p-6 items-center" style={{ gap: 12 }}>
              <Text style={{ fontSize: 56, fontWeight: '800', color: '#1f2937', letterSpacing: 1 }}>
                {fmtClock(currentEntry?.actualSeconds ?? 0)}
              </Text>
              <Text className="text-base font-semibold text-center" style={{ color: '#222' }}>
                {currentTask?.content}
              </Text>
              <View className="rounded-full px-3 py-1" style={{ backgroundColor: '#EEF2FF' }}>
                <Text className="text-xs font-medium" style={{ color: BLUE }}>
                  Est. {currentEntry?.estimateMin ?? DEFAULT_ESTIMATE}m
                </Text>
              </View>

              {/* Controls */}
              <View className="flex-row items-center justify-center mt-2" style={{ gap: 20 }}>
                <Pressable hitSlop={8} onPress={resetCurrent}>
                  <RotateCcw size={24} color="#9ca3af" />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => adjust(-ESTIMATE_STEP)}>
                  <Minus size={28} color="#666" />
                </Pressable>
                <Pressable
                  onPress={togglePlay}
                  className="items-center justify-center rounded-full"
                  style={{ width: 64, height: 64, backgroundColor: '#1f2937' }}
                >
                  {isRunning ? <Pause size={28} color="white" /> : <Play size={28} color="white" />}
                </Pressable>
                <Pressable hitSlop={8} onPress={() => adjust(ESTIMATE_STEP)}>
                  <Plus size={28} color="#666" />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  onPress={complete}
                  className="items-center justify-center rounded-full"
                  style={{ width: 40, height: 40, backgroundColor: '#1f2937' }}
                >
                  <Check size={22} color="white" />
                </Pressable>
              </View>
            </View>

            {/* Total summary */}
            <View className="mx-4 mt-4 rounded-xl px-4 py-2" style={{ backgroundColor: '#E5E7EB' }}>
              <Text className="text-center text-sm font-semibold" style={{ color: '#374151' }}>
                {completedCount}/{todayTasks.length} done · {fmtMins(totalActualSeconds)} spent
              </Text>
            </View>

            {/* Task sequence */}
            <View className="mx-4 mt-3" style={{ gap: 8 }}>
              {todayTasks.map((t, index) => {
                const entry = getEntry(t.id)
                const isDone = !!entry?.completedAt
                const isCurrent = index === currentIndex
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => jumpTo(index)}
                    className="flex-row items-center bg-white rounded-xl px-4 py-3"
                    style={{
                      gap: 12,
                      borderWidth: isCurrent ? 2 : 0,
                      borderColor: isCurrent ? BLUE : 'transparent',
                    }}
                  >
                    {isDone ? (
                      <CheckCircle2 size={22} color="#22c55e" />
                    ) : (
                      <Circle size={22} color="#d1d5db" />
                    )}
                    <View className="flex-1">
                      <Text
                        className="text-sm"
                        style={{
                          color: isDone ? '#9ca3af' : '#222',
                          textDecorationLine: isDone ? 'line-through' : 'none',
                          fontWeight: isCurrent ? '600' : '400',
                        }}
                        numberOfLines={2}
                      >
                        {t.content}
                      </Text>
                    </View>
                    <Text className="text-xs" style={{ color: '#9ca3af' }}>
                      {isDone || (entry?.actualSeconds ?? 0) > 0
                        ? fmtMins(entry?.actualSeconds ?? 0)
                        : `${entry?.estimateMin ?? DEFAULT_ESTIMATE}m`}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  )
}
