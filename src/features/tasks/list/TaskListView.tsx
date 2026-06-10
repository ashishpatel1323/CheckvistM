import { useMemo, useState, useEffect, useRef } from 'react'
import { View, Text, Pressable, useWindowDimensions, Platform, TextInput, KeyboardAvoidingView, Modal, ScrollView, Animated, Easing, TouchableWithoutFeedback } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LayoutList, AlignLeft, Network, Search, Plus, Calendar, Flag, Tag, ArrowRight, Globe, Timer, RefreshCw, ClipboardList, Repeat, LayoutGrid, X, MoreHorizontal, ChevronUp, ChevronDown, GripVertical } from 'lucide-react-native'
import { useTasksQuery } from './useTasksQuery'
import { buildTaskTree } from '@/lib/taskTree'
import { groupTasksByDate } from '@/lib/dateSort'
import { TaskSkeleton } from '@/components/TaskSkeleton'
import { VirtualTaskList } from './VirtualTaskList'
import { PriorityDateView } from './PriorityDateView'
import { FlatTaskList } from './FlatTaskList'
import { MindMapView } from './MindMapView'
import { SearchView } from '@/features/tasks/search/SearchView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useTaskView } from './useTaskView'
import { useTabBarConfig, PINNED_TAB_COUNT } from './useTabBarConfig'
import { BottomSheet } from '@/components/BottomSheet'
import { ChecklistSwitcher } from '@/features/checklists/ChecklistSwitcher'
import { useCreateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { ExecuteModeView, ExecuteStateProvider, ExecuteControlBar, ExecuteTaskList } from '@/features/tasks/execute/ExecuteModeView'
import { ExecutionLogView } from '@/features/tasks/execute/ExecutionLogView'
import { RawView } from '@/features/tasks/raw/RawView'
import { EisenhowerMatrixView } from './EisenhowerMatrixView'
import { RoutinesView } from '@/features/tasks/routines/RoutinesView'
import { TimerModeView, MiniTimerBar } from '@/features/tasks/routines/TimerModeView'
import { useRoutineStore } from '@/features/tasks/routines/useRoutineStore'
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

type RightPanel = { type: 'raw'; taskId: number } | { type: 'mindmap'; taskId: number } | null

function ExecuteRawSplitView({ tasks, checklistId, onClose }: ExecuteRawSplitViewProps) {
  const [rightPanel, setRightPanel] = useState<RightPanel>(null)
  const [focusedId, setFocusedId] = useState<number | null>(null)

  function openRaw(taskId: number) {
    setRightPanel({ type: 'raw', taskId })
  }

  function openMindmap(taskId: number) {
    setFocusedId(taskId)
    setRightPanel({ type: 'mindmap', taskId })
  }

  const hasPanel = rightPanel !== null

  return (
    <ExecuteStateProvider tasks={tasks} checklistId={checklistId} onJumpToRaw={openRaw} onJumpToMindmap={openMindmap}>
      <View style={{ flex: 1, flexDirection: 'column' }}>
        {/* Full-width horizontal control bar */}
        <ExecuteControlBar onClose={onClose} />

        {/* Left / right split below the bar */}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: hasPanel ? '25%' : '100%' }}>
            <ExecuteTaskList />
          </View>
          {hasPanel && (
            <>
              <View style={{ width: 1, backgroundColor: '#E5E7EB' }} />
              <View style={{ flex: 1, position: 'relative' }}>
                {/* Close panel button */}
                <Pressable
                  hitSlop={8}
                  onPress={() => setRightPanel(null)}
                  style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, padding: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.06)' }}
                >
                  <X size={14} color="#6B7280" />
                </Pressable>
                {rightPanel.type === 'raw' && (
                  <RawView checklistId={checklistId} taskId={rightPanel.taskId} />
                )}
                {rightPanel.type === 'mindmap' && (
                  <MindMapView
                    tasks={tasks}
                    checklistId={checklistId}
                    focusedId={focusedId}
                    setFocusedId={setFocusedId}
                    initialFocusId={rightPanel.taskId}
                  />
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </ExecuteStateProvider>
  )
}

const SPARKLE_CHARS = ['✦', '✧', '★', '✸', '✺', '❋', '✻', '✼', '⋆', '✵']
const SPARKLE_COLORS = ['#FBBF24', '#F59E0B', '#FCD34D', '#FDE68A', '#FFFFFF', '#C4B5FD', '#A78BFA', '#60A5FA', '#34D399', '#FB7185']

interface Sparkle {
  id: number
  x: Animated.Value
  y: Animated.Value
  opacity: Animated.Value
  scale: Animated.Value
  char: string
  color: string
  startX: number
  startY: number
}

function TimeZoomOverlay({ timeStr, onClose }: { timeStr: string; onClose: () => void }) {
  const pctIdx = timeStr.indexOf(' (')
  const timeLabel = pctIdx === -1 ? timeStr : timeStr.slice(0, pctIdx)
  const pctLabel = pctIdx === -1 ? '' : timeStr.slice(pctIdx + 1)
  const { width, height } = useWindowDimensions()
  const scaleAnim = useRef(new Animated.Value(0)).current
  const opacityAnim = useRef(new Animated.Value(0)).current
  const [sparkles, setSparkles] = useState<Sparkle[]>([])
  const sparkleIdRef = useRef(0)

  // Entry animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 200 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [])

  // Continuously spawn sparkles
  useEffect(() => {
    let alive = true
    const spawn = () => {
      if (!alive) return
      const id = ++sparkleIdRef.current
      const startX = Math.random() * width
      const startY = Math.random() * height
      const x = new Animated.Value(startX)
      const y = new Animated.Value(startY)
      const opacity = new Animated.Value(0)
      const scale = new Animated.Value(0)
      const char = SPARKLE_CHARS[Math.floor(Math.random() * SPARKLE_CHARS.length)]
      const color = SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]
      const angle = Math.random() * Math.PI * 2
      const distance = 60 + Math.random() * 140
      const duration = 900 + Math.random() * 800

      const s: Sparkle = { id, x, y, opacity, scale, char, color, startX, startY }
      setSparkles(prev => [...prev.slice(-30), s])

      Animated.parallel([
        Animated.timing(x, { toValue: startX + Math.cos(angle) * distance, duration, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(y, { toValue: startY + Math.sin(angle) * distance, duration, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: duration * 0.25, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: duration * 0.75, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(scale, { toValue: 0.8 + Math.random() * 0.8, duration: duration * 0.3, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0, duration: duration * 0.7, useNativeDriver: true }),
        ]),
      ]).start(() => setSparkles(prev => prev.filter(sp => sp.id !== id)))

      if (alive) setTimeout(spawn, 60 + Math.random() * 80)
    }
    // Burst of initial sparkles
    for (let i = 0; i < 8; i++) setTimeout(spawn, i * 40)
    spawn()
    return () => { alive = false }
  }, [width, height])

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, { toValue: 0.05, duration: 220, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(onClose)
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={dismiss}>
      <TouchableWithoutFeedback onPress={dismiss}>
        <Animated.View style={{
          flex: 1,
          backgroundColor: 'rgba(10,10,20,0.88)',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: opacityAnim,
        }}>
          {/* Sparkles */}
          {sparkles.map(sp => (
            <Animated.Text
              key={sp.id}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                color: sp.color,
                fontSize: 18 + Math.random() * 16,
                transform: [{ translateX: sp.x }, { translateY: sp.y }, { scale: sp.scale }],
                opacity: sp.opacity,
              }}
            >
              {sp.char}
            </Animated.Text>
          ))}

          {/* Time */}
          <Animated.View style={{ transform: [{ scale: scaleAnim }], alignItems: 'center' }}>
            <Text style={{
              fontSize: 88,
              fontWeight: '800',
              color: '#FFFFFF',
              letterSpacing: -2,
              textShadowColor: 'rgba(167,139,250,0.8)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 40,
            }}>
              {timeLabel}{' '}
              <Text style={{ fontSize: 32, fontWeight: '700', letterSpacing: -1 }}>{pctLabel}</Text>
            </Text>
            <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', marginTop: 4, letterSpacing: 3 }}>
              TAP TO CLOSE
            </Text>
          </Animated.View>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

// Day spans full 24 hours: 00:00 AM to 11:59 PM
const DAY_START_HOUR = 0
const DAY_END_HOUR = 24

function DailyProgressBar() {
  const [now, setNow] = useState(() => new Date())
  const [showZoom, setShowZoom] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Auto-show every 10 minutes
  useEffect(() => {
    const id = setInterval(() => setShowZoom(true), 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const totalSeconds = (DAY_END_HOUR - DAY_START_HOUR) * 3600
  const elapsedSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() -
    DAY_START_HOUR * 3600
  const pct = Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100))

  const hours = now.getHours()
  const minutes = now.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  const timeLabel = `${displayHour}:${String(minutes).padStart(2, '0')} ${ampm}`
  const pctLabel = `(${pct.toFixed(2)}%)`
  const timeStr = `${timeLabel} ${pctLabel}`

  const beforeDay = elapsedSeconds < 0
  const afterDay = elapsedSeconds >= totalSeconds

  const totalHours = DAY_END_HOUR - DAY_START_HOUR
  const barColor = beforeDay || afterDay ? '#D1D5DB' : pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#4772FA'

  // Only label every 3 hours (6AM, 9AM, 12PM, 3PM, 6PM, 9PM) to avoid crowding on mobile
  const labelHours = [3, 6, 9, 12, 15, 18, 21]
  const labels = labelHours.map((h) => {
    const ampm = h >= 12 ? 'PM' : 'AM'
    const disp = h % 12 || 12
    return { pct: (h / totalHours) * 100, label: `${disp}${ampm}` }
  })

  // Quarter-hour ticks for visual rhythm
  const ticks: number[] = []
  for (let h = 0; h < totalHours; h++) {
    ticks.push(((h + 0.25) / totalHours) * 100)
    ticks.push(((h + 0.5) / totalHours) * 100)
    ticks.push(((h + 0.75) / totalHours) * 100)
  }

  // Clamp label position so it doesn't bleed off edges
  const labelLeft = Math.min(Math.max(pct, 4), 88)

  return (
    <Pressable
      onPress={() => setShowZoom(true)}
      style={{
        backgroundColor: 'white',
        paddingHorizontal: 16,
        paddingTop: 6,
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: '#EFEFEF',
      }}
    >
      {showZoom && <TimeZoomOverlay timeStr={timeStr} onClose={() => setShowZoom(false)} />}

      {/* Time label + track in a single compact row */}
      <View style={{ position: 'relative' }}>

        {/* Floating time label pinned above current position */}
        {!beforeDay && !afterDay && (
          <View style={{
            position: 'absolute',
            left: `${labelLeft}%` as unknown as number,
            top: 0,
            width: 110,
            transform: [{ translateX: -55 }],
            zIndex: 10,
            alignItems: 'center',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: barColor, letterSpacing: 0.1 }} numberOfLines={1}>
                {timeLabel}
              </Text>
              <Text style={{ fontSize: 9, fontWeight: '600', color: barColor }} numberOfLines={1}>
                {pctLabel}
              </Text>
            </View>
          </View>
        )}

        <View style={{ height: 18 }} />

        {/* Track */}
        <View style={{ height: 4, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${pct}%`, borderRadius: 3, backgroundColor: barColor }} />
        </View>

        {/* Quarter-hour tick marks */}
        {ticks.map((p) => (
          <View
            key={p}
            style={{
              position: 'absolute',
              left: `${p}%` as unknown as number,
              top: 18,
              width: 1,
              height: 3,
              backgroundColor: 'rgba(0,0,0,0.1)',
            }}
          />
        ))}

        {/* Hour ticks (slightly taller) */}
        {labels.map(({ pct: p }) => (
          <View
            key={p}
            style={{
              position: 'absolute',
              left: `${p}%` as unknown as number,
              top: 18,
              width: 1,
              height: 5,
              backgroundColor: 'rgba(0,0,0,0.2)',
            }}
          />
        ))}

        {/* Sparse hour labels */}
        <View style={{ position: 'relative', height: 12, marginTop: 4 }}>
          {labels.map(({ pct: p, label }) => (
            <Text
              key={p}
              style={{
                position: 'absolute',
                left: `${p}%` as unknown as number,
                fontSize: 9,
                color: '#C4C4C4',
                transform: [{ translateX: -10 }],
              }}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>
    </Pressable>
  )
}

const BLUE = '#4772FA'
const INACTIVE = '#9ca3af'

const TABS = [
  { key: 'date',    icon: LayoutList,    label: 'Tasks'   },
  { key: 'matrix',  icon: LayoutGrid,    label: 'Matrix'  },
  { key: 'execute', icon: Timer,         label: 'Execute' },
  { key: 'log',      icon: ClipboardList, label: 'Log'      },
  { key: 'routines', icon: Repeat,        label: 'Routines' },
  { key: 'list',    icon: AlignLeft,     label: 'Outline' },
  { key: 'mindmap', icon: Network,       label: 'Map'     },
  { key: 'search',  icon: Search,        label: 'Search'  },
  { key: 'raw',     icon: Globe,         label: 'Raw'     },
] as const

export function TaskListView({ checklistId }: TaskListViewProps) {
  const { width } = useWindowDimensions()
  const isMobile = width < 768
  const { data: tasks, isLoading, isError, refetch, isFetching } = useTasksQuery(checklistId)
  const [showFabInput, setShowFabInput] = useState(false)
  const [newTaskText, setNewTaskText] = useState('')
  const [focusedId, setFocusedId] = useState<number | null>(null)
const { view, setView, focusedTaskId } = useTaskView()
  const { order: tabOrder, moveTab } = useTabBarConfig()
  const [showMoreSheet, setShowMoreSheet] = useState(false)
  const [customizing, setCustomizing] = useState(false)

  const orderedTabs = useMemo(
    () => tabOrder.map((key) => TABS.find((t) => t.key === key)).filter((t): t is (typeof TABS)[number] => !!t),
    [tabOrder]
  )
  const pinnedTabs = orderedTabs.slice(0, PINNED_TAB_COUNT)
  const overflowTabs = orderedTabs.slice(PINNED_TAB_COUNT)
  const isOverflowActive = overflowTabs.some((t) => t.key === view)

  const { mutate: createTask, isPending } = useCreateTask(checklistId)
  const toast = useToast()
  const { activeChecklistId } = useActiveChecklist()
  const { activeTimer, timerMinimized } = useRoutineStore()
  const { data: checklists } = useChecklists()
  const checklistName = checklists?.find((c) => c.id === activeChecklistId)?.name

  const groups = useMemo(() => {
    if (!tasks) return []
    const { allNodes } = buildTaskTree(tasks)
    return groupTasksByDate(allNodes)
  }, [tasks])

  const isEmpty = !isLoading && !isError && groups.length === 0
  const isSearch = view === 'search'

  const taskNames = useMemo(() => {
    const map: Record<number, string> = {}
    if (tasks) for (const t of tasks) map[t.id] = t.content
    return map
  }, [tasks])

  const insets = useSafeAreaInsets()
  const tabBarH = isMobile ? 64 : 0

  const submitNewTask = () => {
    const content = newTaskText.trim()
    if (!content) return
    const today = new Date()
    const due_date = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`
    createTask(
      { content, parent_id: null, priority: 1, due_date },
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
          paddingTop: insets.top + 8,
          paddingBottom: 10,
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

        {/* Desktop: new task button */}
        {!isMobile && (
          <Pressable hitSlop={8} onPress={() => setShowFabInput((v) => !v)}>
            <Plus size={20} color={showFabInput ? BLUE : '#666'} />
          </Pressable>
        )}

        {/* Refresh button */}
        <Pressable hitSlop={8} onPress={() => refetch()} disabled={isFetching} style={{ opacity: isFetching ? 0.4 : 1 }}>
          <RefreshCw size={20} color="#666" />
        </Pressable>


      </View>

      {/* Desktop create task bar */}
      {!isMobile && showFabInput && (
        <View
          style={{
            backgroundColor: 'white',
            borderBottomWidth: 1,
            borderBottomColor: '#EFEFEF',
            paddingHorizontal: 16,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <TextInput
            value={newTaskText}
            onChangeText={setNewTaskText}
            placeholder="New task…"
            placeholderTextColor="#BDBDBD"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitNewTask}
            style={{ flex: 1, fontSize: 14, color: '#222' }}
          />
          <Pressable hitSlop={8} onPress={() => { setShowFabInput(false); setNewTaskText('') }}>
            <Text style={{ color: '#9ca3af', fontSize: 13 }}>Cancel</Text>
          </Pressable>
          <Pressable
            hitSlop={8}
            onPress={submitNewTask}
            disabled={!newTaskText.trim() || isPending}
            style={{ opacity: !newTaskText.trim() || isPending ? 0.4 : 1 }}
          >
            <Text style={{ fontSize: 13, color: BLUE, fontWeight: '600' }}>Add</Text>
          </Pressable>
        </View>
      )}

      {/* Daily time progress bar */}
      <DailyProgressBar />

      {/* ── Eisenhower Matrix view ──────────────────────────────── */}
      {view === 'matrix' && tasks && (
        <View style={{ flex: 1, paddingBottom: isMobile ? tabBarH : 0 }}>
          <EisenhowerMatrixView tasks={tasks} checklistId={checklistId} isMobile={isMobile} />
        </View>
      )}

      {/* ── Execute view ────────────────────────────────────────── */}
      {view === 'execute' && tasks && (
        isMobile ? (
          <View style={{ flex: 1, paddingBottom: tabBarH }}>
            <ExecuteModeView
              tasks={tasks}
              checklistId={checklistId}
              onClose={() => setView('date')}
              onJumpToMindmap={(id) => { setView('mindmap', id) }}
            />
          </View>
        ) : (
          <ExecuteRawSplitView tasks={tasks} checklistId={checklistId} onClose={() => setView('date')} />
        )
      )}

      {/* ── Execution log view ──────────────────────────────────── */}
      {view === 'log' && (
        <View style={{ flex: 1, paddingBottom: isMobile ? tabBarH : 0 }}>
          <ExecutionLogView checklistId={checklistId} taskNames={taskNames} />
        </View>
      )}

      {/* ── Routines view ───────────────────────────────────────── */}
      {view === 'routines' && (
        <View style={{ flex: 1, paddingBottom: isMobile ? tabBarH : 0 }}>
          <RoutinesView checklistId={checklistId} />
        </View>
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
      {view !== 'raw' && view !== 'execute' && view !== 'log' && view !== 'routines' && view !== 'matrix' && !isSearch && (
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
                <PriorityDateView groups={groups} checklistId={checklistId} isMobile={isMobile} focusedId={focusedId} setFocusedId={setFocusedId} checklistName={checklistName} />
              )}
              {view === 'list' && (
                <FlatTaskList tasks={tasks} checklistId={checklistId} isMobile={isMobile} focusedId={focusedId} setFocusedId={setFocusedId} />
              )}
              {view === 'mindmap' && (
                <ErrorBoundary>
                  <MindMapView tasks={tasks} checklistId={checklistId} focusedId={focusedId} setFocusedId={setFocusedId} initialFocusId={focusedTaskId} />
                </ErrorBoundary>
              )}
            </View>
          )}

        </>
      )}

      {/* Mobile FAB — shown on all views except raw/search */}
      {isMobile && view !== 'raw' && view !== 'search' && view !== 'log' && view !== 'routines' && !showFabInput && (
        <Pressable
          onPress={() => setShowFabInput(true)}
          className="absolute right-5 items-center justify-center rounded-full"
          style={{
            bottom: tabBarH + 16,
            width: 54, height: 54,
            backgroundColor: BLUE,
            shadowColor: BLUE, shadowOpacity: 0.4, shadowRadius: 14, elevation: 8,
            zIndex: 50,
          }}
        >
          <Plus size={24} color="white" />
        </Pressable>
      )}

      {/* Mobile create task bottom sheet */}
      {isMobile && showFabInput && (
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

      {/* ── Bottom tab bar (mobile only) ────────────────────────── */}
      {/* Mini timer bar — sits above the tab bar when timer is minimized */}
      {activeTimer && timerMinimized && (
        <View style={{ position: 'absolute', bottom: isMobile ? tabBarH : 0, left: 0, right: 0, zIndex: 40 }}>
          <MiniTimerBar />
        </View>
      )}

      {/* Full-screen timer — rendered here so it persists across tab switches */}
      {activeTimer && !timerMinimized && <TimerModeView />}

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
          {pinnedTabs.map(({ key, icon: Icon, label }) => {
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

          {/* More tab — opens sheet with remaining + customizable order */}
          <Pressable
            onPress={() => setShowMoreSheet(true)}
            className="flex-1 items-center justify-center gap-0.5"
            style={{ paddingBottom: 6 }}
          >
            <MoreHorizontal size={22} color={isOverflowActive ? BLUE : INACTIVE} />
            <Text
              className="text-xs font-medium"
              style={{ color: isOverflowActive ? BLUE : INACTIVE, fontSize: 10 }}
            >
              More
            </Text>
            {isOverflowActive && (
              <View
                className="absolute top-0 rounded-b-full"
                style={{ height: 3, width: 28, backgroundColor: BLUE }}
              />
            )}
          </Pressable>
        </View>
      )}

      {/* ── More / customize tabs sheet (mobile only) ───────────── */}
      {isMobile && (
        <BottomSheet
          open={showMoreSheet}
          onClose={() => { setShowMoreSheet(false); setCustomizing(false) }}
          title={customizing ? 'Reorder tabs' : 'More'}
        >
          <View style={{ gap: 4 }}>
            {orderedTabs.map(({ key, icon: Icon, label }, idx) => {
              const active = view === key
              const pinned = idx < PINNED_TAB_COUNT
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    if (customizing) return
                    setView(key)
                    if (showFabInput) setShowFabInput(false)
                    setShowMoreSheet(false)
                  }}
                  className="flex-row items-center px-3 py-2.5 rounded-xl"
                  style={{ backgroundColor: active && !customizing ? '#EEF2FF' : 'transparent', gap: 12 }}
                >
                  {customizing && <GripVertical size={16} color="#D1D5DB" />}
                  <Icon size={20} color={active && !customizing ? BLUE : '#666'} />
                  <Text
                    className="flex-1 text-sm font-medium"
                    style={{ color: active && !customizing ? BLUE : '#333' }}
                  >
                    {label}
                  </Text>
                  {!customizing && pinned && (
                    <Text className="text-xs" style={{ color: '#9ca3af' }}>Pinned</Text>
                  )}
                  {customizing && (
                    <View className="flex-row items-center" style={{ gap: 4 }}>
                      <Pressable
                        hitSlop={8}
                        onPress={() => moveTab(key, 'up')}
                        disabled={idx === 0}
                        style={{ opacity: idx === 0 ? 0.3 : 1, padding: 4 }}
                      >
                        <ChevronUp size={18} color="#666" />
                      </Pressable>
                      <Pressable
                        hitSlop={8}
                        onPress={() => moveTab(key, 'down')}
                        disabled={idx === orderedTabs.length - 1}
                        style={{ opacity: idx === orderedTabs.length - 1 ? 0.3 : 1, padding: 4 }}
                      >
                        <ChevronDown size={18} color="#666" />
                      </Pressable>
                    </View>
                  )}
                </Pressable>
              )
            })}
          </View>

          {customizing && (
            <Text className="text-xs mt-2 px-1" style={{ color: '#9ca3af' }}>
              The first {PINNED_TAB_COUNT} tabs appear in the bottom bar. Reorder to change which ones are pinned.
            </Text>
          )}

          <Pressable
            onPress={() => setCustomizing((v) => !v)}
            className="items-center justify-center mt-3 py-2.5 rounded-xl"
            style={{ backgroundColor: '#F5F5F5' }}
          >
            <Text className="text-sm font-semibold" style={{ color: BLUE }}>
              {customizing ? 'Done' : 'Customize tab order'}
            </Text>
          </Pressable>
        </BottomSheet>
      )}
    </View>
  )
}
