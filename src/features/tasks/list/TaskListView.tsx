import { useMemo, useState, useCallback, useRef } from 'react'
import { View, Text, Pressable, useWindowDimensions, Platform, TextInput, KeyboardAvoidingView, Modal } from 'react-native'
import { LayoutList, AlignLeft, Network, Search, Plus, Menu, Sun, MoreVertical, Calendar, Flag, Tag, ArrowRight, Target, Globe, Timer } from 'lucide-react-native'
import { useTasksQuery } from './useTasksQuery'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate } from '@/lib/dateSort'
import { TaskSkeleton } from '@/components/TaskSkeleton'
import { VirtualTaskList } from './VirtualTaskList'
import { FlatTaskList } from './FlatTaskList'
import { MindMapView } from './MindMapView'
import { SearchView } from '@/features/tasks/search/SearchView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTaskView } from './useTaskView'
import { ChecklistSwitcher } from '@/features/checklists/ChecklistSwitcher'
import { useCreateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { PlanYourDayModal } from '@/features/tasks/planday/PlanYourDayModal'
import { ExecuteModeView } from '@/features/tasks/execute/ExecuteModeView'
import { RawView } from '@/features/tasks/raw/RawView'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'
import { useChecklists } from '@/features/checklists/useChecklists'

interface TaskListViewProps {
  checklistId: number
}

interface ExecuteRawSplitViewProps {
  tasks: import('@/api/types').CheckvistTask[]
  checklistId: number
  onClose: () => void
}

function ExecuteRawSplitView({ tasks, checklistId, onClose }: ExecuteRawSplitViewProps) {
  const [rawTaskId, setRawTaskId] = useState<number | null>(null)
  const [leftPct, setLeftPct] = useState(50)
  const containerRef = useRef<View>(null)
  const dragging = useRef(false)

  const handleJumpToRaw = useCallback((taskId: number) => {
    setRawTaskId(taskId)
  }, [])

  const onDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const rect = (containerRef.current as unknown as HTMLElement)?.getBoundingClientRect()
      if (!rect) return
      const pct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100))
      setLeftPct(pct)
    }

    const onMouseUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <View ref={containerRef} style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ width: `${leftPct}%` as unknown as number }}>
        <ExecuteModeView
          tasks={tasks}
          checklistId={checklistId}
          onClose={onClose}
          onJumpToRaw={handleJumpToRaw}
        />
      </View>

      {/* Drag divider */}
      <div
        onMouseDown={onDividerMouseDown}
        style={{
          width: 6,
          cursor: 'col-resize',
          backgroundColor: '#E5E7EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          zIndex: 10,
          userSelect: 'none',
        }}
      >
        <div style={{
          width: 2,
          height: 32,
          borderRadius: 2,
          backgroundColor: '#9CA3AF',
        }} />
      </div>

      <View style={{ flex: 1 }}>
        <RawView checklistId={checklistId} taskId={rawTaskId} />
      </View>
    </View>
  )
}

const BLUE = '#4772FA'
const INACTIVE = '#9ca3af'

const TABS = [
  { key: 'date',    icon: LayoutList, label: 'Tasks'   },
  { key: 'execute', icon: Timer,      label: 'Execute' },
  { key: 'list',    icon: AlignLeft,  label: 'Outline' },
  { key: 'mindmap', icon: Network,    label: 'Map'     },
  { key: 'search',  icon: Search,     label: 'Search'  },
  { key: 'raw',     icon: Globe,      label: 'Raw'     },
] as const

