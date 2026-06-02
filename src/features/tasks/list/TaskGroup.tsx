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
      <View
        className="mx-3 mb-3 bg-white rounded-2xl overflow-hidden"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        {/* Group header */}
        <Pressable
          onPress={() => setCollapsed((v) => !v)}
          className="flex-row items-center px-4 py-3"
          style={{ borderBottomWidth: collapsed ? 0 : 1, borderBottomColor: '#F5F5F5' }}
        >
          <Text className="font-semibold flex-1" style={{ color: colors.text, fontSize: 15 }}>
            {group.label}
          </Text>
          {isOverdue && (
            <Pressable
              hitSlop={6}
              className="flex-row items-center gap-0.5 mr-3"
              onPress={(e) => { e.stopPropagation?.(); setShowPostponeDialog(true) }}
            >
              <Text style={{ color: '#4772FA', fontSize: 13, fontWeight: '500' }}>Postpone</Text>
              <ChevronRight size={14} color="#4772FA" />
            </Pressable>
          )}
          <Text className="mr-2 font-medium" style={{ color: colors.text, opacity: 0.4, fontSize: 13 }}>
            {group.tasks.length}
          </Text>
          <ChevronDown
            size={16}
            color={colors.text}
            style={{ opacity: 0.4, transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}
          />
        </Pressable>

        {!collapsed && (
          <View className="pt-1 pb-2">
            {group.tasks.map((task) => (
              <TaskRow key={task.id} task={task} checklistId={checklistId} isMobile={isMobile} focusedId={focusedId} />
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
