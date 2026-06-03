import { useState } from 'react'
import { View, Text, Pressable, Modal } from 'react-native'
import { ChevronDown, ChevronRight } from 'lucide-react-native'
import type { GroupedTasks } from '@/lib/dateSort'
import { toApiDate } from '@/lib/dateUtils'
import { TaskRow } from './TaskRow'
import { useUpdateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'

interface TaskGroupProps {
  group: GroupedTasks
  checklistId: number
  isMobile: boolean
  focusedId?: number | null
}

const groupColors: Record<string, { text: string; accent: string }> = {
  overdue:    { text: '#E53935', accent: '#E53935' },
  today:      { text: '#222',    accent: '#4772FA' },
  tomorrow:   { text: '#222',    accent: '#4772FA' },
  thisWeek:   { text: '#222',    accent: '#4772FA' },
  later:      { text: '#222',    accent: '#4772FA' },
  noDueDate:  { text: '#666',    accent: '#9ca3af' },
}

export function TaskGroup({ group, checklistId, isMobile, focusedId }: TaskGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showPostponeDialog, setShowPostponeDialog] = useState(false)
  const { mutate: updateTask } = useUpdateTask(checklistId)
  const toast = useToast()

  const colors = groupColors[group.group] ?? { text: '#666', accent: '#9ca3af' }
  const isOverdue = group.group === 'overdue'

  const handlePostpone = () => {
    const today = toApiDate(new Date())
    const overdueWithDate = group.tasks.filter((t) => t.due)
    let completed = 0
    if (overdueWithDate.length === 0) {
      setShowPostponeDialog(false)
      toast.success('No dated overdue tasks to postpone')
      return
    }
    overdueWithDate.forEach((task) => {
      updateTask(
        { taskId: task.id, payload: { due_date: today } },
        {
          onSuccess: () => {
            completed++
            if (completed === overdueWithDate.length) {
              setShowPostponeDialog(false)
              toast.success(`${completed} task${completed > 1 ? 's' : ''} postponed to today`)
            }
          },
          onError: () => toast.error('Failed to postpone some tasks'),
        }
      )
    })
  }

  return (
    <>
      <View className="mx-3 mb-1">
        {/* Group header */}
        <Pressable
          onPress={() => setCollapsed((v) => !v)}
          className="flex-row items-center px-1 py-2"
          style={{ gap: 8 }}
        >
          {/* Accent dot */}
          <View style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: isOverdue ? '#E53935' : colors.accent,
            opacity: isOverdue ? 1 : 0.7,
          }} />

          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: isOverdue ? '#E53935' : '#6B7280', flex: 1 }}>
            {group.label}
          </Text>

          {isOverdue && (
            <Pressable
              hitSlop={6}
              className="flex-row items-center gap-0.5"
              onPress={(e) => { e.stopPropagation?.(); setShowPostponeDialog(true) }}
            >
              <Text style={{ color: '#4772FA', fontSize: 12, fontWeight: '500' }}>Postpone all</Text>
            </Pressable>
          )}

          <View style={{ backgroundColor: isOverdue ? '#FEE2E2' : '#F3F4F6', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: isOverdue ? '#E53935' : '#9CA3AF' }}>
              {group.tasks.length}
            </Text>
          </View>

          <ChevronDown
            size={14}
            color="#9CA3AF"
            style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}
          />
        </Pressable>

        {!collapsed && (
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: '#F0F0F0',
            }}
          >
            {group.tasks.map((task, i) => (
              <View key={task.id}>
                {i > 0 && <View style={{ height: 1, backgroundColor: '#F5F5F5', marginLeft: 48 }} />}
                <TaskRow task={task} checklistId={checklistId} isMobile={isMobile} focusedId={focusedId} />
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Postpone confirmation dialog */}
      <Modal
        visible={showPostponeDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPostponeDialog(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}
          onPress={() => setShowPostponeDialog(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              paddingTop: 24,
              paddingHorizontal: 24,
              paddingBottom: 8,
              width: '100%',
              shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 16,
            }}
            onPress={() => {}}
          >
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 10 }}>
              Postpone to Today
            </Text>
            <Text style={{ fontSize: 14.5, color: '#555', lineHeight: 22, marginBottom: 24 }}>
              All overdue tasks in this list will be rescheduled to today.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingVertical: 8 }}>
              <Pressable
                onPress={() => setShowPostponeDialog(false)}
                style={{ paddingVertical: 8, paddingHorizontal: 16 }}
              >
                <Text style={{ fontSize: 15, color: '#4772FA', fontWeight: '500' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handlePostpone}
                style={{ paddingVertical: 8, paddingHorizontal: 16 }}
              >
                <Text style={{ fontSize: 15, color: '#4772FA', fontWeight: '700' }}>Postpone</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}
