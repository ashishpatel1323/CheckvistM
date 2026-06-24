import { useState, type ForwardRefExoticComponent } from 'react'
import { View, Pressable } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
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
          className="items-center gap-1.5 p-3 rounded-xl bg-muted active:bg-primary/10"
          style={{ width: '30%' }}
        >
          <tile.Icon size={20} color={ORANGE} />
          <UIText className="text-xs text-muted-foreground font-medium text-center">{tile.label}</UIText>
        </Pressable>
      ))}
    </View>
  )

  const calendarDays = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
  const startDow = (startOfMonth(month).getDay() + 6) % 7 // Mon=0

  const calendar = (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <Pressable onPress={() => setMonth((m) => subMonths(m, 1))} className="p-1.5 rounded-lg active:bg-muted">
        <ChevronLeft size={18} className="text-foreground" />
        </Pressable>
        <UIText className="text-sm font-semibold text-foreground">{format(month, 'MMMM yyyy')}</UIText>
        <Pressable onPress={() => setMonth((m) => addMonths(m, 1))} className="p-1.5 rounded-lg active:bg-muted">
          <ChevronRight size={18} className="text-foreground" />
        </Pressable>
      </View>
      <View className="flex-row mb-1">
        {WEEKDAYS.map((d, i) => (
          <UIText key={i} className="flex-1 text-center text-xs font-medium text-muted-foreground">{d}</UIText>
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
                <UIText className={`text-sm ${isTod ? 'font-bold text-white' : inMonth ? 'font-normal text-foreground' : 'font-normal text-muted-foreground'}`}>
                  {format(day, 'd')}
                </UIText>
              </View>
            </Pressable>
          )
        })}
      </View>
      <Pressable
        onPress={() => setShowCalendar(false)}
        className="mt-3 py-2.5 rounded-xl bg-muted items-center active:bg-muted"
      >
        <UIText className="text-sm font-medium text-muted-foreground">Back</UIText>
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
      <View className="p-3 w-64">
        <UIText className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
          {title}
        </UIText>
        {content}
      </View>
    )
  }

  // Desktop popover (standalone, rendered inside a portal by caller)
  return (
    <View className="bg-background rounded-2xl border border-border p-3 w-64"
      style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 }}
    >
      <UIText className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
        {title}
      </UIText>
      {content}
    </View>
  )
}
