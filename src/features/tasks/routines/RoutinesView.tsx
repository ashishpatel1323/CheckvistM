import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  View, Text, Pressable, ScrollView, useWindowDimensions,
  ActivityIndicator, Modal, TextInput,
} from 'react-native'
import { Plus, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Play, Flame, Zap, Clock, CalendarDays, X as XIcon, AlertTriangle } from 'lucide-react-native'
import { format, addDays, subDays, isToday, isFuture, startOfMonth, endOfMonth, eachDayOfInterval, getDay, getDaysInMonth, parseISO } from 'date-fns'
import { useRoutineStore } from './useRoutineStore'
import { useRoutineSystem } from './useRoutineSystem'
import { RoutineDetailView } from './RoutineDetailView'
import { RoutineEditSheet } from './RoutineEditSheet'
import { ROUTINE_COLORS } from './routineTypes'
import type { RoutineDef, RoutineStep, HabitStatus } from './routineTypes'
import { getPendingRoutineStepIds, getStepStatus } from './routineSchedule'
import { HabitRowContent } from './HabitRowContent'
import { SwipeableHabitRow } from './SwipeableHabitRow'

export const BLUE = '#4772FA'
export const FAILURE_RED = '#DC2626'

// Dark red (0%) → amber (50%) → dark green (100%)
function completionColor(fraction: number): string {
  const f = Math.max(0, Math.min(1, fraction))
  if (f <= 0.5) {
    // red #B91C1C → amber #D97706
    const t = f * 2
    const r = Math.round(185 + t * (217 - 185))
    const g = Math.round(28  + t * (119 - 28))
    const b = Math.round(28  + t * (6   - 28))
    return `rgb(${r},${g},${b})`
  } else {
    // amber #D97706 → dark green #15803D
    const t = (f - 0.5) * 2
    const r = Math.round(217 + t * (21  - 217))
    const g = Math.round(119 + t * (128 - 119))
    const b = Math.round(6   + t * (61  - 6))
    return `rgb(${r},${g},${b})`
  }
}
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Returns 1-based rank of currentTime among (priorTimes ∪ currentTime) sorted ascending.
 *  priorTimes = up to last 10 logged times for this step, excluding the current date. */
export function computeTimeRank(currentTime: string, priorTimes: string[]): number {
  const all = [...priorTimes, currentTime].sort()
  return all.indexOf(currentTime) + 1
}

export function fmtTime12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

// ─── TimeEditModal ────────────────────────────────────────────────────────────

export function TimeEditModal({
  visible, initialTime, onSave, onClose,
}: { visible: boolean; initialTime: string; onSave: (hhmm: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initialTime)
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (visible) {
      setText(initialTime)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [visible, initialTime])

  function handleSave() {
    // Accept "H:MM", "HH:MM", "H:MMam/pm" etc.
    const cleaned = text.trim().toLowerCase()
    let match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/)
    if (!match) { onClose(); return }
    let h = parseInt(match[1], 10)
    const m = parseInt(match[2], 10)
    const meridiem = match[3]
    if (meridiem === 'pm' && h < 12) h += 12
    if (meridiem === 'am' && h === 12) h = 0
    if (h > 23 || m > 59) { onClose(); return }
    onSave(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 220, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 12 }}>Edit completion time</Text>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder="6:10 AM"
              style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 18, width: '100%', textAlign: 'center', color: '#111' }}
              keyboardType="default"
              returnKeyType="done"
              onSubmitEditing={handleSave}
              selectTextOnFocus
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <Pressable onPress={onClose} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: '#6B7280' }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#4772FA', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

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

