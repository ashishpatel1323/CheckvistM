import { useMemo, useState } from 'react'
import { View, Text, Pressable, useWindowDimensions } from 'react-native'
import { Plus, LayoutList, AlignLeft, Network } from 'lucide-react-native'
import { useTasksQuery } from './useTasksQuery'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate } from '@/lib/dateSort'
import { TaskSkeleton } from '@/components/TaskSkeleton'
import { CreateTaskInput } from '@/features/tasks/shared/CreateTaskInput'
import { VirtualTaskList } from './VirtualTaskList'
import { FlatTaskList } from './FlatTaskList'
import { MindMapView } from './MindMapView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTaskView } from './useTaskView'
import { ChecklistSwitcher } from '@/features/checklists/ChecklistSwitcher'
import { useAuth } from '@/auth/useAuth'

interface TaskListViewProps {
  checklistId: number
}

const ORANGE = '#E8632A'

export function TaskListView({ checklistId }: TaskListViewProps) {
  const { width } = useWindowDimensions()
  const isMobile = width < 768
  const { data: tasks, isLoading, isError } = useTasksQuery(checklistId)
  const [showFabInput, setShowFabInput] = useState(false)
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const { view, setView } = useTaskView()
  const logout = useAuth((s) => s.logout)

  const groups = useMemo(() => {
    if (!tasks) return []
    const { allNodes } = buildTaskTree(tasks)
    return groupTasksByDate(allNodes)
  }, [tasks])

  const isEmpty = !isLoading && !isError && groups.length === 0

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center px-3 py-2 bg-orange-500 gap-2"
        style={{ paddingTop: 44 }}
      >
        <ChecklistSwitcher />

        <View className="flex-1" />

        {/* View toggle */}
        <Pressable onPress={() => setView('date')} hitSlop={6}>
          <LayoutList size={18} color="white" style={{ opacity: view === 'date' ? 1 : 0.5 }} />
        </Pressable>
        <Pressable onPress={() => setView('list')} hitSlop={6}>
          <AlignLeft size={18} color="white" style={{ opacity: view === 'list' ? 1 : 0.5 }} />
        </Pressable>
        <Pressable onPress={() => setView('mindmap')} hitSlop={6}>
          <Network size={18} color="white" style={{ opacity: view === 'mindmap' ? 1 : 0.5 }} />
        </Pressable>
      </View>

      {/* Create task input (non-mindmap) */}
      {view !== 'mindmap' && (
        <CreateTaskInput checklistId={checklistId} />
      )}

      {isLoading && <TaskSkeleton count={8} />}

      {isError && (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-red-600 font-medium">Failed to load tasks</Text>
          <Text className="text-gray-400 text-sm mt-1">Check your connection and try again</Text>
        </View>
      )}

      {isEmpty && (
        <View className="flex-1 items-center justify-center gap-3">
          <View className="w-12 h-12 rounded-full bg-gray-100 items-center justify-center">
            <Plus size={24} color="#9ca3af" />
          </View>
          <Text className="text-sm text-gray-400">No open tasks. Create one!</Text>
        </View>
      )}

      {!isLoading && !isError && !isEmpty && tasks && (
        <>
          {view === 'date' && (
            <VirtualTaskList groups={groups} checklistId={checklistId} isMobile={isMobile} focusedId={focusedId} setFocusedId={setFocusedId} />
          )}
          {view === 'list' && (
            <FlatTaskList tasks={tasks} checklistId={checklistId} isMobile={isMobile} focusedId={focusedId} setFocusedId={setFocusedId} />
          )}
          {view === 'mindmap' && (
            <ErrorBoundary>
              <MindMapView tasks={tasks} checklistId={checklistId} focusedId={focusedId} setFocusedId={setFocusedId} />
            </ErrorBoundary>
          )}
        </>
      )}

      {/* Mobile FAB */}
      {isMobile && view !== 'mindmap' && (
        <>
          <Pressable
            onPress={() => setShowFabInput(true)}
            className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-orange-500 active:bg-orange-600 shadow-xl items-center justify-center"
            style={{ elevation: 6 }}
          >
            <Plus size={24} color="white" />
          </Pressable>
          {showFabInput && (
            <View className="absolute bottom-24 left-4 right-4 bg-white rounded-2xl border border-gray-100"
              style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, elevation: 10 }}
            >
              <CreateTaskInput
                checklistId={checklistId}
                placeholder="New task…"
                autoFocus
                onCreated={() => setShowFabInput(false)}
              />
              <Pressable onPress={() => setShowFabInput(false)} className="py-2 items-center">
                <Text className="text-sm text-gray-400">Cancel</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  )
}
