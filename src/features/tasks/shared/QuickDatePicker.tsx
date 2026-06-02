import { View, Text, Pressable } from 'react-native'
import {
  CalendarDays, Sunrise, RotateCw, Calendar, CalendarPlus,
  XSquare, type LucideProps,
} from 'lucide-react-native'
import type { ForwardRefExoticComponent } from 'react'
import { addDays } from 'date-fns'
import { toApiDate, getUpcomingSaturday } from '@/lib/dateUtils'
import { clearTaskTime } from '@/auth/tokenStore'
import { BottomSheet } from '@/components/BottomSheet'

interface QuickDatePickerProps {
  taskId: number
  onSelect: (date: string | null) => void
  onClose: () => void
  isMobile?: boolean
}

interface Tile {
  Icon: ForwardRefExoticComponent<LucideProps>
  label: string
  action: () => void
}

const ORANGE = '#E8632A'

export function QuickDatePicker({ taskId, onSelect, onClose, isMobile }: QuickDatePickerProps) {
  const today = new Date()

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
      action: () => { /* TODO: open native date picker */ },
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

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title="Set due date">
        {grid}
      </BottomSheet>
    )
  }

  // Desktop popover (rendered inside a portal by caller)
  return (
    <View className="bg-white rounded-2xl border border-gray-100 p-3 w-64"
      style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 }}
    >
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
        Set due date
      </Text>
      {grid}
    </View>
  )
}
