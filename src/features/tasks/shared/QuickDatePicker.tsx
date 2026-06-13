import { useState, type ForwardRefExoticComponent } from 'react'
import { View, Text, Pressable } from 'react-native'
import {
  CalendarDays, Sunrise, RotateCw, Calendar, CalendarPlus,
  XSquare, ChevronLeft, ChevronRight, type LucideProps,
} from 'lucide-react-native'
import {
  addDays, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, isToday, format,
} from 'date-fns'
import { toApiDate, getUpcomingSaturday } from '@/lib/dateUtils'
import { clearTaskTime } from '@/auth/tokenStore'
import { BottomSheet } from '@/components/BottomSheet'

interface QuickDatePickerProps {
  taskId: number
  onSelect: (date: string | null) => void
  onClose: () => void
  isMobile?: boolean
  bare?: boolean // strip outer container when embedded inside a parent popover
}

interface Tile {
  Icon: ForwardRefExoticComponent<LucideProps>
  label: string
  action: () => void
}

const ORANGE = '#E8632A'
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function QuickDatePicker({ taskId, onSelect, onClose, isMobile, bare }: QuickDatePickerProps) {
  const today = new Date()
  const [showCalendar, setShowCalendar] = useState(false)
  const [month, setMonth] = useState(() => startOfMonth(today))

  const pickDate = (date: Date) => {
    clearTaskTime(taskId)
    onSelect(toApiDate(date))
    onClose()
  }

  const tiles: Tile[] = [
    {
      Icon: CalendarDays, label: 'Today',
      action: () => { clearTaskTime(taskId); onSelect(toApiDate(today)) },
    },
    {
      Icon: Sunrise, label: 'Tomorrow',
      action: () => { clearTaskTime(taskId); onSelect(toApiDate(addDays(today, 1))) },
    },
    {
      Icon: RotateCw, label: '+1 Week',
      action: () => { clearTaskTime(taskId); onSelect(toApiDate(addDays(today, 7))) },
    },
    {
      Icon: Calendar, label: 'Saturday',
      action: () => { clearTaskTime(taskId); onSelect(toApiDate(getUpcomingSaturday())) },
    },
    {
      Icon: CalendarPlus, label: 'Pick date',
      action: () => setShowCalendar(true),
    },
    {
      Icon: XSquare, label: 'Clear',
      action: () => { clearTaskTime(taskId); onSelect(null) },
    },
  ]

  const grid = (
    <View className="flex-row flex-wrap gap-2">
      {tiles.map((tile) => (
        <Pressable
          key={tile.label}
          onPress={() => {
            tile.action()
            if (tile.label !== 'Pick date') onClose()
          }}
          className="items-center gap-1.5 p-3 rounded-xl bg-gray-50 active:bg-orange-50"
          style={{ width: '30%' }}
        >
          <tile.Icon size={20} color={ORANGE} />
          <Text className="text-xs text-gray-500 font-medium text-center">{tile.label}</Text>
        </Pressable>
      ))}
    </View>
  )

  const calendarDays = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startDow = (startOfMonth(month).getDay() + 6) % 7 // Mon=0

  const calendar = (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <Pressable onPress={() => setMonth((m) => subMonths(m, 1))} className="p-1.5 rounded-lg active:bg-gray-100">
          <ChevronLeft size={18} color="#374151" />
        </Pressable>
        <Text className="text-sm font-semibold text-gray-800">{format(month, 'MMMM yyyy')}</Text>
        <Pressable onPress={() => setMonth((m) => addMonths(m, 1))} className="p-1.5 rounded-lg active:bg-gray-100">
          <ChevronRight size={18} color="#374151" />
        </Pressable>
      </View>
      <View className="flex-row mb-1">
        {WEEKDAYS.map((d, i) => (
          <Text key={i} className="flex-1 text-center text-xs font-medium text-gray-400">{d}</Text>
        ))}
      </View>
      <View className="flex-row flex-wrap">
        {Array.from({ length: startDow }).map((_, i) => (
          <View key={`empty-${i}`} style={{ width: `${100 / 7}%` }} />
        ))}
        {calendarDays.map((day) => {
          const isTod = isToday(day)
          const inMonth = isSameMonth(day, month)
          return (
            <Pressable
              key={day.toISOString()}
              onPress={() => pickDate(day)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}
            >
              <View
                className="items-center justify-center rounded-full"
                style={{ width: 32, height: 32, backgroundColor: isTod ? ORANGE : 'transparent' }}
              >
                <Text style={{ fontSize: 14, fontWeight: isTod ? '700' : '400', color: isTod ? 'white' : inMonth ? '#111827' : '#D1D5DB' }}>
                  {format(day, 'd')}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
      <Pressable
        onPress={() => setShowCalendar(false)}
        className="mt-3 py-2.5 rounded-xl bg-gray-50 items-center active:bg-gray-100"
      >
        <Text className="text-sm font-medium text-gray-500">Back</Text>
      </Pressable>
    </View>
  )

  const content = showCalendar ? calendar : grid
  const title = showCalendar ? 'Pick a date' : 'Set due date'

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title={title}>
        {content}
      </BottomSheet>
    )
  }

  // Bare: no outer container (embedded inside a parent popover)
  if (bare) {
    return (
      <View style={{ padding: 12, width: 264 }}>
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
          {title}
        </Text>
        {content}
      </View>
    )
  }

  // Desktop popover (standalone, rendered inside a portal by caller)
  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-3 w-64"
      style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 }}
    >
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
        {title}
      </Text>
      {content}
    </View>
  )
}
