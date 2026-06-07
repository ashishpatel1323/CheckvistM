import { View, Text, Pressable } from 'react-native'
import { Pencil, Trash2 } from 'lucide-react-native'
import { useRoutineStore } from './useRoutineStore'
import { ROUTINE_COLORS } from './routineTypes'
import type { RoutineDef } from './routineTypes'

interface RoutineCardProps {
  routine: RoutineDef
  onPress: () => void
  onEdit: () => void
  onDelete: () => void
}

export function RoutineCard({ routine, onPress, onEdit, onDelete }: RoutineCardProps) {
  const getLast7Days = useRoutineStore((s) => s.getLast7Days)
  const getTodayCheckin = useRoutineStore((s) => s.getTodayCheckin)

  const streak7 = getLast7Days(routine.taskId)
  const todayCheckin = getTodayCheckin(routine.taskId)
  const accentColor = ROUTINE_COLORS[routine.color]
  const totalMin = routine.steps.reduce((sum, s) => sum + s.durationMin, 0)
  const completedToday = todayCheckin?.completedStepIds.length ?? 0
  const progressPct = routine.steps.length > 0 ? completedToday / routine.steps.length : 0
  const previewSteps = routine.steps.slice(0, 4)

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: '#fff',
        borderRadius: 16,
        marginHorizontal: 16,
        marginVertical: 6,
        shadowColor: '#000',
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
        flexDirection: 'row',
        overflow: 'hidden',
        opacity: pressed ? 0.92 : 1,
      })}
    >
      {/* Left accent bar */}
      <View style={{ width: 4, backgroundColor: accentColor }} />

      <View style={{ flex: 1, padding: 14 }}>
        {/* 7-day streak strip */}
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
          {streak7.map((day, i) => (
            <View
              key={i}
              style={{
                width: 10, height: 10,
                borderRadius: 5,
                backgroundColor: day.done ? accentColor : '#E5E7EB',
                borderWidth: day.date === new Date().toISOString().slice(0, 10) ? 1.5 : 0,
                borderColor: accentColor,
              }}
            />
          ))}
        </View>

        {/* Duration + step count */}
        <Text style={{ fontSize: 12, fontWeight: '600', color: accentColor, marginBottom: 2 }}>
          {totalMin} min{' · '}{routine.steps.length} step{routine.steps.length !== 1 ? 's' : ''}
        </Text>

        {/* Routine name */}
        <Text style={{ fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 2 }}>
          {routine.name}
        </Text>

        {/* Trigger */}
        {!!routine.trigger && (
          <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 6 }}>
            {routine.trigger}
          </Text>
        )}

        {/* Step emoji preview */}
        {previewSteps.length > 0 && (
          <Text style={{ fontSize: 13, color: '#9CA3AF' }} numberOfLines={1}>
            {previewSteps.map((s) => `${s.emoji} ${s.name}`).join(' / ')}
            {routine.steps.length > 4 ? ` +${routine.steps.length - 4}` : ''}
          </Text>
        )}

        {/* Today's progress bar */}
        {completedToday > 0 && (
          <View style={{ marginTop: 8, height: 3, backgroundColor: '#E5E7EB', borderRadius: 2 }}>
            <View
              style={{
                height: 3, borderRadius: 2,
                backgroundColor: accentColor,
                width: `${Math.round(progressPct * 100)}%`,
              }}
            />
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={{ justifyContent: 'space-between', padding: 10, paddingTop: 14 }}>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Pencil size={16} color="#9CA3AF" />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Trash2 size={16} color="#EF4444" />
        </Pressable>
      </View>
    </Pressable>
  )
}
