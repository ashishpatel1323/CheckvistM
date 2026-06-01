import { useMemo, useState } from 'react'
import { View, Text, Pressable, useWindowDimensions, Platform } from 'react-native'
import { LayoutList, AlignLeft, Network, Search, Plus } from 'lucide-react-native'
import { useTasksQuery } from './useTasksQuery'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate } from '@/lib/dateSort'
import { TaskSkeleton } from '@/components/TaskSkeleton'
import { CreateTaskInput } from '@/features/tasks/shared/CreateTaskInput'
import { VirtualTaskList } from './VirtualTaskList'
import { FlatTaskList } from './FlatTaskList'
import { MindMapView } from './MindMapView'
import { SearchView } from '@/features/tasks/search/SearchView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTaskView } from './useTaskView'
import { ChecklistSwitcher } from '@/features/checklists/ChecklistSwitcher'

interface TaskListViewProps {
  checklistId: number
}

const ORANGE = '#E8632A'
const INACTIVE = '#9ca3af'

const TABS = [
  { key: 'date',    icon: LayoutList, label: 'Tasks'   },
  { key: 'list',    icon: AlignLeft,  label: 'Outline' },
  { key: 'mindmap', icon: Network,    label: 'Map'     },
  { key: 'search',  icon: Search,     label: 'Search'  },
] as const

export function TaskListView({ checklistId }: TaskListViewProps) {
  const { width } = useWindowDimensions()
  const isMobile = width < 768
  const { data: tasks, isLoading, isError } = useTasksQuery(checklistId)
  const [showFabInput, setShowFabInput] = useState(false)
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const { view, setView } = useTaskView()

  const groups = useMemo(() => {
    if (!tasks) return []
    const { allNodes } = buildTaskTree(tasks)
    return groupTasksByDate(allNodes)
  }, [tasks])

  const isEmpty = !isLoading && !isError && groups.length === 0
  const isSearch = view === 'search'

  // Bottom tab safe area height
  const tabBarH = isMobile ? 64 : 0

  return (
    <View className="flex-1 bg-white">

      {/* ── Header ──────────────────────────────────────────────── */}
      <View
        className="flex-row items-center px-4 bg-orange-500"
        style={{ paddingTop: Platform.OS === 'android' ? 40 : 48, paddingBottom: 10, gap: 8 }}
      >
        <ChecklistSwitcher />
        <View className="flex-1" />

        {/* Web: show tabs inline in header */}
        {!isMobile && TABS.map(({ key, icon: Icon, label }) => {
          const active = view === key
          return (
            <Pressable
              key={key}
              onPress={() => setView(key)}
              hitSlop={6}
              className="flex-row items-center gap-1 px-2 py-1 rounded-lg"
              style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'transparent' }}
            >
              <Icon size={16} color="white" style={{ opacity: active ? 1 : 0.6 }} />
              <Text className="text-xs font-medium text-white" style={{ opacity: active ? 1 : 0.7 }}>
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {/* ── Search view ─────────────────────────────────────────── */}
      {isSearch && (
        <SearchView checklistId={checklistId} />
      )}

      {/* ── Task views ──────────────────────────────────────────── */}
      {!isSearch && (
        <>
          {/* Create task input */}
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
            <View className="flex-1 items-center justify-center gap-3" style={{ paddingBottom: tabBarH }}>
              <View className="w-12 h-12 rounded-full bg-gray-100 items-center justify-center">
                <Plus size={24} color="#9ca3af" />
              </View>
              <Text className="text-sm text-gray-400">No open tasks. Create one!</Text>
            </View>
          )}

          {!isLoading && !isError && !isEmpty && tasks && (
            <View className="flex-1" style={{ paddingBottom: isMobile ? tabBarH : 0 }}>
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
            </View>
          )}

          {/* Mobile FAB */}
          {isMobile && view !== 'mindmap' && (
            <>
              <Pressable
                onPress={() => setShowFabInput(true)}
                className="absolute right-5 items-center justify-center rounded-full bg-orange-500 active:bg-orange-600"
                style={{
                  bottom: tabBarH + 16,
                  width: 52, height: 52,
                  shadowColor: ORANGE, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
                }}
              >
                <Plus size={22} color="white" />
              </Pressable>
              {showFabInput && (
                <View
                  className="absolute left-4 right-4 bg-white rounded-2xl border border-gray-100"
                  style={{
                    bottom: tabBarH + 80,
                    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
                  }}
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
        </>
      )}

      {/* ── Bottom tab bar (mobile only) ────────────────────────── */}
      {isMobile && (
        <View
          className="absolute bottom-0 left-0 right-0 flex-row bg-white"
          style={{
            height: tabBarH,
            borderTopWidth: 1,
            borderTopColor: '#f3f4f6',
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 8,
            elevation: 12,
          }}
        >
          {TABS.map(({ key, icon: Icon, label }) => {
            const active = view === key
            return (
              <Pressable
                key={key}
                onPress={() => { setView(key); if (showFabInput) setShowFabInput(false) }}
                className="flex-1 items-center justify-center gap-0.5"
                style={{ paddingBottom: 6 }}
              >
                <Icon size={22} color={active ? ORANGE : INACTIVE} />
                <Text
                  className="text-xs font-medium"
                  style={{ color: active ? ORANGE : INACTIVE, fontSize: 10 }}
                >
                  {label}
                </Text>
                {active && (
                  <View
                    className="absolute top-0 rounded-b-full"
                    style={{ height: 3, width: 28, backgroundColor: ORANGE }}
                  />
                )}
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}
