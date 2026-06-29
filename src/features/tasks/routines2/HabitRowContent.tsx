import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Play } from 'lucide-react-native'
import { format } from 'date-fns'
import { useRoutine2Store } from './useRoutine2Store'
import { ROUTINE_COLORS } from '../routines/routineTypes'
import { getStepStatus } from '../routines/routineSchedule'
import { colors, space } from '../../../design/tokens'
import {
  HabitCircle,
  TimeEditModal,
  computeTimeRank,
  fmtTime12,
  getLast21ScheduledSuccesses,
} from './RoutinesView'
import type { HabitRowProps } from './RoutinesView'

/**
 * Renders the inner content of a habit row (emoji/badge, name/duration, play
 * button, time-edit modal, date circles) without the outer Pressable wrapper,
 * so it can be reused by both the plain (desktop / week-view) row and the
 * swipeable mobile day-view row.
 */
export function HabitRowContent({
  step, routine, visibleDates, selectedDate, colWidth, circleSize,
  onToggle, checkinsByDate, failedByDate, completionTimeByDate, onStartStep, onMarkFailed, onReset, onIconPress,
}: HabitRowProps) {
  const accentColor = ROUTINE_COLORS[routine.color]
  const updateCheckinTime = useRoutine2Store((s) => s.updateCheckinTime)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const allLogs = Object.entries(checkinsByDate).map(([date, completedStepIds]) => ({ date, completedStepIds }))
  const last21Successes = getLast21ScheduledSuccesses(step.id, step.scheduledDays, allLogs)
  const isMobileDay = circleSize >= 40

  return (
    <>
      {/* Emoji icon + X/21 badge (de-emphasized, still always visible) */}
      <View style={{ alignItems: 'center', marginRight: space.md, gap: 3 }}>
        <Pressable
          onPress={onIconPress}
          disabled={!onIconPress}
          hitSlop={6}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: accentColor + '20',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 18 }}>{step.emoji}</Text>
        </Pressable>
        <View style={{
          borderRadius: 6,
          backgroundColor: colors.bgTertiary,
          paddingHorizontal: 5, paddingVertical: 1,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: isMobileDay ? 9 : 8, fontWeight: '600', color: colors.textTertiary }}>
            {last21Successes}/21
          </Text>
        </View>
      </View>

      {/* Name + duration pill */}
      <View style={{ flex: 1, marginRight: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: isMobileDay ? 16 : 14, fontWeight: '600', color: colors.textPrimary }} numberOfLines={1}>
            {step.name}
          </Text>
          {step.durationMin > 0 && (
            <View style={{
              backgroundColor: colors.bgTertiary, borderRadius: 6,
              paddingHorizontal: 6, paddingVertical: 2,
            }}>
              <Text style={{ fontSize: isMobileDay ? 11 : 10, fontWeight: '600', color: colors.textSecondary }}>
                {step.durationMin}m
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Single-habit play button */}
      {onStartStep && (
        <Pressable
          onPress={(e) => { e.stopPropagation(); onStartStep() }}
          hitSlop={8}
          style={{
            width: 28, height: 28, borderRadius: 14,
            backgroundColor: accentColor + '18',
            alignItems: 'center', justifyContent: 'center',
            marginRight: space.sm,
          }}
        >
          <Play size={13} color={accentColor} fill={accentColor} />
        </Pressable>
      )}

      {editingDate && (
        <TimeEditModal
          visible={!!editingDate}
          initialTime={completionTimeByDate[editingDate] ?? '00:00'}
          onSave={(hhmm) => {
            void updateCheckinTime(routine.taskId, editingDate, step.id, hhmm)
            setEditingDate(null)
          }}
          onClose={() => setEditingDate(null)}
        />
      )}

      {/* Date circles */}
      <View style={{ flexDirection: 'row', gap: 0 }}>
        {visibleDates.map((date) => {
          const ds = format(date, 'yyyy-MM-dd')
          const isDone = (checkinsByDate[ds] ?? []).includes(step.id)
          const isFailed = (failedByDate[ds] ?? []).includes(step.id)
          const isSelected = ds === format(selectedDate, 'yyyy-MM-dd')
          const dayOfWeek = date.getDay()
          const status = getStepStatus(step, dayOfWeek, isDone, isFailed)
          const thisTime = completionTimeByDate[ds]
          const rank = isDone && thisTime
            ? computeTimeRank(
                thisTime,
                Object.entries(completionTimeByDate)
                  .filter(([d, t]) => d !== ds && t)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .slice(0, 10)
                  .map(([, t]) => t),
              )
            : undefined

          // Tap cycles: pending -> done -> failed -> pending. not_applicable is disabled in HabitCircle.
          const handleTap = () => {
            if (status === 'pending') onToggle(step.id, ds)
            else if (status === 'done') onMarkFailed?.(step.id)
            else if (status === 'failed') onReset?.(step.id)
          }

          return (
            <View
              key={ds}
              style={{
                width: colWidth,
                alignItems: 'center',
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: (isSelected && visibleDates.length > 1) ? colors.bgTertiary : 'transparent',
              }}
            >
              <HabitCircle
                status={status}
                selected={isSelected}
                accentColor={accentColor}
                onTap={handleTap}
                size={circleSize}
                rank={rank}
              />
              {isDone && completionTimeByDate[ds] ? (
                <Pressable onPress={() => setEditingDate(ds)} hitSlop={10}
                  style={circleSize >= 40 ? {
                    marginTop: 5, paddingHorizontal: 8, paddingVertical: 3,
                    backgroundColor: accentColor + '18', borderRadius: 8,
                  } : undefined}
                >
                  <Text style={{
                    fontSize: circleSize >= 40 ? 12 : 8,
                    color: accentColor,
                    marginTop: circleSize >= 40 ? 0 : 2,
                    textAlign: 'center',
                    fontWeight: circleSize >= 40 ? '700' : '400',
                    textDecorationLine: circleSize >= 40 ? 'none' : 'underline',
                  }} numberOfLines={1}>
                    {fmtTime12(completionTimeByDate[ds]).replace(' AM', 'a').replace(' PM', 'p')}
                  </Text>
                </Pressable>
              ) : isDone && circleSize >= 40 ? (
                <Pressable onPress={() => setEditingDate(ds)} hitSlop={10}
                  style={{ marginTop: 5, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.bgTertiary, borderRadius: 8 }}
                >
                  <Text style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }}>+ time</Text>
                </Pressable>
              ) : null}
            </View>
          )
        })}
      </View>
    </>
  )
}
