import { useMemo, useState, useEffect, useRef } from 'react'
import { View, Text, Pressable, useWindowDimensions, Platform, TextInput, KeyboardAvoidingView, Modal, ScrollView, Animated, Easing, TouchableWithoutFeedback } from 'react-native'
import { LayoutList, AlignLeft, Network, Search, Plus, Sun, Calendar, Flag, Tag, ArrowRight, Target, Globe, Timer, RefreshCw, ClipboardList } from 'lucide-react-native'
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
import { ChecklistSwitcher } from '@/features/checklists/ChecklistSwitcher'
import { useCreateTask } from './useTasksQuery'
import { useToast } from '@/components/Toast'
import { PlanYourDayModal } from '@/features/tasks/planday/PlanYourDayModal'
import { ExecuteModeView, ExecuteStateProvider, ExecuteControlBar, ExecuteTaskList } from '@/features/tasks/execute/ExecuteModeView'
import { ExecutionLogView } from '@/features/tasks/execute/ExecutionLogView'
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

  return (
    <ExecuteStateProvider tasks={tasks} checklistId={checklistId} onJumpToRaw={setRawTaskId}>
      <View style={{ flex: 1, flexDirection: 'column' }}>
        {/* Full-width horizontal control bar */}
        <ExecuteControlBar onClose={onClose} />

        {/* Left / right split below the bar */}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={{ width: rawTaskId !== null ? '25%' : '100%' }}>
            <ExecuteTaskList />
          </View>
          {rawTaskId !== null && (
            <>
              <View style={{ width: 1, backgroundColor: '#E5E7EB' }} />
              <View style={{ flex: 1 }}>
                <RawView checklistId={checklistId} taskId={rawTaskId} />
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
              {timeStr}
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

// ─── Shimmer bar ──────────────────────────────────────────────────────────────

function ShimmerBar({ pct, color }: { pct: number; color: string }) {
  const [width, setWidth] = useState(0)
  const anim = useRef(new Animated.Value(0)).current
  const STREAK = 60

  useEffect(() => {
    if (width <= 0) return
    anim.setValue(0)
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ])
    ).start()
  }, [anim, width])

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-STREAK, width + STREAK],
  })

  return (
    <View
      style={{ height: '100%', width: `${pct}%`, borderRadius: 3, backgroundColor: color, overflow: 'hidden' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={{
          position: 'absolute',
          top: 0, bottom: 0,
          width: STREAK,
          backgroundColor: 'rgba(255,255,255,0.5)',
          transform: [{ translateX }, { skewX: '-15deg' }],
        }}
      />
    </View>
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
  const timeStr = `${displayHour}:${String(minutes).padStart(2, '0')} ${ampm}`

  const beforeDay = elapsedSeconds < 0
  const afterDay = elapsedSeconds >= totalSeconds

  // Build tick marks: every 30 min, label every hour
  const totalHours = DAY_END_HOUR - DAY_START_HOUR
  const ticks: { pct: number; isHour: boolean; label: string }[] = []
  for (let h = 0; h <= totalHours; h++) {
    const hourVal = DAY_START_HOUR + h
    // full hour tick
    if (h > 0 && h < totalHours) {
      const tickPct = (h / totalHours) * 100
      const ampm = hourVal >= 12 ? 'PM' : 'AM'
      const disp = hourVal % 12 || 12
      ticks.push({ pct: tickPct, isHour: true, label: `${disp}${ampm}` })
    }
    // half-hour tick
    if (h < totalHours) {
      const halfPct = ((h + 0.5) / totalHours) * 100
      ticks.push({ pct: halfPct, isHour: false, label: '' })
    }
  }

  const barColor = beforeDay || afterDay ? '#D1D5DB' : pct > 80 ? '#EF4444' : pct > 60 ? '#F59E0B' : '#4772FA'

  return (
    <View style={{
      backgroundColor: 'white',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
      borderBottomWidth: 1,
      borderBottomColor: '#EFEFEF',
    }}>
      {showZoom && <TimeZoomOverlay timeStr={timeStr} onClose={() => setShowZoom(false)} />}

      {/* Track + filled bar + tick marks + floating time label */}
      <View style={{ position: 'relative' }}>

        {/* Floating time label above the bar, positioned at current pct */}
        {!beforeDay && !afterDay && (
          <Pressable
            onPress={() => setShowZoom(true)}
            hitSlop={10}
            style={{
              position: 'absolute',
              left: `${pct}%` as unknown as number,
              top: -2,
              transform: [{ translateX: -28 }],
              zIndex: 10,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: barColor, letterSpacing: 0.2 }}>
              {timeStr}
            </Text>
          </Pressable>
        )}

        {/* Spacer so the label doesn't overlap the bar */}
        <View style={{ height: 22 }} />

        {/* Track */}
        <View style={{ height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
          <ShimmerBar pct={pct} color={barColor} />
        </View>

        {/* Ticks overlaid on track */}
        {ticks.map((tick) => (
          <View
            key={tick.pct}
            style={{
              position: 'absolute',
              left: `${tick.pct}%` as unknown as number,
              top: 16,
              width: 1,
              height: 6,
              backgroundColor: tick.isHour ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.12)',
              transform: [{ translateX: -0.5 }],
            }}
          />
        ))}

        {/* Hour labels below the bar */}
        <View style={{ position: 'relative', height: 14, marginTop: 2 }}>
          {ticks.filter(t => t.isHour).map((tick) => (
            <Text
              key={tick.pct}
              style={{
                position: 'absolute',
                left: `${tick.pct}%` as unknown as number,
                fontSize: 9,
                color: '#9ca3af',
                transform: [{ translateX: -12 }],
              }}
            >
              {tick.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  )
}

const BLUE = '#4772FA'
const INACTIVE = '#9ca3af'

const TABS = [
  { key: 'date',    icon: LayoutList,    label: 'Tasks'   },
  { key: 'execute', icon: Timer,         label: 'Execute' },
  { key: 'log',     icon: ClipboardList, label: 'Log'     },
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

  const taskNames = useMemo(() => {
    const map: Record<number, string> = {}
    if (tasks) for (const t of tasks) map[t.id] = t.content
    return map
  }, [tasks])

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

        {/* Sun icon — Plan Your Day entry */}
        <Pressable hitSlop={8} onPress={() => setShowPlanMenu((v) => !v)}>
          <Sun size={20} color={showPlanMenu ? BLUE : '#666'} />
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

      {/* ── Execution log view ──────────────────────────────────── */}
      {view === 'log' && (
        <View style={{ flex: 1, paddingBottom: isMobile ? tabBarH : 0 }}>
          <ExecutionLogView checklistId={checklistId} taskNames={taskNames} />
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
      {view !== 'raw' && view !== 'execute' && view !== 'log' && !isSearch && (
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
                  <MindMapView tasks={tasks} checklistId={checklistId} focusedId={focusedId} setFocusedId={setFocusedId} />
                </ErrorBoundary>
              )}
            </View>
          )}

        </>
      )}

      {/* Mobile FAB — shown on all views except raw/search */}
      {isMobile && view !== 'raw' && view !== 'search' && view !== 'log' && !showFabInput && (
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
