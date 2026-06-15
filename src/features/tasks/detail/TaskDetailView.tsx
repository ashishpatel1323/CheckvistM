import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, X, Calendar, Tag, ChevronRight, Timer } from 'lucide-react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTask } from '@/api/endpoints'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree } from '@/lib/taskTree'
import type { TaskNode } from '@/lib/taskTree'
import { useTasksQuery, useUpdateTask, useCloseTask, tasksQueryKey } from '@/features/tasks/list/useTasksQuery'
import { humanizeDueDate, dueDateColorClass, timeAgo } from '@/lib/dateUtils'
import { Spinner } from '@/components/Spinner'
import { MarkdownRenderer } from './MarkdownRenderer'
import { SubTaskTree } from './SubTaskTree'
import { QuickDatePicker } from '@/features/tasks/shared/QuickDatePicker'
import { PriorityPicker, priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { DurationPicker } from '@/features/tasks/shared/DurationPicker'
import { useToast } from '@/components/Toast'
import { BottomSheet } from '@/components/BottomSheet'
import { hapticSuccess } from '@/platform/haptics'
import { updateDurationTag } from '@/lib/durationTagUtils'

interface TaskDetailViewProps {
  checklistId: number
  taskId: number
}

export function TaskDetailView({ checklistId, taskId }: TaskDetailViewProps) {
  const router = useRouter()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPriorityPicker, setShowPriorityPicker] = useState(false)
  const [showDurationPicker, setShowDurationPicker] = useState(false)
  const [editedContent, setEditedContent] = useState('')

  const { data: allTasks } = useTasksQuery(checklistId)
  const { mutate: updateTask, isPending: isUpdating } = useUpdateTask(checklistId)
  const { mutate: closeTask } = useCloseTask(checklistId)

  const { data: singleTask, isLoading } = useQuery({
    queryKey: ['task', checklistId, taskId],
    queryFn: () => fetchTask(checklistId, taskId),
    enabled: !!checklistId && !!taskId,
    staleTime: 30 * 1000,
  })

  const taskNode = useMemo(() => {
    if (!allTasks) return null
    const { getById } = buildTaskTree(allTasks)
    return getById(taskId) ?? null
  }, [allTasks, taskId])

  const task = useMemo((): (TaskNode & Partial<CheckvistTask>) | null => {
    if (!taskNode && !singleTask) return null
    if (!taskNode) return { ...singleTask!, children: [] as TaskNode[], level: 1 }
    if (!singleTask) return taskNode
    const merged: TaskNode = { ...taskNode }
    for (const k of Object.keys(singleTask) as Array<keyof CheckvistTask>) {
      const v = singleTask[k]
      if (v !== null && v !== undefined) {
        (merged as unknown as Record<string, unknown>)[k] = v
      }
    }
    return merged
  }, [singleTask, taskNode])

  useEffect(() => {
    if (task) setEditedContent(task.content)
  }, [task?.id, task?.content])

  const saveContent = () => {
    if (!task || editedContent.trim() === task.content) return
    updateTask(
      { taskId, payload: { content: editedContent.trim() } },
      {
        onSuccess: () => {
          toast.success('Task updated')
          void queryClient.invalidateQueries({ queryKey: ['task', checklistId, taskId] })
        },
        onError: () => {
          toast.error('Failed to update task')
          if (task) setEditedContent(task.content)
        },
      }
    )
  }

  const handlePriorityChange = (priority: number) => {
    updateTask(
      { taskId, payload: { priority } },
      {
        onSuccess: () => {
          toast.success('Priority updated')
          void queryClient.invalidateQueries({ queryKey: tasksQueryKey(checklistId) })
          void queryClient.invalidateQueries({ queryKey: ['task', checklistId, taskId] })
          setShowPriorityPicker(false)
        },
        onError: () => toast.error('Failed to update priority'),
      }
    )
  }

  const handleDateChange = (date: string | null) => {
    updateTask(
      { taskId, payload: { due_date: date } },
      {
        onSuccess: () => {
          toast.success('Due date updated')
          void queryClient.invalidateQueries({ queryKey: tasksQueryKey(checklistId) })
          void queryClient.invalidateQueries({ queryKey: ['task', checklistId, taskId] })
          setShowDatePicker(false)
        },
        onError: () => toast.error('Failed to update due date'),
      }
    )
  }

  const handleDurationChange = (duration: { minutes: number; formatted: string } | null) => {
    if (!task) return
    const newTags = updateDurationTag(task.tags_as_text, duration?.formatted ?? null)
    updateTask(
      { taskId, payload: { tags_as_text: newTags } },
      {
        onSuccess: () => {
          toast.success(`Duration ${duration ? 'set to ' + duration.formatted : 'removed'}`)
          void queryClient.invalidateQueries({ queryKey: tasksQueryKey(checklistId) })
          void queryClient.invalidateQueries({ queryKey: ['task', checklistId, taskId] })
          setShowDurationPicker(false)
        },
        onError: () => toast.error('Failed to update duration'),
      }
    )
  }

  const handleComplete = () => {
    hapticSuccess()
    closeTask(taskId, {
      onSuccess: () => { toast.success('Task completed'); router.back() },
      onError: () => toast.error('Failed to complete task'),
    })
  }

  const taskParentId = (task?.parent_id ?? 0) > 0 ? task!.parent_id! : null

  const parentFromList = useMemo(() => {
    if (!taskParentId || !allTasks) return null
    return allTasks.find((t) => t.id === taskParentId) ?? null
  }, [allTasks, taskParentId])

  const { data: fetchedParent } = useQuery({
    queryKey: ['task', checklistId, taskParentId],
    queryFn: () => fetchTask(checklistId, taskParentId!),
    enabled: !!taskParentId && !parentFromList && !!checklistId,
    staleTime: 30 * 1000,
  })
  const parentTask = parentFromList ?? fetchedParent ?? null

  if (isLoading && !task) {
    return <View className="flex-1 items-center justify-center"><Spinner size="lg" /></View>
  }

  if (!task) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-400">Task not found</Text>
        <Pressable onPress={() => router.back()} className="mt-2">
          <Text className="text-orange-500 text-sm">Go back</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 py-3 border-b border-gray-100" style={{ paddingTop: 52 }}>
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-1.5 rounded-lg active:bg-gray-100">
          <ArrowLeft size={20} color="#6b7280" />
        </Pressable>
        <View className="flex-1" />
        {isUpdating && <Spinner size="sm" />}
        <Pressable onPress={handleComplete} className="px-3 py-1.5 bg-green-50 active:bg-green-100 rounded-lg">
          <Text className="text-sm font-medium text-green-700">Complete</Text>
        </Pressable>
      </View>

      {/* Content */}
      <ScrollView className="flex-1" contentContainerClassName="p-4">
        {/* Parent breadcrumb */}
        {parentTask && (
          <Pressable
            onPress={() => router.push(`/${checklistId}/tasks/${parentTask.id}`)}
            className="flex-row items-center gap-1 mb-3"
          >
            <ChevronRight size={14} color="#f97316" style={{ transform: [{ rotate: '180deg' }] }} />
            <Text className="text-sm text-orange-500 font-medium flex-1" numberOfLines={1}>
              {parentTask.content}
            </Text>
          </Pressable>
        )}

        {/* Editable title */}
        <TextInput
          value={editedContent}
          onChangeText={setEditedContent}
          onBlur={saveContent}
          multiline
          className="text-xl font-semibold text-gray-900 mb-3"
          style={{ fontSize: 20, lineHeight: 28 }}
          placeholder="Task title"
        />

        {/* Meta pills */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          {/* Due date */}
          <Pressable
            onPress={() => { setShowDatePicker(true); setShowPriorityPicker(false); setShowDurationPicker(false) }}
            className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full border ${
              task.due ? dueDateColorClass(task.due) : 'border-gray-200 bg-gray-50'
            }`}
          >
            <Calendar size={14} color={task.due ? undefined : '#9ca3af'} />
            <Text className={`text-sm font-medium ${task.due ? dueDateColorClass(task.due) : 'text-gray-400'}`}>
              {humanizeDueDate(task.due)}
            </Text>
          </Pressable>

          {/* Priority */}
          <Pressable
            onPress={() => { setShowPriorityPicker(true); setShowDatePicker(false); setShowDurationPicker(false) }}
            className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full ${priorityBadgeClass(task.priority)}`}
          >
            <Tag size={14} color="#6b7280" />
            <Text className={`text-sm font-medium ${priorityBadgeClass(task.priority)}`}>
              {priorityDisplay(task.priority ?? 0)}
            </Text>
          </Pressable>

          {/* Duration */}
          <Pressable
            onPress={() => { setShowDurationPicker(true); setShowDatePicker(false); setShowPriorityPicker(false) }}
            className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full border ${
              task.duration ? 'border-purple-200 bg-purple-50' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <Timer size={14} color={task.duration ? '#a855f7' : '#9ca3af'} />
            <Text className={`text-sm font-medium ${task.duration ? 'text-purple-600' : 'text-gray-400'}`}>
              {task.duration?.formatted ?? 'No time'}
            </Text>
          </Pressable>

          {/* Status */}
          <View className={`px-3 py-1 rounded-full ${task.status === 1 ? 'bg-green-100' : 'bg-gray-100'}`}>
            <Text className={`text-xs font-medium ${task.status === 1 ? 'text-green-700' : 'text-gray-600'}`}>
              {task.status === 1 ? 'Done' : 'Open'}
            </Text>
          </View>
        </View>

        {/* Tags */}
        {task.tags_as_text && (
          <View className="flex-row flex-wrap gap-1 mb-4">
            {task.tags_as_text.split(',').map((tag) => (
              <View key={tag.trim()} className="px-2 py-0.5 bg-blue-50 rounded-full">
                <Text className="text-xs text-blue-600">#{tag.trim()}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Markdown body */}
        {task.content && (
          <View className="border border-gray-100 rounded-xl p-3 bg-gray-50 mb-4">
            <MarkdownRenderer content={task.content} />
          </View>
        )}

        {/* Sub-tasks */}
        {taskNode && <SubTaskTree parentTask={taskNode} checklistId={checklistId} />}

        {/* Footer */}
        <View className="pt-4 mt-4 border-t border-gray-100">
          <Text className="text-xs text-gray-400">Created {timeAgo(task.created_at)}</Text>
          <Text className="text-xs text-gray-400 mt-0.5">Updated {timeAgo(task.updated_at)}</Text>
        </View>
      </ScrollView>

      {/* Date picker */}
      {showDatePicker && (
        <QuickDatePicker
          taskId={task.id}
          onSelect={handleDateChange}
          onClose={() => setShowDatePicker(false)}
          isMobile
        />
      )}

      {/* Priority picker */}
      <BottomSheet open={showPriorityPicker} onClose={() => setShowPriorityPicker(false)} title="Set Priority">
        <PriorityPicker value={task.priority} onChange={handlePriorityChange} />
      </BottomSheet>

      {/* Duration picker */}
      <BottomSheet open={showDurationPicker} onClose={() => setShowDurationPicker(false)}>
        <DurationPicker value={task.duration} onChange={handleDurationChange} onClose={() => setShowDurationPicker(false)} />
      </BottomSheet>
    </View>
  )
}
