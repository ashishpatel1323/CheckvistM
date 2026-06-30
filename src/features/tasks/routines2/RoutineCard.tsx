import { View, Pressable } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
import { Pencil, Trash2 } from 'lucide-react-native'
import { useRoutine2Store } from './useRoutine2Store'
import { ROUTINE_COLORS } from '../routines/routineTypes'
import type { RoutineDef } from '../routines/routineTypes'

interface RoutineCardProps {
  routine: RoutineDef
  onPress: () => void
  onEdit: () => void
  onDelete: () => void
}

export function RoutineCard({ routine, onPress, onEdit, onDelete }: RoutineCardProps) {
  const getLast7Days = useRoutine2Store((s) => s.getLast7Days)
  const getTodayCheckin = useRoutine2Store((s) => s.getTodayCheckin)

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
      className="bg-background rounded-2xl mx-4 my-1.5 overflow-hidden flex-row"
      style={{ shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 }}
    >
      {/* Left accent bar */}
      <View style={{ width: 4, backgroundColor: accentColor }} />

      <View className="flex-1 p-3.5">
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
        <UIText className="text-xs font-semibold mb-0.5" style={{ color: accentColor }}>
          {totalMin} min · {routine.steps.length} step{routine.steps.length !== 1 ? 's' : ''}
        </UIText>

        {/* Routine name */}
        <UIText className="text-base font-bold text-foreground mb-0.5">
          {routine.name}
        </UIText>

        {/* Step emoji preview */}
        {previewSteps.length > 0 && (
          <UIText className="text-sm text-muted-foreground" numberOfLines={1}>
            {previewSteps.map((s) => `${s.emoji} ${s.name}`).join(' / ')}
            {routine.steps.length > 4 ? ` +${routine.steps.length - 4}` : ''}
          </UIText>
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
      <View className="justify-between p-2.5 pt-3.5">
        <Pressable onPress={onEdit} hitSlop={8}>
          <Pencil size={16} className="text-muted-foreground" />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Trash2 size={16} color="#EF4444" />
        </Pressable>
      </View>
    </Pressable>
  )
}
