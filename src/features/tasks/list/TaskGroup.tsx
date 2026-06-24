import { useState } from 'react'
import { View, Pressable, Modal } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
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
          <View className="w-2 h-2 rounded-full" style={{ backgroundColor: isOverdue ? '#E53935' : colors.accent, opacity: isOverdue ? 1 : 0.7 }} />

          <UIText className="text-[11px] font-bold uppercase tracking-wider flex-1" style={{ color: isOverdue ? '#E53935' : '#6B7280' }}>
            {group.label}
          </UIText>

          {isOverdue && (
            <Pressable
              hitSlop={6}
              className="flex-row items-center gap-0.5"
              onPress={(e) => { e.stopPropagation?.(); setShowPostponeDialog(true) }}
            >
              <UIText className="text-xs font-medium" style={{ color: '#4772FA' }}>Postpone all</UIText>
            </Pressable>
          )}

          <View className={`rounded-[10px] px-1.75 py-0.5 ${isOverdue ? 'bg-destructive/10' : 'bg-muted'}`}>
            <UIText className="text-[11px] font-semibold" style={{ color: isOverdue ? '#E53935' : '#9CA3AF' }}>
              {group.tasks.length}
            </UIText>
          </View>

          <ChevronDown
            size={14}
            className="text-muted-foreground"
            style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}
          />
        </Pressable>

        {!collapsed && (
          <View className="bg-background rounded-xl border border-border overflow-hidden">
            {group.tasks.map((task, i) => (
              <View key={task.id}>
                {i > 0 && <View className="h-px bg-border ml-12" />}
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
          className="flex-1 bg-black/45 items-center justify-center px-8"
          onPress={() => setShowPostponeDialog(false)}
        >
          <Pressable
            className="bg-background rounded-2xl pt-6 px-6 pb-2 w-full"
            style={{ shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 16 }}
            onPress={() => {}}
          >
            <UIText className="text-base font-bold text-foreground mb-2.5">Postpone to Today</UIText>
            <UIText className="text-sm text-muted-foreground mb-6" style={{ lineHeight: 22 }}>
              All overdue tasks in this list will be rescheduled to today.
            </UIText>
            <View className="flex-row justify-end gap-2 border-t border-border py-2">
              <Pressable
                onPress={() => setShowPostponeDialog(false)}
                className="px-4 py-2"
              >
                <UIText className="text-sm font-medium" style={{ color: '#4772FA' }}>Cancel</UIText>
              </Pressable>
              <Pressable
                onPress={handlePostpone}
                className="px-4 py-2"
              >
                <UIText className="text-sm font-bold" style={{ color: '#4772FA' }}>Postpone</UIText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}