export function getLast21ScheduledSuccesses(
  stepId: string,
  scheduledDays: number[],
  allLogs: { date: string; completedStepIds: string[] }[],
): number {
  const doneDates = new Set(
    allLogs.filter((l) => l.completedStepIds.includes(stepId)).map((l) => l.date),
  )
  let count = 0
  let successes = 0
  let cursor = new Date()
  for (let i = 0; count < 21 && i < 730; i++) {
    const dow = cursor.getDay()
    const ds = format(cursor, 'yyyy-MM-dd')
    const isScheduled = scheduledDays.length === 0 || scheduledDays.includes(dow)
    if (isScheduled) {
      count++
      if (doneDates.has(ds)) successes++
    }
    cursor = addDays(cursor, -1)
  }
  return successes
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
  const R = 15
  const C = 2 * R

  const ringColor = future ? '#E5E7EB' : completionColor(completionFraction)
  const activeColor = selected ? BLUE : today ? BLUE : '#374151'
  return (
    <View style={{ width: colWidth, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: activeColor }}>
        {format(date, 'd')}
      </Text>
      <View style={{
        width: C, height: C, borderRadius: R,
        borderWidth: 2.5,
        borderColor: ringColor,
        opacity: future ? 0.4 : 1,
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {!future && completionFraction > 0 && completionFraction < 1 && (
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: `${Math.round(completionFraction * 100)}%`,
            backgroundColor: ringColor,
            opacity: 0.15,
          }} />
        )}
        <Text style={{ fontSize: 8, color: future ? '#9CA3AF' : ringColor, fontWeight: '700' }}>
          {doneCount}/{totalCount}
        </Text>
      </View>
    </View>
  )
}

// ─── HabitCircle ─────────────────────────────────────────────────────────────

import type { HabitStatus } from './routineTypes'

export interface HabitCircleProps {
  status: HabitStatus
  selected: boolean
  accentColor: string
  onTap: () => void
  onLongPress?: () => void
  size: number
  rank?: number
}

