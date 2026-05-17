import { useRef, useState } from 'react'
import {
  CalendarDays,
  Sunrise,
  RotateCw,
  Calendar,
  CalendarPlus,
  XSquare,
  Sun,
  MoonStar,
} from 'lucide-react'
import { addDays, format } from 'date-fns'
import { toApiDate, getUpcomingSaturday } from '@/lib/dateUtils'
import { setTaskTime, clearTaskTime } from '@/auth/tokenStore'
import { BottomSheet } from '@/components/BottomSheet'

interface QuickDatePickerProps {
  taskId: number
  onSelect: (date: string | null) => void
  onClose: () => void
  // For desktop: anchor element for positioning
  anchorRef?: React.RefObject<HTMLElement | null>
  isMobile?: boolean
}

interface Tile {
  icon: React.ReactNode
  label: string
  action: () => void
}

export function QuickDatePicker({ taskId, onSelect, onClose, isMobile }: QuickDatePickerProps) {
  const today = new Date()
  const nativeDateRef = useRef<HTMLInputElement>(null)
  const [showNative, setShowNative] = useState(false)

  const tiles: Tile[] = [
    {
      icon: <CalendarDays className="w-5 h-5" />,
      label: 'Today',
      action: () => {
        clearTaskTime(taskId)
        onSelect(toApiDate(today))
      },
    },
    {
      icon: <Sunrise className="w-5 h-5" />,
      label: 'Tomorrow',
      action: () => {
        clearTaskTime(taskId)
        onSelect(toApiDate(addDays(today, 1)))
      },
    },
    {
      icon: <RotateCw className="w-5 h-5" />,
      label: '+1 Week',
      action: () => {
        clearTaskTime(taskId)
        onSelect(toApiDate(addDays(today, 7)))
      },
    },
    {
      icon: <Calendar className="w-5 h-5" />,
      label: 'Saturday',
      action: () => {
        clearTaskTime(taskId)
        onSelect(toApiDate(getUpcomingSaturday()))
      },
    },
    {
      icon: <CalendarPlus className="w-5 h-5" />,
      label: 'Pick date',
      action: () => {
        setShowNative(true)
        setTimeout(() => nativeDateRef.current?.showPicker?.(), 50)
      },
    },
    {
      icon: <XSquare className="w-5 h-5" />,
      label: 'Clear',
      action: () => {
        clearTaskTime(taskId)
        onSelect(null)
      },
    },
    {
      icon: <Sunrise className="w-5 h-5" />,
      label: 'Morning',
      action: () => {
        setTaskTime(taskId, '09:00')
        onSelect(toApiDate(today))
      },
    },
    {
      icon: <Sun className="w-5 h-5" />,
      label: 'Afternoon',
      action: () => {
        setTaskTime(taskId, '14:00')
        onSelect(toApiDate(today))
      },
    },
    {
      icon: <MoonStar className="w-5 h-5" />,
      label: 'Night',
      action: () => {
        setTaskTime(taskId, '20:00')
        onSelect(toApiDate(today))
      },
    },
  ]

  const grid = (
    <div className="relative">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <button
            key={tile.label}
            onClick={() => {
              tile.action()
              if (tile.label !== 'Pick date') onClose()
            }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gray-50 hover:bg-orange-50 transition-colors group"
          >
            <span style={{ color: '#E8632A' }} className="group-hover:scale-110 transition-transform">
              {tile.icon}
            </span>
            <span className="text-xs text-gray-500 font-medium">{tile.label}</span>
          </button>
        ))}
      </div>
      {/* Hidden native date input */}
      <input
        ref={nativeDateRef}
        type="date"
        className="sr-only"
        onChange={(e) => {
          if (e.target.value) {
            // Convert from yyyy-MM-dd to yyyy/MM/dd
            const apiDate = e.target.value.replace(/-/g, '/')
            clearTaskTime(taskId)
            onSelect(apiDate)
            onClose()
          }
          setShowNative(false)
        }}
        defaultValue={format(today, 'yyyy-MM-dd')}
      />
      {showNative && (
        <button
          className="absolute inset-0 opacity-0"
          onClick={() => nativeDateRef.current?.click()}
        />
      )}
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet open onClose={onClose} title="Set due date">
        {grid}
      </BottomSheet>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-64 z-50">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
        Set due date
      </p>
      {grid}
    </div>
  )
}
