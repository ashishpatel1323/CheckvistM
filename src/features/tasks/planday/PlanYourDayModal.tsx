import { useState, useMemo } from 'react'
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native'
import {
  X, Calendar, CheckCheck, ChevronLeft, ChevronRight,
  CalendarDays, Sunrise, RotateCw, CalendarPlus, XSquare,
  type LucideProps,
} from 'lucide-react-native'
import {
  addDays, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, differenceInDays, isPast, isToday, format,
} from 'date-fns'
import type { ForwardRefExoticComponent } from 'react'
import type { CheckvistTask } from '@/api/types'
import { toApiDate, getUpcomingSaturday, parseApiDate, humanizeDueDate } from '@/lib/dateUtils'
import { classifyTask } from '@/lib/dateSort'
import { useUpdateTask, useCloseTask } from '@/features/tasks/list/useTasksQuery'
import { useToast } from '@/components/Toast'
import { hapticMedium } from '@/platform/haptics'

const BLUE = '#4772FA'
const ORANGE = '#E8632A'

interface Props {
  tasks: CheckvistTask[]
  checklistId: number
  checklistName?: string
  onClose: () => void
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning! ☀️'
  if (h < 17) return 'Good afternoon! 🌤️'
  return 'Good evening! 🌙'
}

function overdueDaysLabel(due: string): string {
  const date = parseApiDate(due)
  if (!date) return ''
  const days = differenceInDays(new Date(), date)
  const label = humanizeDueDate(due)
  if (days > 0) return `${label}, ${days}d overdue`
  return label
}

interface DateTile {
  Icon: ForwardRefExoticComponent<LucideProps>
  label: string
  key: string
}

const DATE_TILES: DateTile[] = [
  { Icon: CalendarDays, label: 'Today',    key: 'today'    },
  { Icon: Sunrise,      label: 'Tomorrow', key: 'tomorrow' },
  { Icon: RotateCw,     label: '+1 Week',  key: 'week'     },
  { Icon: CalendarPlus, label: 'Saturday', key: 'saturday' },
  { Icon: CalendarPlus, label: 'Pick date',key: 'pick'     },
  { Icon: XSquare,      label: 'Clear',    key: 'clear'    },
]

const PRIORITY_OPTIONS = [
  { label: 'P1',  value: 1, color: '#dc2626' },
  { label: 'P4',  value: 4, color: '#d97706' },
  { label: 'P11', value: 0, color: '#6b7280' },
] as const

const TIME_TAGS = ['5m', '10m', '30m']

function resolveDateKey(key: string): string | null {
  const today = new Date()
  switch (key) {
    case 'today':    return toApiDate(today)
    case 'tomorrow': return toApiDate(addDays(today, 1))
    case 'week':     return toApiDate(addDays(today, 7))
    case 'saturday': return toApiDate(getUpcomingSaturday())
    case 'clear':    return null
    default:         return null
  }
}