export function HabitCircle({ status, selected, accentColor, onTap, onLongPress, size, rank }: HabitCircleProps) {
  const isDisabled = status === 'not_applicable'
  const selectedBg = selected && !isDisabled ? '#EEF2FF' : 'transparent'
  const badgeSize = Math.max(12, Math.round(size * 0.4))

  const bgColor = (() => {
    if (status === 'done') return accentColor
    if (status === 'failed') return FAILURE_RED
    if (status === 'not_applicable') return '#D1D5DB'
    return selectedBg
  })()

  const borderColor = (() => {
    if (status === 'done') return accentColor
    if (status === 'failed') return FAILURE_RED
    if (status === 'not_applicable') return '#D1D5DB'
    return '#E5E7EB'
  })()

  const icon = (() => {
    if (status === 'done') return '✓'
    if (status === 'failed') return '✕'
    if (status === 'not_applicable') return 'NA'
    return null
  })()

  return (
    <Pressable
      onPress={isDisabled ? undefined : onTap}
      onLongPress={isDisabled ? undefined : onLongPress}
      delayLongPress={500}
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: bgColor,
        borderWidth: 2,
        borderColor,
        alignItems: 'center', justifyContent: 'center',
        opacity: isDisabled ? 0.5 : 1,
      }}
    >
      {icon && (
        <Text
          style={{
            color: status === 'not_applicable' ? '#6B7280' : '#fff',
            fontSize: status === 'not_applicable' ? size * 0.35 : size * 0.45,
            fontWeight: '700',
          }}
        >
          {icon}
        </Text>
      )}
      {status === 'done' && rank === 1 && (
        <View style={{
          position: 'absolute',
          top: -size * 0.35,
          right: -size * 0.35,
        }}>
          <Text style={{ fontSize: size * 0.65 }}>⭐</Text>
        </View>
      )}
      {status === 'done' && rank != null && rank > 1 && (
        <View style={{
          position: 'absolute',
          top: -badgeSize * 0.4,
          right: -badgeSize * 0.4,
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: '#fff',
          borderWidth: 1.5,
          borderColor: accentColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Text style={{ fontSize: badgeSize * 0.56, fontWeight: '800', color: accentColor, lineHeight: badgeSize }}>
            {rank}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

// ─── HabitRow ─────────────────────────────────────────────────────────────────

export interface HabitRowProps {
  step: RoutineStep
  routine: RoutineDef
  visibleDates: Date[]
  selectedDate: Date
  colWidth: number
  circleSize: number
  onToggle: (stepId: string, date: string) => void
  checkinsByDate: Record<string, string[]> // date → completedStepIds
  failedByDate: Record<string, string[]> // date → failedStepIds
  completionTimeByDate: Record<string, string> // date → HH:MM
  onSelect?: () => void
  /** Tapping just the habit icon (mobile Day-view swipeable row uses this instead of full-row tap) */
  onIconPress?: () => void
  isSelected?: boolean
  onStartStep?: () => void
  onMarkFailed?: (stepId: string) => void
  onReset?: (stepId: string) => void
}

function HabitRow(props: HabitRowProps & { isMobile?: boolean }) {
  const { onSelect, isSelected, routine, visibleDates, isMobile } = props
  const accentColor = ROUTINE_COLORS[routine.color]

  // TickTick-style swipeable row: only the single-date "Day view" list, on mobile form factor
  // (works on mobile web and native — gated by screen width, not platform).
  if (isMobile && visibleDates.length === 1) {
    return <SwipeableHabitRow {...props} />
  }

  return (
    <Pressable
      onPress={onSelect}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 8, paddingHorizontal: 12,
        backgroundColor: isSelected ? BLUE + '08' : '#fff',
        borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
        borderLeftWidth: isSelected ? 3 : 0,
        borderLeftColor: isSelected ? accentColor : 'transparent',
      }}
    >
      <HabitRowContent {...props} />
    </Pressable>
  )
}

// ─── RoutineGroup ─────────────────────────────────────────────────────────────

type RoutineFilterMode = 'all' | 'pending' | 'failed'

interface RoutineGroupProps {
  routine: RoutineDef
  visibleDates: Date[]
  selectedDate: Date
  filterMode: RoutineFilterMode
  colWidth: number
  circleSize: number
  onToggle: (stepId: string, date: string) => void
  checkins: { date: string; completedStepIds: string[]; failedStepIds?: string[]; stepCompletionTimes?: Record<string, string> }[]
  onEdit: () => void
  onDelete: () => void
  selectedStepId?: string
  onSelectStep?: (stepId: string) => void
  onStartRoutine?: () => void
  onStartStep?: (stepId: string) => void
  onMarkFailed?: (stepId: string) => void
  onMarkAllFailed?: () => void
  onReset?: (stepId: string) => void
  isMobile?: boolean
}

function RoutineGroup({
  routine, visibleDates, selectedDate, filterMode, colWidth, circleSize,
  onToggle, checkins, onEdit, onDelete, selectedStepId, onSelectStep, onStartRoutine, onStartStep, onMarkFailed, onMarkAllFailed, onReset, isMobile,
}: RoutineGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const accentColor = ROUTINE_COLORS[routine.color]

  // Build date → completedStepIds, date → failedStepIds, and stepId → (date → HH:MM) maps
  const checkinsByDate: Record<string, string[]> = {}
  const failedByDate: Record<string, string[]> = {}
  const stepTimesByStep: Record<string, Record<string, string>> = {}  // stepId → date → HH:MM
  for (const c of checkins) {
    checkinsByDate[c.date] = c.completedStepIds
    failedByDate[c.date] = c.failedStepIds ?? []
    if (c.stepCompletionTimes) {
      for (const [stepId, time] of Object.entries(c.stepCompletionTimes)) {
        if (!stepTimesByStep[stepId]) stepTimesByStep[stepId] = {}
        stepTimesByStep[stepId][c.date] = time
      }
    }
  }

  const selectedDs = format(selectedDate, 'yyyy-MM-dd')
  const selectedDow = selectedDate.getDay()
  const filteredSteps = routine.steps.filter((step) => {
    const isDone = (checkinsByDate[selectedDs] ?? []).includes(step.id)
    const isFailed = (failedByDate[selectedDs] ?? []).includes(step.id)
    const status = getStepStatus(step, selectedDow, isDone, isFailed)

    if (filterMode === 'all') return true
    if (filterMode === 'pending') return status === 'pending'
    if (filterMode === 'failed') return status === 'failed'
    return false
  })

  if (filteredSteps.length === 0) return null

  const selectedPendingCount = routine.steps.filter((step) => {
    const isDone = (checkinsByDate[selectedDs] ?? []).includes(step.id)
    const isFailed = (failedByDate[selectedDs] ?? []).includes(step.id)
    return getStepStatus(step, selectedDow, isDone, isFailed) === 'pending'
  }).length

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
        {onMarkAllFailed && selectedPendingCount > 0 && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onMarkAllFailed() }}
            hitSlop={8}
            style={{
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: FAILURE_RED + '18',
              alignItems: 'center', justifyContent: 'center',
              marginRight: 8,
            }}
          >
            <AlertTriangle size={13} color={FAILURE_RED} />
          </Pressable>
        )}
        {onStartRoutine && (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onStartRoutine() }}
            hitSlop={8}
            style={{
              width: 26, height: 26, borderRadius: 13,
              backgroundColor: accentColor,
              alignItems: 'center', justifyContent: 'center',
              marginRight: 8,
            }}
          >
            <Play size={11} color="#fff" fill="#fff" />
          </Pressable>
        )}
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
          failedByDate={failedByDate}
          completionTimeByDate={stepTimesByStep[step.id] ?? {}}
          onSelect={onSelectStep ? () => onSelectStep(step.id) : undefined}
          isSelected={selectedStepId === step.id}
          onStartStep={onStartStep ? () => onStartStep(step.id) : undefined}
          onMarkFailed={onMarkFailed ? () => onMarkFailed(step.id) : undefined}
          onReset={onReset ? () => onReset(step.id) : undefined}
          isMobile={isMobile}
        />
      ))}
    </View>
  )
}

