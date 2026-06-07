import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  View, Text, Pressable, ScrollView, useWindowDimensions,
  ActivityIndicator, Modal,
} from 'react-native'
import { Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Play } from 'lucide-react-native'
import { format, addDays, subDays, isToday, isFuture } from 'date-fns'
import { useRoutineStore } from './useRoutineStore'
import { useRoutineSystem } from './useRoutineSystem'
import { RoutineDetailView } from './RoutineDetailView'
import { RoutineEditSheet } from './RoutineEditSheet'
import { TimerModeView } from './TimerModeView'
import { ROUTINE_COLORS } from './routineTypes'
import type { RoutineDef, RoutineStep } from './routineTypes'

const BLUE = '#4772FA'
const FAILURE_RED = '#DC2626'
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ─── Streak helpers ───────────────────────────────────────────────────────────

function computeStepStats(
  stepId: string,
  scheduledDays: number[],
  allLogs: { date: string; completedStepIds: string[] }[],
) {
  const doneDates = new Set(
    allLogs.filter((l) => l.completedStepIds.includes(stepId)).map((l) => l.date),
  )
  const totalDone = doneDates.size

  // Current streak: walk backward from yesterday counting consecutive scheduled-and-done days
  let currentStreak = 0
  let cursor = new Date()
  cursor.setDate(cursor.getDate() - 1) // start from yesterday; today counts once done
  for (let i = 0; i < 730; i++) {
    const dow = cursor.getDay()
    const ds = format(cursor, 'yyyy-MM-dd')
    const isScheduled = scheduledDays.length === 0 || scheduledDays.includes(dow)
    if (!isScheduled) {
      cursor = addDays(cursor, -1)
      continue
    }
    if (doneDates.has(ds)) {
      currentStreak++
      cursor = addDays(cursor, -1)
    } else {
      break
    }
  }
  // If today is also done, add 1
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  if (doneDates.has(todayStr)) currentStreak++

  return { totalDone, currentStreak }
}

// ─── DayColumn header ─────────────────────────────────────────────────────────

interface DayColHeaderProps {
  date: Date
  completionFraction: number // 0‥1
  doneCount: number
  totalCount: number
  colWidth: number
  selected?: boolean
}