export function TaskListView({ checklistId }: TaskListViewProps) {
  const { width } = useWindowDimensions()
  const isMobile = width < 768
  const { data: tasks, isLoading, isError } = useTasksQuery(checklistId)
  const [showFabInput, setShowFabInput] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')
  const [focusedId, setFocusedId] = useState<number | null>(null)
  const [showPlanMenu, setShowPlanMenu] = useState(false)
  const [showPlanYourDay, setShowPlanYourDay] = useState(false)
  const { view, setView, focusedTaskId } = useTaskView()
  const { mutate: createTask, isPending } = useCreateTask(checklistId)
  const toast = useToast()
  const { activeChecklistId } = useActiveChecklist()
  const { data: checklists } = useChecklists()
  const checklistName = checklists?.find((c) => c.id === activeChecklistId)?.name

  const groups = useMemo(() => {
    if (!tasks) return []
    const { allNodes } = buildTaskTree(tasks)
    return groupTasksByDate(allNodes)
  }, [tasks])

  const isEmpty = !isLoading && !isError && groups.length === 0
  const isSearch = view === 'search'

  const tabBarH = isMobile ? 64 : 0

  const submitNewTask = () => {
    const content = newTaskText.trim()
    if (!content) return
    createTask(
      { content, parent_id: null },
      {
        onSuccess: () => {
          setNewTaskText('')
          setShowFabInput(false)
          toast.success('Task created')
        },
        onError: () => toast.error('Failed to create task'),
      }
    )
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#F5F5F5' }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <View
        className="flex-row items-center bg-white px-4"
        style={{
          paddingTop: Platform.OS === 'android' ? 44 : 52,
          paddingBottom: 14,
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#EFEFEF',
          elevation: 2,
          shadowColor: '#000',
          shadowOpacity: 0.04,
          shadowRadius: 4,
        }}
      >
        <View className="flex-1">
          <ChecklistSwitcher />
        </View>

        {/* Web: show tabs inline in header */}
        {!isMobile && TABS.map(({ key, icon: Icon, label }) => {
          const active = view === key
          return (
            <Pressable
              key={key}
              onPress={() => setView(key)}
              hitSlop={6}
              className="flex-row items-center gap-1 px-2 py-1 rounded-lg"
              style={{ backgroundColor: active ? '#EEF2FF' : 'transparent' }}
            >
              <Icon size={16} color={active ? BLUE : '#666'} style={{ opacity: active ? 1 : 0.7 }} />
              <Text className="text-xs font-medium" style={{ color: active ? BLUE : '#666', opacity: active ? 1 : 0.8 }}>
                {label}
              </Text>
            </Pressable>
          )
        })}

        {/* Sun icon — Plan Your Day entry */}
        <Pressable hitSlop={8} onPress={() => setShowPlanMenu((v) => !v)}>
          <Sun size={20} color={showPlanMenu ? BLUE : '#666'} />
        </Pressable>

      </View>

      {/* Plan menu dropdown — rendered as Modal so it floats above all content on Android */}
      <Modal
        visible={showPlanMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPlanMenu(false)}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={() => setShowPlanMenu(false)}
        >
          {/* Position the card in the top-right corner below the header */}
          <View style={{
            position: 'absolute',
            top: Platform.OS === 'android' ? 100 : 108,
            right: 16,
            backgroundColor: 'white',
            borderRadius: 14,
            paddingVertical: 6,
            minWidth: 190,
            shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 20,
            shadowOffset: { width: 0, height: 6 }, elevation: 24,
          }}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, gap: 12 }}
              onPress={() => { setShowPlanMenu(false); setShowPlanYourDay(true) }}
            >
              <Target size={17} color={BLUE} />
              <Text style={{ fontSize: 14, color: '#222', fontWeight: '500' }}>Plan Your Day</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Plan Your Day modal */}
      {showPlanYourDay && tasks && (
        <PlanYourDayModal
          tasks={tasks}
          checklistId={checklistId}
          checklistName={checklistName}
          onClose={() => setShowPlanYourDay(false)}
        />
      )}

      {/* ── Execute view ────────────────────────────────────────── */}
      {view === 'execute' && tasks && (
        isMobile ? (
          <View style={{ flex: 1, paddingBottom: tabBarH }}>
            <ExecuteModeView
              tasks={tasks}
              checklistId={checklistId}
              onClose={() => setView('date')}
            />
          </View>
        ) : (
          <ExecuteRawSplitView tasks={tasks} checklistId={checklistId} onClose={() => setView('date')} />
        )
      )}

      {/* ── Raw view ────────────────────────────────────────────── */}
      {view === 'raw' && (
        <View style={{ flex: 1, paddingBottom: isMobile ? tabBarH : 0 }}>
          <RawView checklistId={checklistId} taskId={focusedTaskId} />
        </View>
      )}

      {/* ── Search view ─────────────────────────────────────────── */}
      {isSearch && (
        <SearchView checklistId={checklistId} />
      )}

      {/* ── Task views ──────────────────────────────────────────── */}
      {view !== 'raw' && view !== 'execute' && !isSearch && (
        <>
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
          {isMobile && view !== 'mindmap' && view !== 'raw' && view !== 'execute' && !showFabInput && (
            <Pressable
              onPress={() => setShowFabInput(true)}
              className="absolute right-5 items-center justify-center rounded-full"
              style={{
                bottom: tabBarH + 16,
                width: 54, height: 54,
                backgroundColor: BLUE,
                shadowColor: BLUE, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
              }}
            >
              <Plus size={24} color="white" />
            </Pressable>
          )}

          {/* Create task bottom sheet */}
          {showFabInput && (
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              className="absolute left-0 right-0 bottom-0"
              style={{ zIndex: 100 }}
            >
              <Pressable
                className="absolute inset-0"
                style={{ top: -2000 }}
                onPress={() => { setShowFabInput(false); setNewTaskText('') }}
              />
              <View
                className="bg-white"
                style={{
                  paddingBottom: tabBarH + 8,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, elevation: 24,
                }}
              >
                <TextInput
                  value={newTaskText}
                  onChangeText={setNewTaskText}
                  placeholder="What would you like to do?"
                  placeholderTextColor="#BDBDBD"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={submitNewTask}
                  style={{ fontSize: 16, color: '#222', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}
                />
                <Text style={{ fontSize: 13, color: '#BDBDBD', paddingHorizontal: 20, paddingBottom: 14 }}>
                  Description
                </Text>
                <View
                  className="flex-row items-center px-4 py-3"
                  style={{ borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: 20 }}
                >
                  <Pressable className="flex-row items-center gap-1.5" hitSlop={8}>
                    <Calendar size={18} color={BLUE} />
                    <Text style={{ fontSize: 13, color: BLUE, fontWeight: '500' }}>Today</Text>
                  </Pressable>
                  <Pressable hitSlop={8}><Flag size={18} color={INACTIVE} /></Pressable>
                  <Pressable hitSlop={8}><Tag size={18} color={INACTIVE} /></Pressable>
                  <Pressable hitSlop={8}><ArrowRight size={18} color={INACTIVE} /></Pressable>
                  <View className="flex-1" />
                  <Pressable
                    onPress={submitNewTask}
                    disabled={!newTaskText.trim() || isPending}
                    style={{ opacity: !newTaskText.trim() || isPending ? 0.4 : 1 }}
                    hitSlop={8}
                  >
                    <Text style={{ fontSize: 13, color: BLUE, fontWeight: '600' }}>Add</Text>
                  </Pressable>
                </View>
              </View>
            </KeyboardAvoidingView>
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
            borderTopColor: '#EFEFEF',
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
                <Icon size={22} color={active ? BLUE : INACTIVE} />
                <Text
                  className="text-xs font-medium"
                  style={{ color: active ? BLUE : INACTIVE, fontSize: 10 }}
                >
                  {label}
                </Text>
                {active && (
                  <View
                    className="absolute top-0 rounded-b-full"
                    style={{ height: 3, width: 28, backgroundColor: BLUE }}
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