// ─── HabitDetailPanel ─────────────────────────────────────────────────────────

interface HabitDetailPanelProps {
  step: RoutineStep
  routine: RoutineDef
  checkins: { date: string; completedStepIds: string[]; stepCompletionTimes?: Record<string, string> }[]
  selectedDate: Date
}

function HabitDetailPanel({ step, routine, checkins, selectedDate }: HabitDetailPanelProps) {
  const getLast7CompletionTimes = useRoutineStore((s) => s.getLast7CompletionTimes)
  const [panelMonth, setPanelMonth] = useState(() => new Date())
  const accentColor = ROUTINE_COLORS[routine.color]

  const doneDates = useMemo(() => {
    const s = new Set<string>()
    for (const c of checkins) if (c.completedStepIds.includes(step.id)) s.add(c.date)
    return s
  }, [checkins, step.id])

  // date → HH:MM completion time for this step
  const timeByDate = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of checkins) {
      const t = c.stepCompletionTimes?.[step.id]
      if (t) m[c.date] = t
    }
    return m
  }, [checkins, step.id])

  const selectedDs = format(selectedDate, 'yyyy-MM-dd')
  const selectedCompletionTime = timeByDate[selectedDs]

  const { totalDone, currentStreak } = useMemo(() => {
    const allLogs = checkins.map((c) => ({ date: c.date, completedStepIds: c.completedStepIds }))
    return computeStepStats(step.id, step.scheduledDays, allLogs)
  }, [checkins, step.id, step.scheduledDays])

  const last21Successes = useMemo(() => {
    const allLogs = checkins.map((c) => ({ date: c.date, completedStepIds: c.completedStepIds }))
    return getLast21ScheduledSuccesses(step.id, step.scheduledDays, allLogs)
  }, [checkins, step.id, step.scheduledDays])

  // Monthly check-in rate
  const monthlyRate = useMemo(() => {
    const y = panelMonth.getFullYear()
    const m = panelMonth.getMonth()
    const today = new Date()
    const daysInMonth = getDaysInMonth(panelMonth)
    const daysPassed = (y === today.getFullYear() && m === today.getMonth())
      ? today.getDate()
      : daysInMonth
    let scheduled = 0; let done = 0
    for (let d = 1; d <= daysPassed; d++) {
      const date = new Date(y, m, d)
      const dow = date.getDay()
      if (step.scheduledDays.length > 0 && !step.scheduledDays.includes(dow)) continue
      scheduled++
      if (doneDates.has(format(date, 'yyyy-MM-dd'))) done++
    }
    return scheduled === 0 ? 0 : Math.round((done / scheduled) * 100)
  }, [panelMonth, doneDates, step.scheduledDays])

  const monthlyDone = useMemo(() => {
    const y = panelMonth.getFullYear(); const m = panelMonth.getMonth()
    return checkins.filter((c) => {
      const [cy, cm] = c.date.split('-').map(Number)
      return cy === y && cm - 1 === m && c.completedStepIds.includes(step.id)
    }).length
  }, [checkins, panelMonth, step.id])

  // Calendar grid
  const calDays = useMemo(() => {
    const start = startOfMonth(panelMonth)
    const end = endOfMonth(panelMonth)
    const days = eachDayOfInterval({ start, end })
    const leadingBlanks = getDay(start) // 0=Sun
    return { days, leadingBlanks }
  }, [panelMonth])

  const completionTimes = getLast7CompletionTimes(routine.taskId, step.id)
  const sortedTimes = [...completionTimes].sort()
  const usuallyText = sortedTimes.length === 0 ? null
    : sortedTimes.length === 1 ? fmtTime12(sortedTimes[0])
    : `${fmtTime12(sortedTimes[0])} – ${fmtTime12(sortedTimes[sortedTimes.length - 1])}`

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      {/* Habit header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: accentColor + '20', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 22 }}>{step.emoji}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>{step.name}</Text>
          <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{routine.name}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          { icon: <Zap size={14} color={accentColor} />, label: 'Last 21', value: `${last21Successes}/21` },
          { icon: <Flame size={14} color="#F97316" />, label: 'Streak', value: `${currentStreak}d` },
          { icon: <CalendarDays size={14} color={BLUE} />, label: 'This Month', value: `${monthlyDone}d` },
          { icon: <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>{monthlyRate}%</Text>, label: 'Check-in Rate', value: '' },
        ].map(({ icon, label, value }) => (
          <View key={label} style={{ flex: 1, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 10, gap: 4, borderWidth: 1, borderColor: '#F0F0F0' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{icon}</View>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>{value}</Text>
            <Text style={{ fontSize: 10, color: '#9CA3AF' }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Completed at — for the selected date */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {selectedCompletionTime ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: accentColor + '12', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: accentColor + '30' }}>
            <Clock size={14} color={accentColor} />
            <View>
              <Text style={{ fontSize: 10, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Completed at · {isToday(selectedDate) ? 'Today' : format(selectedDate, 'MMM d')}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '800', color: accentColor, marginTop: 1 }}>
                {fmtTime12(selectedCompletionTime)}
              </Text>
            </View>
          </View>
        ) : doneDates.has(selectedDs) ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#F0F0F0' }}>
            <Clock size={14} color="#9CA3AF" />
            <Text style={{ fontSize: 13, color: '#9CA3AF' }}>Done · no time recorded</Text>
          </View>
        ) : null}

        {/* Usually at */}
        {usuallyText && (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#F0F0F0' }}>
            <Clock size={14} color="#6B7280" />
            <View>
              <Text style={{ fontSize: 10, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Usually at</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151', marginTop: 1 }}>{usuallyText}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Monthly calendar */}
      <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#F0F0F0' }}>
        {/* Month nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Pressable onPress={() => setPanelMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} hitSlop={8}>
            <ChevronLeft size={16} color="#374151" />
          </Pressable>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111' }}>{format(panelMonth, 'MMMM yyyy')}</Text>
          <Pressable onPress={() => setPanelMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} hitSlop={8}>
            <ChevronRight size={16} color="#374151" />
          </Pressable>
        </View>
        {/* Day-of-week labels */}
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', color: '#9CA3AF' }}>{d}</Text>
          ))}
        </View>
        {/* Grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: calDays.leadingBlanks }).map((_, i) => (
            <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />
          ))}
          {calDays.days.map((date) => {
            const ds = format(date, 'yyyy-MM-dd')
            const done = doneDates.has(ds)
            const today = isToday(date)
            const future = isFuture(date) && !today
            const dow = date.getDay()
            const scheduled = step.scheduledDays.length === 0 || step.scheduledDays.includes(dow)
            const thisTime = timeByDate[ds]
            const rank = done && thisTime
              ? computeTimeRank(
                  thisTime,
                  Object.entries(timeByDate)
                    .filter(([d, t]) => d !== ds && t)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .slice(0, 10)
                    .map(([, t]) => t),
                )
              : undefined
            const badgeSize = 9
            return (
              <View key={ds} style={{ width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', padding: 2, paddingBottom: 4 }}>
                <View style={{
                  width: '80%', aspectRatio: 1, borderRadius: 100,
                  backgroundColor: done ? accentColor : today ? accentColor + '20' : 'transparent',
                  borderWidth: today ? 1.5 : 0,
                  borderColor: today ? accentColor : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                  opacity: future ? 0.3 : 1,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: done || today ? '700' : '400', color: done ? '#fff' : scheduled ? '#374151' : '#D1D5DB' }}>
                    {format(date, 'd')}
                  </Text>
                  {done && rank === 1 && (
                    <View style={{ position: 'absolute', top: -6, right: -6 }}>
                      <Text style={{ fontSize: 12 }}>⭐</Text>
                    </View>
                  )}
                  {done && rank != null && rank > 1 && (
                    <View style={{
                      position: 'absolute', top: -4, right: -4,
                      width: badgeSize, height: badgeSize, borderRadius: badgeSize / 2,
                      backgroundColor: '#fff', borderWidth: 1, borderColor: accentColor,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: badgeSize * 0.6, fontWeight: '800', color: accentColor, lineHeight: badgeSize }}>
                        {rank}
                      </Text>
                    </View>
                  )}
                </View>
                {done && timeByDate[ds] && (
                  <Text style={{ fontSize: 7, color: accentColor, fontWeight: '600', marginTop: 1, textAlign: 'center' }} numberOfLines={1}>
                    {fmtTime12(timeByDate[ds]).replace(' AM', 'a').replace(' PM', 'p')}
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      </View>

      {/* Recent completion times */}
      {completionTimes.length > 0 && (
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#F0F0F0' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 }}>Recent completion times</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...completionTimes].reverse().map((t, i) => (
              <View key={i} style={{ backgroundColor: accentColor + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: accentColor }}>{fmtTime12(t)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  )
}

// ─── RoutinesView ─────────────────────────────────────────────────────────────

interface RoutinesViewProps {
  checklistId: number
}

export function RoutinesView({ checklistId: _checklistId }: RoutinesViewProps) {
  const { width } = useWindowDimensions()
  const isMobile = width < 768

  const { routines, checkins, loading, activeTimer, loadRoutines, toggleStep, markStepFailed, markAllPendingFailed, resetStep, startQueue, startTimer, getTodayCheckin } = useRoutineStore()
  const { saveRoutineDef, deleteRoutineDef } = useRoutineSystem()

  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day')
  const [filterMode, setFilterMode] = useState<RoutineFilterMode>('pending')
  const [editingRoutine, setEditingRoutine] = useState<RoutineDef | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [confirmFailRoutine, setConfirmFailRoutine] = useState<{ taskId: number; date: string } | null>(null)
  const [selectedHabit, setSelectedHabit] = useState<{ routineTaskId: number; stepId: string } | null>(null)

  // Compute pending step counts for today per routine (excludes done and failed)
  const todayPending = useMemo(() => {
    const result: Record<number, number> = {}
    const todayDow = new Date().getDay()
    for (const r of routines) {
      const checkin = getTodayCheckin(r.taskId)
      const completed = checkin?.completedStepIds ?? []
      const failed = checkin?.failedStepIds ?? []
      result[r.taskId] = getPendingRoutineStepIds(r, completed, todayDow, failed).length
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
  // Last 7 days ending at today
  const today = useMemo(() => new Date(), [])
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i))
  }, [today])

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

  // Stats for whichever date is currently selected (done / failed / pending / total)
  const selectedDayStat = useMemo(() => {
    const ds = format(selectedDate, 'yyyy-MM-dd')
    const dow = selectedDate.getDay()
    let total = 0
    let done = 0
    let failed = 0
    for (const r of routines) {
      const log = (checkins[r.taskId] ?? []).find((c) => c.date === ds)
      for (const step of r.steps) {
        const isScheduled = step.scheduledDays.length === 0 || step.scheduledDays.includes(dow)
        if (!isScheduled) continue
        total++
        if (log?.completedStepIds.includes(step.id)) done++
        else if (log?.failedStepIds?.includes(step.id)) failed++
      }
    }
    return { done, failed, pending: total - done - failed, total, completionFraction: total === 0 ? 0 : done / total }
  }, [selectedDate, routines, checkins])

  const visibleDates = viewMode === 'week' ? weekDates : [selectedDate]

  const handleToggle = useCallback(async (routine: RoutineDef, stepId: string, date: string) => {
    await toggleStep(routine, stepId, date)
  }, [toggleStep])

  const handleMarkFailed = useCallback(async (routine: RoutineDef, stepId: string, date: string) => {
    await markStepFailed(routine, stepId, date)
  }, [markStepFailed])

  const handleReset = useCallback(async (routine: RoutineDef, stepId: string, date: string) => {
    await resetStep(routine, stepId, date)
  }, [resetStep])

  const handleMarkAllFailed = async (routine: RoutineDef, date: string) => {
    setConfirmFailRoutine(null)
    await markAllPendingFailed(routine, date)
  }

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

  // Day view on mobile gets a larger circle (single column, plenty of room)
  const CIRCLE = (isMobile && viewMode === 'day') ? 40 : isMobile ? 22 : 26
  const COL = (isMobile && viewMode === 'day') ? 60 : isMobile ? 32 : 38


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
              {([
                { mode: 'all', label: 'Show All' },
                { mode: 'pending', label: 'Only Pending' },
                { mode: 'failed', label: 'Failed' },
              ] as { mode: RoutineFilterMode; label: string }[]).map(({ mode, label }) => (
                <Pressable
                  key={mode}
                  onPress={() => setFilterMode(mode)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 9,
                    backgroundColor: filterMode === mode ? '#fff' : 'transparent',
                  }}
                >
                  <Text style={{
                    fontSize: 12, fontWeight: '700',
                    color: filterMode !== mode ? '#6B7280' : mode === 'failed' ? FAILURE_RED : '#111827',
                  }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {selectedDayStat.failed > 0 && (
                <Text style={{ fontSize: 12, color: FAILURE_RED, fontWeight: '700' }}>
                  ✕ {selectedDayStat.failed}
                </Text>
              )}
              <Text style={{ fontSize: 12, color: '#111827', fontWeight: '700' }}>
                {selectedDayStat.done}/{selectedDayStat.total}
              </Text>
            </View>
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
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Left: habit list */}
          <ScrollView
            style={!isMobile && selectedHabit ? { width: '55%' } : { flex: 1 }}
            contentContainerStyle={{ paddingBottom: 100 }}
          >
            {routines.map((routine) => (
              <RoutineGroup
                key={routine.taskId}
                routine={routine}
                visibleDates={visibleDates}
                selectedDate={selectedDate}
                filterMode={filterMode}
                colWidth={COL}
                circleSize={CIRCLE}
                checkins={checkins[routine.taskId] ?? []}
                onToggle={(stepId, date) => handleToggle(routine, stepId, date)}
                onEdit={() => setEditingRoutine(routine)}
                onDelete={() => setConfirmDelete(routine.taskId)}
                selectedStepId={selectedHabit?.routineTaskId === routine.taskId ? selectedHabit.stepId : undefined}
                onSelectStep={(stepId) => setSelectedHabit({ routineTaskId: routine.taskId, stepId })}
                onStartRoutine={!activeTimer && (todayPending[routine.taskId] ?? 0) > 0 ? () => startQueue([routine]) : undefined}
                onStartStep={!activeTimer ? (stepId) => {
                  const step = routine.steps.find((s) => s.id === stepId)
                  if (step) startTimer({ ...routine, steps: [step] })
                } : undefined}
                onMarkFailed={(stepId) => handleMarkFailed(routine, stepId, format(selectedDate, 'yyyy-MM-dd'))}
                onMarkAllFailed={() => setConfirmFailRoutine({ taskId: routine.taskId, date: format(selectedDate, 'yyyy-MM-dd') })}
                onReset={(stepId) => handleReset(routine, stepId, format(selectedDate, 'yyyy-MM-dd'))}
                isMobile={isMobile}
              />
            ))}
          </ScrollView>

          {/* Right: detail panel — desktop sidebar, mobile full-screen modal (web + native) */}
          {selectedHabit && (() => {
            const routine = routines.find((r) => r.taskId === selectedHabit.routineTaskId)
            const step = routine?.steps.find((s) => s.id === selectedHabit.stepId)
            if (!routine || !step) return null

            const panelContent = (
              <HabitDetailPanel
                step={step}
                routine={routine}
                checkins={checkins[routine.taskId] ?? []}
                selectedDate={selectedDate}
              />
            )

            if (isMobile) {
              return (
                <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setSelectedHabit(null)}>
                  <View style={{ flex: 1, backgroundColor: '#fff' }}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
                      borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
                    }}>
                      <Pressable onPress={() => setSelectedHabit(null)} hitSlop={8} style={{ marginRight: 12 }}>
                        <XIcon size={22} color="#6B7280" />
                      </Pressable>
                      <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: '#111' }}>
                        Habit Detail
                      </Text>
                    </View>
                    {panelContent}
                  </View>
                </Modal>
              )
            }

            return (
              <View style={{ width: '45%', borderLeftWidth: 1, borderLeftColor: '#EFEFEF', backgroundColor: '#FAFAFA' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EFEFEF', backgroundColor: '#fff' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151' }}>Habit Detail</Text>
                  <Pressable onPress={() => setSelectedHabit(null)} hitSlop={8}>
                    <Text style={{ fontSize: 18, color: '#9CA3AF' }}>×</Text>
                  </Pressable>
                </View>
                {panelContent}
              </View>
            )
          })()}
        </View>
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

      {/* Mark-all-failed confirmation */}
      <Modal
        visible={confirmFailRoutine !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmFailRoutine(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 }}>
            {(() => {
              if (!confirmFailRoutine) return null
              const routine = routines.find((r) => r.taskId === confirmFailRoutine.taskId)
              if (!routine) return null
              const checkin = (checkins[routine.taskId] ?? []).find((c) => c.date === confirmFailRoutine.date)
              const dow = parseISO(confirmFailRoutine.date).getDay()
              const pendingCount = getPendingRoutineStepIds(
                routine, checkin?.completedStepIds ?? [], dow, checkin?.failedStepIds ?? [],
              ).length
              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <AlertTriangle size={18} color={FAILURE_RED} />
                    <Text style={{ fontSize: 17, fontWeight: '700', color: '#111' }}>Mark items as failed?</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 24 }}>
                    {pendingCount} pending item{pendingCount !== 1 ? 's' : ''} in &quot;{routine.name}&quot; will be marked as failed for {confirmFailRoutine.date === format(new Date(), 'yyyy-MM-dd') ? 'today' : confirmFailRoutine.date}. This can&apos;t be undone automatically.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Pressable
                      onPress={() => setConfirmFailRoutine(null)}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center' }}
                    >
                      <Text style={{ fontWeight: '600', color: '#374151' }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleMarkAllFailed(routine, confirmFailRoutine.date)}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: FAILURE_RED, alignItems: 'center' }}
                    >
                      <Text style={{ fontWeight: '600', color: '#fff' }}>Mark Failed</Text>
                    </Pressable>
                  </View>
                </>
              )
            })()}
          </View>
        </View>
      </Modal>
    </View>
  )
}