function DayColHeader({ date, completionFraction, doneCount, totalCount, colWidth, selected }: DayColHeaderProps) {
  const today = isToday(date)
  const future = isFuture(date) && !today
  const R = 15 // circle radius
  const C = 2 * R

  const activeColor = selected ? BLUE : today ? BLUE : '#374151'
  return (
    <View style={{ width: colWidth, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: activeColor }}>
        {format(date, 'd')}
      </Text>
      {/* SVG-like progress ring using a View trick */}
      <View style={{
        width: C, height: C, borderRadius: R,
        borderWidth: 2.5,
        borderColor: future ? '#E5E7EB' : completionFraction === 1 ? BLUE : FAILURE_RED,
        opacity: future ? 0.4 : 1,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {!future && completionFraction > 0 && completionFraction < 1 && (
          // Partial fill using a clip trick
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${Math.round(completionFraction * 100)}%`,
            backgroundColor: FAILURE_RED,
            opacity: 0.15,
          }} />
        )}
        <Text style={{ fontSize: 8, color: future ? '#9CA3AF' : completionFraction === 1 ? BLUE : FAILURE_RED, fontWeight: '700' }}>
          {doneCount}/{totalCount}
        </Text>
      </View>
    </View>
  )
}

// ─── HabitCircle ─────────────────────────────────────────────────────────────

interface HabitCircleProps {
  done: boolean
  scheduled: boolean
  future: boolean
  selected: boolean
  accentColor: string
  onPress: () => void
  size: number
}

function HabitCircle({ done, scheduled, future, selected, accentColor, onPress, size }: HabitCircleProps) {
  const inactiveBorder = scheduled ? FAILURE_RED : '#E5E7EB'
  const selectedBg = selected ? '#EEF2FF' : 'transparent'

  return (
    <Pressable
      onPress={future ? undefined : onPress}
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: done ? accentColor : selectedBg,
        borderWidth: 2,
        borderColor: done ? accentColor : future ? '#E5E7EB' : inactiveBorder,
        alignItems: 'center', justifyContent: 'center',
        opacity: future ? 0.5 : 1,
      }}
    >
      {done && <Text style={{ color: '#fff', fontSize: size * 0.45, fontWeight: '700' }}>✓</Text>}
      {!done && !future && scheduled && <Text style={{ color: FAILURE_RED, fontSize: size * 0.5, fontWeight: '700' }}>✕</Text>}
    </Pressable>
  )
}

// ─── HabitRow ─────────────────────────────────────────────────────────────────

interface HabitRowProps {
  step: RoutineStep
  routine: RoutineDef
  visibleDates: Date[]
  selectedDate: Date
  colWidth: number
  circleSize: number
  onToggle: (stepId: string, date: string) => void
  checkinsByDate: Record<string, string[]> // date → completedStepIds
}

function HabitRow({ step, routine, visibleDates, selectedDate, colWidth, circleSize, onToggle, checkinsByDate }: HabitRowProps) {
  const accentColor = ROUTINE_COLORS[routine.color]
  const allLogs = Object.entries(checkinsByDate).map(([date, completedStepIds]) => ({ date, completedStepIds }))
  const { totalDone, currentStreak } = useMemo(
    () => computeStepStats(step.id, step.scheduledDays, allLogs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step.id, step.scheduledDays, JSON.stringify(checkinsByDate)],
  )

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 10, paddingHorizontal: 16,
      backgroundColor: '#fff',
      borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
    }}>
      {/* Emoji icon */}
      <View style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: accentColor + '20',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 10,
      }}>
        <Text style={{ fontSize: 20 }}>{step.emoji}</Text>
      </View>

      {/* Name + stats */}
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }} numberOfLines={1}>
          {step.name}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
            ⚡{totalDone}d
          </Text>
          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
            🔥{currentStreak}d
          </Text>
        </View>
      </View>

      {/* Date circles */}
      <View style={{ flexDirection: 'row', gap: 0 }}>
        {visibleDates.map((date) => {
          const ds = format(date, 'yyyy-MM-dd')
          const dow = date.getDay()
          const isScheduled = step.scheduledDays.length === 0 || step.scheduledDays.includes(dow)
          const isDone = (checkinsByDate[ds] ?? []).includes(step.id)
          const future = isFuture(date) && !isToday(date)
          const isSelected = ds === format(selectedDate, 'yyyy-MM-dd')
          return (
            <View
              key={ds}
              style={{
                width: colWidth,
                alignItems: 'center',
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: isSelected ? '#F3F4F6' : 'transparent',
              }}
            >
              <HabitCircle
                done={isDone}
                scheduled={isScheduled}
                future={future}
                selected={isSelected}
                accentColor={accentColor}
                onPress={() => onToggle(step.id, ds)}
                size={circleSize}
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ─── RoutineGroup ─────────────────────────────────────────────────────────────

interface RoutineGroupProps {
  routine: RoutineDef
  visibleDates: Date[]
  selectedDate: Date
  showOnlyPending: boolean
  colWidth: number
  circleSize: number
  onToggle: (stepId: string, date: string) => void
  checkins: { date: string; completedStepIds: string[] }[]
  onEdit: () => void
  onDelete: () => void
}

function RoutineGroup({
  routine, visibleDates, selectedDate, showOnlyPending, colWidth, circleSize,
  onToggle, checkins, onEdit, onDelete,
}: RoutineGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const accentColor = ROUTINE_COLORS[routine.color]

  // Build date → completedStepIds map
  const checkinsByDate: Record<string, string[]> = {}
  for (const c of checkins) checkinsByDate[c.date] = c.completedStepIds

  const selectedDs = format(selectedDate, 'yyyy-MM-dd')
  const selectedDow = selectedDate.getDay()
  const filteredSteps = showOnlyPending
    ? routine.steps.filter((step) => {
      const isScheduled = step.scheduledDays.length === 0 || step.scheduledDays.includes(selectedDow)
      if (!isScheduled) return false
      const isDone = (checkinsByDate[selectedDs] ?? []).includes(step.id)
      return !isDone
    })
    : routine.steps

  if (filteredSteps.length === 0) return null

  return (
    <View style={{ marginBottom: 8 }}>
      {/* Group header */}
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 10,
          backgroundColor: '#F9FAFB',
          borderTopWidth: 1, borderTopColor: '#EFEFEF',
        }}
      >
        {collapsed
          ? <ChevronRightIcon size={14} color={accentColor} />
          : <ChevronDown size={14} color={accentColor} />
        }
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accentColor, marginHorizontal: 8 }} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#111' }}>
          {routine.name}
        </Text>
        <Text style={{
          fontSize: 12, fontWeight: '600', color: '#fff',
          backgroundColor: accentColor, borderRadius: 10,
          paddingHorizontal: 7, paddingVertical: 2, marginRight: 8,
        }}>
          {filteredSteps.length}
        </Text>
        <Pressable onPress={onEdit} hitSlop={8} style={{ marginRight: 8 }}>
          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>Edit</Text>
        </Pressable>
      </Pressable>

      {!collapsed && filteredSteps.map((step) => (
        <HabitRow
          key={step.id}
          step={step}
          routine={routine}
          visibleDates={visibleDates}
          selectedDate={selectedDate}
          colWidth={colWidth}
          circleSize={circleSize}
          onToggle={onToggle}
          checkinsByDate={checkinsByDate}
        />
      ))}
    </View>
  )
}

// ─── RoutinesView ─────────────────────────────────────────────────────────────

interface RoutinesViewProps {
  checklistId: number
}

export function RoutinesView({ checklistId: _checklistId }: RoutinesViewProps) {
  const { width } = useWindowDimensions()
  const isMobile = width < 768

  const { routines, checkins, loading, activeTimer, loadRoutines, toggleStep, startQueue, getTodayCheckin } = useRoutineStore()
  const { saveRoutineDef, deleteRoutineDef } = useRoutineSystem()

  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day')
  const [showOnlyPending, setShowOnlyPending] = useState(false)
  const [editingRoutine, setEditingRoutine] = useState<RoutineDef | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  // Compute pending step counts for today per routine
  const todayPending = useMemo(() => {
    const result: Record<number, number> = {}
    for (const r of routines) {
      const checkin = getTodayCheckin(r.taskId)
      const completed = checkin?.completedStepIds ?? []
      result[r.taskId] = r.steps.filter((s) => !completed.includes(s.id)).length
    }
    return result
  }, [routines, checkins, getTodayCheckin])

  const totalPending = useMemo(() => Object.values(todayPending).reduce((s, n) => s + n, 0), [todayPending])

  const routinesWithPending = useMemo(() => routines.filter((r) => (todayPending[r.taskId] ?? 0) > 0), [routines, todayPending])

  const handleGlobalStart = () => {
    if (routinesWithPending.length === 0) return
    startQueue(routinesWithPending)
  }

  useEffect(() => { loadRoutines() }, [loadRoutines])

  // 7 days: ±3 days around selectedDate (same style as log tab)
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(selectedDate, i - 3))
  }, [selectedDate])

  // Per-day overall completion stats across all routines
  const dayStats = useMemo(() => {
    return weekDates.map((date) => {
      const ds = format(date, 'yyyy-MM-dd')
      const dow = date.getDay()
      let total = 0
      let done = 0
      for (const r of routines) {
        for (const step of r.steps) {
          const isScheduled = step.scheduledDays.length === 0 || step.scheduledDays.includes(dow)
          if (!isScheduled) continue
          total++
          const log = (checkins[r.taskId] ?? []).find((c) => c.date === ds)
          if (log?.completedStepIds.includes(step.id)) done++
        }
      }
      const completionFraction = total === 0 ? 0 : done / total
      return { done, total, completionFraction }
    })
  }, [weekDates, routines, checkins])

  const selectedDayStat = dayStats[3] ?? { done: 0, total: 0, completionFraction: 0 }
  const visibleDates = viewMode === 'week' ? weekDates : [selectedDate]

  const handleToggle = useCallback(async (routine: RoutineDef, stepId: string, date: string) => {
    await toggleStep(routine, stepId, date)
  }, [toggleStep])

  const handleSave = async (def: Omit<RoutineDef, 'taskId'>) => {
    const existingId = editingRoutine !== 'new' ? editingRoutine?.taskId : undefined
    await saveRoutineDef(def, existingId)
    await loadRoutines()
    setEditingRoutine(null)
  }

  const handleDelete = async (taskId: number) => {
    setConfirmDelete(null)
    await deleteRoutineDef(taskId)
    await loadRoutines()
  }

  // Column sizing: 7 circles need to fit after the left section
  // Left section is ~190px on desktop, flexible on mobile
  const CIRCLE = isMobile ? 22 : 26
  const COL = isMobile ? 32 : 38


  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>

      {/* ── Week navigation ── */}
      <View style={{
        backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#EFEFEF',
      }}>
        {/* Nav row — mirrors log tab date selector */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 12, paddingVertical: 8,
        }}>
          <Pressable onPress={() => setSelectedDate(d => subDays(d, 1))} style={{ padding: 4, marginRight: 2 }}>
            <ChevronLeft size={16} color="#374151" />
          </Pressable>
          <Pressable onPress={() => setSelectedDate(new Date())} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>Routines</Text>
            <Text style={{ fontSize: 11, color: isToday(selectedDate) ? BLUE : '#6B7280' }}>
              {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, MMMM d')}
            </Text>
          </Pressable>
          <Pressable onPress={() => setSelectedDate(d => addDays(d, 1))} style={{ padding: 4, marginLeft: 2 }}>
            <ChevronRight size={16} color="#374151" />
          </Pressable>

          {/* Global start timer */}
          {totalPending > 0 && !activeTimer && (
            <Pressable
              onPress={handleGlobalStart}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 12, paddingVertical: 7,
                backgroundColor: BLUE, borderRadius: 20,
                marginLeft: 8,
              }}
            >
              <Play size={12} color="#fff" fill="#fff" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
                Start · {totalPending}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Single-line toggle strip */}
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <View style={{
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
            <View style={{
              flexDirection: 'row',
              backgroundColor: '#F3F4F6',
              borderRadius: 12,
              padding: 3,
              gap: 4,
            }}>
              <Pressable
                onPress={() => setViewMode('day')}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 9,
                  backgroundColor: viewMode === 'day' ? '#fff' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: viewMode === 'day' ? '#111827' : '#6B7280' }}>
                  Day
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('week')}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 9,
                  backgroundColor: viewMode === 'week' ? '#fff' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: viewMode === 'week' ? '#111827' : '#6B7280' }}>
                  Week
                </Text>
              </Pressable>
            </View>

            <View style={{
              flexDirection: 'row',
              backgroundColor: '#F3F4F6',
              borderRadius: 12,
              padding: 3,
              gap: 4,
            }}>
              <Pressable
                onPress={() => setShowOnlyPending(false)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 9,
                  backgroundColor: !showOnlyPending ? '#fff' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: !showOnlyPending ? '#111827' : '#6B7280' }}>
                  Show All
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowOnlyPending(true)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 9,
                  backgroundColor: showOnlyPending ? '#fff' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: showOnlyPending ? '#111827' : '#6B7280' }}>
                  Only Pending
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {viewMode === 'week' ? (
          /* 7-day strip — tap to select date */
          <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingBottom: 8 }}>
            {weekDates.map((date, i) => {
              const ds = format(date, 'yyyy-MM-dd')
              const isSelected = ds === format(selectedDate, 'yyyy-MM-dd')
              return (
                <Pressable key={ds} onPress={() => setSelectedDate(date)} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 9, color: isSelected ? BLUE : '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' }}>
                    {isToday(date) ? 'Today' : format(date, 'EEE')}
                  </Text>
                  <DayColHeader
                    date={date}
                    completionFraction={dayStats[i].completionFraction}
                    doneCount={dayStats[i].done}
                    totalCount={dayStats[i].total}
                    colWidth={COL}
                    selected={isSelected}
                  />
                </Pressable>
              )
            })}
          </View>
        ) : (
          /* Day summary strip */
          <View style={{
            paddingHorizontal: 12,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '600' }}>
              Items for {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEE, MMM d')}
            </Text>
            <Text style={{ fontSize: 12, color: '#111827', fontWeight: '700' }}>
              {selectedDayStat.done}/{selectedDayStat.total}
            </Text>
          </View>
        )}
      </View>

      {/* ── Body ── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      ) : routines.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
          <Text style={{ fontSize: 48 }}>🔁</Text>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#374151', textAlign: 'center' }}>
            No routines yet
          </Text>
          <Text style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center' }}>
            Tap + to add your first routine and its habits
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {routines.map((routine) => (
            <RoutineGroup
              key={routine.taskId}
              routine={routine}
              visibleDates={visibleDates}
              selectedDate={selectedDate}
              showOnlyPending={showOnlyPending}
              colWidth={COL}
              circleSize={CIRCLE}
              checkins={checkins[routine.taskId] ?? []}
              onToggle={(stepId, date) => handleToggle(routine, stepId, date)}
              onEdit={() => setEditingRoutine(routine)}
              onDelete={() => setConfirmDelete(routine.taskId)}
            />
          ))}
        </ScrollView>
      )}

      {/* FAB */}
      <Pressable
        onPress={() => setEditingRoutine('new')}
        style={{
          position: 'absolute', right: isMobile ? 20 : 24, bottom: isMobile ? 80 : 24,
          width: 54, height: 54, borderRadius: 27, backgroundColor: BLUE,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: BLUE, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8, zIndex: 10,
        }}
      >
        <Plus size={26} color="#fff" />
      </Pressable>

      {/* Edit / Create sheet */}
      {editingRoutine !== null && (
        <RoutineEditSheet
          initial={editingRoutine === 'new' ? null : editingRoutine}
          isMobile={isMobile}
          onClose={() => setEditingRoutine(null)}
          onSave={handleSave}
        />
      )}

      {/* Timer mode overlay */}
      {activeTimer && <TimerModeView />}

      {/* Delete confirmation */}
      <Modal
        visible={confirmDelete !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 8 }}>Delete Routine?</Text>
            <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 24 }}>
              This will remove the routine and all its habits. Check-in history will also be removed.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => setConfirmDelete(null)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' }}
              >
                <Text style={{ fontWeight: '600', color: '#374151' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete !== null && handleDelete(confirmDelete)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#EF4444', alignItems: 'center' }}
              >
                <Text style={{ fontWeight: '600', color: '#fff' }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}
