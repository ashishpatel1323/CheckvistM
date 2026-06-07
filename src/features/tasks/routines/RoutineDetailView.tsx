import { useState, useEffect } from 'react'
import { View, Text, Pressable, ScrollView, Modal } from 'react-native'
import { X, Pencil, Play } from 'lucide-react-native'
import { useRoutineStore } from './useRoutineStore'
import { ROUTINE_COLORS } from './routineTypes'
import type { RoutineDef } from './routineTypes'

interface RoutineDetailViewProps {
  routine: RoutineDef
  isMobile: boolean
  onClose: () => void
  onEdit: () => void
  onStartTimer: () => void
}

function fmtTime(d: Date): string {
  const h = d.getHours() % 12 || 12
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = d.getHours() >= 12 ? 'PM' : 'AM'
  return `${h}:${m} ${ampm}`
}

export function RoutineDetailView({ routine, isMobile, onClose, onEdit, onStartTimer }: RoutineDetailViewProps) {
  const getTodayCheckin = useRoutineStore((s) => s.getTodayCheckin)
  const getLast7Days = useRoutineStore((s) => s.getLast7Days)
  const toggleStep = useRoutineStore((s) => s.toggleStep)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const todayCheckin = getTodayCheckin(routine.taskId)
  const streak7 = getLast7Days(routine.taskId)
  const accentColor = ROUTINE_COLORS[routine.color]
  const totalMin = routine.steps.reduce((sum, s) => sum + s.durationMin, 0)
  const endTime = new Date(now.getTime() + totalMin * 60 * 1000)
  const todayKey = new Date().toISOString().slice(0, 10)
  const todayDow = new Date().getDay()

  const content = (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingTop: isMobile ? 52 : 20, paddingBottom: 16,
          borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
        }}
      >
        <Pressable onPress={onClose} hitSlop={8} style={{ marginRight: 12 }}>
          <X size={22} color="#6B7280" />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: '700', color: '#111' }}>{routine.name}</Text>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Pencil size={20} color="#6B7280" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {/* If you start now */}
        {totalMin > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>If you start now</Text>
            <Text style={{ fontSize: 24, fontWeight: '700', color: accentColor }}>
              {fmtTime(now)} to {fmtTime(endTime)}
            </Text>
          </View>
        )}

        {/* Trigger */}
        {!!routine.trigger && (
          <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 20, fontStyle: 'italic' }}>
            {routine.trigger}
          </Text>
        )}

        {/* Last 7 days */}
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 }}>
          Last 7 days
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 24 }}>
          {streak7.map((day, i) => {
            const isToday = day.date === todayKey
            return (
              <View
                key={i}
                style={{
                  width: 36, height: 36, borderRadius: 8,
                  backgroundColor: day.done ? accentColor : isToday ? '#fff' : '#F3F4F6',
                  borderWidth: isToday ? 2 : 0,
                  borderColor: accentColor,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 10, color: day.done ? '#fff' : isToday ? accentColor : '#9CA3AF', fontWeight: '600' }}>
                  {['S','M','T','W','T','F','S'][new Date(day.date + 'T12:00:00').getDay()]}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Steps */}
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 }}>
          {routine.steps.length} Steps
        </Text>
        {routine.steps.map((step) => {
          const isDone = todayCheckin?.completedStepIds.includes(step.id) ?? false
          const scheduledToday = step.scheduledDays.length === 0 || step.scheduledDays.includes(todayDow)
          return (
            <Pressable
              key={step.id}
              onPress={() => scheduledToday && toggleStep(routine, step.id, todayKey)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
              }}
            >
              <Text style={{ fontSize: 24 }}>{step.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, color: isDone ? '#9CA3AF' : '#111', textDecorationLine: isDone ? 'line-through' : 'none' }}>
                  {step.name}
                </Text>
                {step.optional && (
                  <Text style={{ fontSize: 11, color: '#D1D5DB' }}>optional</Text>
                )}
              </View>
              <Text style={{ fontSize: 13, color: '#9CA3AF', marginRight: 8 }}>
                {step.durationMin} min
                {!scheduledToday ? '  (not today)' : ''}
              </Text>
              {/* Circle checkbox */}
              <View
                style={{
                  width: 24, height: 24, borderRadius: 12,
                  borderWidth: 2,
                  borderColor: isDone ? accentColor : '#D1D5DB',
                  backgroundColor: isDone ? accentColor : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {isDone && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
              </View>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Sticky bottom — START TIMER */}
      <View
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 16, paddingVertical: 14,
          paddingBottom: isMobile ? 28 : 14,
          backgroundColor: '#fff',
          borderTopWidth: 1, borderTopColor: '#F0F0F0',
        }}
      >
        <Pressable onPress={onClose} hitSlop={8} style={{ padding: 8 }}>
          <X size={22} color="#9CA3AF" />
        </Pressable>
        <Pressable
          onPress={onStartTimer}
          style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#3B82F6', borderRadius: 14, paddingVertical: 16, gap: 8,
          }}
        >
          <Play size={18} color="#fff" fill="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 }}>
            START TIMER MODE
          </Text>
        </Pressable>
      </View>
    </View>
  )

  if (isMobile) {
    return (
      <Modal visible animationType="slide" presentationStyle="fullScreen">
        {content}
      </Modal>
    )
  }

  return (
    <View
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 380,
        backgroundColor: '#fff',
        borderLeftWidth: 1, borderLeftColor: '#E5E7EB',
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, elevation: 12,
        zIndex: 50,
      }}
    >
      {content}
    </View>
  )
}
