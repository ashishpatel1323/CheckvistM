import { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { ChevronRight, Circle, CheckCircle } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import type { TaskNode } from '@/lib/taskTree'
import { useCloseTask } from '@/features/tasks/list/useTasksQuery'
import { useToast } from '@/components/Toast'
import { CreateTaskInput } from '@/features/tasks/shared/CreateTaskInput'
import { priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'

interface SubTaskNodeProps {
  task: TaskNode
  checklistId: number
  depth?: number
}

function SubTaskNode({ task, checklistId, depth = 0 }: SubTaskNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  const { mutate: closeTask } = useCloseTask(checklistId)
  const toast = useToast()
  const hasChildren = task.children.length > 0
  const indent = depth * 16

  return (
    <>
      <Pressable
        onPress={() => router.push(`/${checklistId}/tasks/${task.id}`)}
        className="flex-row items-center gap-2 py-1.5 rounded-lg active:bg-muted"
        style={{ paddingLeft: indent + 8 }}
      >
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          hitSlop={8}
          className="w-4 h-4 items-center justify-center"
          style={{ opacity: hasChildren ? 1 : 0 }}
          disabled={!hasChildren}
        >
          <ChevronRight
            size={12}
            color="hsl(220 9% 63%)"
            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
          />
        </Pressable>

        <Pressable
          onPress={() => closeTask(task.id, {
            onSuccess: () => toast.success('Subtask completed'),
            onError: () => toast.error('Failed to complete subtask'),
          })}
          hitSlop={8}
          className="w-4 h-4 items-center justify-center"
        >
          {task.status === 1 ? (
            <CheckCircle size={14} color="#22c55e" />
          ) : (
            <Circle size={14} color="#d1d5db" />
          )}
        </Pressable>

        <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>{task.content}</Text>
        <Text className={`text-xs font-bold px-1 py-0.5 rounded ${priorityBadgeClass(task.priority)}`}>
          {priorityDisplay(task.priority)}
        </Text>
      </Pressable>

      {hasChildren && expanded && (
        <View>
          {task.children.map((child) => (
            <SubTaskNode key={child.id} task={child} checklistId={checklistId} depth={depth + 1} />
          ))}
        </View>
      )}
    </>
  )
}

interface SubTaskTreeProps {
  parentTask: TaskNode
  checklistId: number
}

export function SubTaskTree({ parentTask, checklistId }: SubTaskTreeProps) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <View className="mt-4">
      <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Sub-tasks ({parentTask.children.length})
      </Text>

      {parentTask.children.length > 0 && (
        <View className="mb-3">
          {parentTask.children.map((child) => (
            <SubTaskNode key={child.id} task={child} checklistId={checklistId} />
          ))}
        </View>
      )}

      {showAdd ? (
        <View className="border border-border rounded-xl overflow-hidden">
          <CreateTaskInput
            checklistId={checklistId}
            parentId={parentTask.id}
            placeholder="New sub-task…"
            autoFocus
            onCreated={() => setShowAdd(false)}
          />
          <Pressable onPress={() => setShowAdd(false)} className="py-1.5 items-center">
            <Text className="text-xs text-muted-foreground">Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setShowAdd(true)}>
          <Text className="text-sm text-primary font-medium">+ Add sub-task</Text>
        </Pressable>
      )}
    </View>
  )
}