export function PlanYourDayModal({ tasks, checklistId, checklistName, onClose }: Props) {
  const [phase, setPhase] = useState<'intro' | 'reviewing' | 'done'>('intro')
  const [taskIndex, setTaskIndex] = useState(0)
  const [pendingPriority, setPendingPriority] = useState<number | null>(null)
  const [pendingTime, setPendingTime] = useState<string | null>(null)
  const [pendingDate, setPendingDate] = useState<string | null | undefined>(undefined) // undefined = not yet changed
  const [showCalendar, setShowCalendar] = useState(false)
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()))

  const { mutate: updateTask } = useUpdateTask(checklistId)
  const { mutate: closeTask } = useCloseTask(checklistId)
  const toast = useToast()

  const planTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status !== 0) return false
      const group = classifyTask(t as Parameters<typeof classifyTask>[0])
      return group === 'overdue' || group === 'today'
    })
  }, [tasks])

  const current = planTasks[taskIndex]
  const total = planTasks.length

  const advance = () => {
    setPendingPriority(null)
    setPendingTime(null)
    setPendingDate(undefined)
    if (taskIndex + 1 >= total) {
      setPhase('done')
    } else {
      setTaskIndex((i) => i + 1)
    }
  }

  const applyDateAndAdvance = (key: string) => {
    if (!current) return
    hapticMedium()
    const due_date = resolveDateKey(key)
    const payload: { due_date?: string | null; priority?: number } = { due_date }
    if (pendingPriority !== null) payload.priority = pendingPriority
    setPendingDate(due_date)
    updateTask(
      { taskId: current.id, payload },
      {
        onSuccess: () => advance(),
        onError: () => toast.error('Failed to update task'),
      }
    )
  }

  const applyPickedDateAndAdvance = (date: Date) => {
    if (!current) return
    hapticMedium()
    const due_date = toApiDate(date)
    const payload: { due_date?: string | null; priority?: number } = { due_date }
    if (pendingPriority !== null) payload.priority = pendingPriority
    setPendingDate(due_date)
    setShowCalendar(false)
    updateTask(
      { taskId: current.id, payload },
      {
        onSuccess: () => advance(),
        onError: () => toast.error('Failed to update task'),
      }
    )
  }

  const handleSkip = () => {
    hapticMedium()
    if (pendingPriority !== null) {
      updateTask(
        { taskId: current.id, payload: { priority: pendingPriority } },
        { onSuccess: () => advance() }
      )
    } else {
      advance()
    }
  }

  const togglePriority = (value: number) => {
    hapticMedium()
    setPendingPriority((prev) => (prev === value ? null : value))
  }

  const toggleTime = (tag: string) => {
    hapticMedium()
    setPendingTime((prev) => (prev === tag ? null : tag))
  }

  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#F5F5F5' }}>

        {/* ── INTRO ───────────────────────────────────────────── */}
        {phase === 'intro' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <View style={{
              width: 140, height: 140, borderRadius: 70,
              backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center',
              marginBottom: 36,
              shadowColor: BLUE, shadowOpacity: 0.35, shadowRadius: 24, elevation: 10,
            }}>
              <Calendar size={64} color="white" />
            </View>
            <Text style={{ fontSize: 26, fontWeight: '700', color: BLUE, marginBottom: 16, textAlign: 'center' }}>
              Plan Your Day
            </Text>
            <Text style={{ fontSize: 15, color: '#666', lineHeight: 24, textAlign: 'center', marginBottom: 48 }}>
              You can deal with Today and Overdue tasks one by one, and manage your Inbox if needed.
            </Text>
            {total === 0 ? (
              <>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 32, textAlign: 'center' }}>
                  No overdue or today tasks to review.
                </Text>
                <Pressable onPress={onClose} style={{ paddingVertical: 14 }}>
                  <Text style={{ fontSize: 15, color: BLUE, fontWeight: '500' }}>Close</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => setPhase('reviewing')}
                  style={{
                    backgroundColor: BLUE, borderRadius: 28, paddingVertical: 16,
                    width: '100%', alignItems: 'center', marginBottom: 20,
                    shadowColor: BLUE, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 17, fontWeight: '600' }}>
                    Start ({total} task{total !== 1 ? 's' : ''})
                  </Text>
                </Pressable>
                <Pressable onPress={onClose} style={{ paddingVertical: 14 }}>
                  <Text style={{ fontSize: 15, color: BLUE }}>Not Now</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* ── REVIEWING ───────────────────────────────────────── */}
        {phase === 'reviewing' && current && (
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
              paddingTop: Platform.OS === 'android' ? 48 : 56, paddingBottom: 12,
              backgroundColor: '#F5F5F5',
            }}>
              <Pressable onPress={onClose} hitSlop={8}>
                <X size={22} color="#666" />
              </Pressable>
              <View style={{ flex: 1, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#222' }}>{greeting()}</Text>
                <Text style={{ fontSize: 12, color: '#888', marginTop: 1 }}>Start the day right with a smile.</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#BDBDBD', fontWeight: '500' }}>{taskIndex + 1}/{total}</Text>
            </View>

            {/* Task card */}
            <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 12 }}>
              <View style={{
                backgroundColor: 'white', borderRadius: 16, padding: 20,
                shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 }, elevation: 2,
              }}>
                {current.due && (() => {
                  const date = parseApiDate(current.due)
                  const isOverdue = date && isPast(date) && !isToday(date)
                  return (
                    <Text style={{ fontSize: 13, fontWeight: '500', marginBottom: 6, color: isOverdue ? '#E53935' : BLUE }}>
                      {isOverdue ? overdueDaysLabel(current.due) : humanizeDueDate(current.due)}
                    </Text>
                  )
                })()}
                {checklistName && (
                  <Text style={{ fontSize: 12, color: '#999', marginBottom: 10 }}>{checklistName}</Text>
                )}
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#111', lineHeight: 28 }}>
                  {current.content}
                </Text>
                {/* Current priority badge */}
                {current.priority > 0 && (() => {
                  const opt = PRIORITY_OPTIONS.find((o) => o.value === current.priority)
                  const color = opt?.color ?? '#6b7280'
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 }}>
                      <View style={{ backgroundColor: color + '20', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color }}>
                          P{current.priority}
                        </Text>
                      </View>
                    </View>
                  )
                })()}
              </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>

              {/* ── Expected Time ── */}
              <Text style={{ fontSize: 11, color: '#BDBDBD', fontWeight: '600', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' }}>
                Expected Time
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                {TIME_TAGS.map((tag) => {
                  const active = pendingTime === tag
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => toggleTime(tag)}
                      style={{
                        paddingVertical: 8, paddingHorizontal: 18,
                        borderRadius: 20,
                        backgroundColor: active ? BLUE : 'white',
                        borderWidth: 1.5, borderColor: active ? BLUE : '#E0E0E0',
                        elevation: 1,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '600', color: active ? 'white' : '#555' }}>
                        {tag}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {/* ── Priority ── */}
              <Text style={{ fontSize: 11, color: '#BDBDBD', fontWeight: '600', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' }}>
                Priority
              </Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                {PRIORITY_OPTIONS.map((opt) => {
                  const isCurrent = pendingPriority === null && current.priority === opt.value
                  const active = pendingPriority === opt.value || isCurrent
                  return (
                    <Pressable
                      key={opt.label}
                      onPress={() => togglePriority(opt.value)}
                      style={{
                        flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12,
                        backgroundColor: active ? opt.color : 'white',
                        borderWidth: 1.5, borderColor: active ? opt.color : '#EFEFEF',
                        elevation: 1,
                      }}
                    >
                      <Text style={{ fontSize: 15, fontWeight: '700', color: active ? 'white' : opt.color }}>
                        {opt.label}
                      </Text>
                      {isCurrent && (
                        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>current</Text>
                      )}
                    </Pressable>
                  )
                })}
              </View>

              {/* ── Schedule ── */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                <Text style={{ fontSize: 11, color: '#BDBDBD', fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Schedule
                </Text>
                {current.due && (
                  <Text style={{ fontSize: 11, color: ORANGE, fontWeight: '600' }}>
                    · currently {humanizeDueDate(current.due)}
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {DATE_TILES.map((tile) => {
                  const tileDate = tile.key !== 'pick' ? resolveDateKey(tile.key) : undefined
                  const isCurrentDate = pendingDate === undefined && tileDate !== undefined && tileDate === current.due
                  return (
                    <Pressable
                      key={tile.key}
                      onPress={() => (tile.key === 'pick' ? setShowCalendar(true) : applyDateAndAdvance(tile.key))}
                      style={({ pressed }) => ({
                        width: '30%', alignItems: 'center', gap: 6,
                        paddingVertical: 12, paddingHorizontal: 8,
                        borderRadius: 12,
                        backgroundColor: isCurrentDate ? '#FFF3EE' : pressed ? '#FFF3EE' : '#F8F8F8',
                        borderWidth: isCurrentDate ? 1.5 : 0,
                        borderColor: isCurrentDate ? ORANGE : 'transparent',
                      })}
                    >
                      <tile.Icon size={20} color={ORANGE} />
                      <Text style={{ fontSize: 12, color: '#555', fontWeight: '500', textAlign: 'center' }}>
                        {tile.label}
                      </Text>
                      {isCurrentDate && (
                        <Text style={{ fontSize: 9, color: ORANGE }}>current</Text>
                      )}
                    </Pressable>
                  )
                })}
              </View>

            </ScrollView>

            {/* Footer — Skip only */}
            <View style={{
              borderTopWidth: 1, borderTopColor: '#EFEFEF',
              backgroundColor: 'white', paddingBottom: Platform.OS === 'android' ? 16 : 24,
            }}>
              <Pressable onPress={handleSkip} style={{ alignItems: 'center', paddingVertical: 18 }}>
                <Text style={{ fontSize: 16, color: '#999', fontWeight: '500' }}>Skip</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── DONE ────────────────────────────────────────────── */}
        {phase === 'done' && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <View style={{
              width: 120, height: 120, borderRadius: 60,
              backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center',
              marginBottom: 32,
              shadowColor: '#22c55e', shadowOpacity: 0.3, shadowRadius: 20, elevation: 8,
            }}>
              <CheckCheck size={56} color="white" />
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 12, textAlign: 'center' }}>
              All done!
            </Text>
            <Text style={{ fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 24, marginBottom: 48 }}>
              You've reviewed all your overdue and today's tasks. Have a great day!
            </Text>
            <Pressable
              onPress={onClose}
              style={{ backgroundColor: BLUE, borderRadius: 28, paddingVertical: 16, width: '100%', alignItems: 'center' }}
            >
              <Text style={{ color: 'white', fontSize: 17, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>
        )}

        {/* ── Pick date overlay ───────────────────────────────── */}
        {showCalendar && (() => {
          const calDays = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) })
          const startDow = (startOfMonth(calMonth).getDay() + 6) % 7 // Mon=0
          return (
            <Modal transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
              <Pressable
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}
                onPress={() => setShowCalendar(false)}
              >
                <Pressable
                  onPress={(e) => e.stopPropagation()}
                  style={{ width: 320, backgroundColor: 'white', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <Pressable onPress={() => setCalMonth((m) => subMonths(m, 1))} style={{ padding: 6 }}>
                      <ChevronLeft size={18} color="#374151" />
                    </Pressable>
                    <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#111827' }}>
                      {format(calMonth, 'MMMM yyyy')}
                    </Text>
                    <Pressable onPress={() => setCalMonth((m) => addMonths(m, 1))} style={{ padding: 6 }}>
                      <ChevronRight size={18} color="#374151" />
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                      <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#9CA3AF', fontWeight: '600' }}>{d}</Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {Array.from({ length: startDow }).map((_, i) => (
                      <View key={`empty-${i}`} style={{ width: `${100 / 7}%` }} />
                    ))}
                    {calDays.map((day) => {
                      const isTod = isToday(day)
                      const inMonth = isSameMonth(day, calMonth)
                      return (
                        <Pressable
                          key={day.toISOString()}
                          onPress={() => applyPickedDateAndAdvance(day)}
                          style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isTod ? ORANGE : 'transparent' }}>
                            <Text style={{ fontSize: 14, fontWeight: isTod ? '700' : '400', color: isTod ? 'white' : inMonth ? '#111827' : '#D1D5DB' }}>
                              {format(day, 'd')}
                            </Text>
                          </View>
                        </Pressable>
                      )
                    })}
                  </View>
                </Pressable>
              </Pressable>
            </Modal>
          )
        })()}
      </View>
    </Modal>
  )
}
