import { useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Tag, Calendar, Globe } from 'lucide-react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { PriorityPicker } from './PriorityPicker'
import { QuickDatePicker } from './QuickDatePicker'

interface ContextMenuProps {
  taskId: number
  priority: number
  open: boolean
  position: { x: number; y: number } | null
  onClose: () => void
  onPriorityChange: (priority: number) => void
  onDateChange: (date: string | null) => void
  onViewRaw?: () => void
  isMobile: boolean
}

type SubMenu = 'priority' | 'date' | null

export function ContextMenu({
  taskId, priority, open, onClose,
  onPriorityChange, onDateChange, onViewRaw, isMobile,
}: ContextMenuProps) {
  const [subMenu, setSubMenu] = useState<SubMenu>(null)

  useEffect(() => { if (!open) setSubMenu(null) }, [open])

  const menuContent = (
    <View className="w-52">
      {subMenu === null && (
        <View className="py-1">
          <Pressable
            onPress={() => setSubMenu('priority')}
            className="flex-row items-center gap-3 px-4 py-2.5 active:bg-gray-50"
          >
            <Tag size={16} color="#9ca3af" />
            <Text className="text-sm text-gray-700">Set priority</Text>
          </Pressable>
          <Pressable
            onPress={() => setSubMenu('date')}
            className="flex-row items-center gap-3 px-4 py-2.5 active:bg-gray-50"
          >
            <Calendar size={16} color="#9ca3af" />
            <Text className="text-sm text-gray-700">Change due date</Text>
          </Pressable>
          <Pressable
            onPress={() => { onClose(); onViewRaw?.() }}
            className="flex-row items-center gap-3 px-4 py-2.5 active:bg-gray-50"
          >
            <Globe size={16} color="#9ca3af" />
            <Text className="text-sm text-gray-700">View Raw</Text>
          </Pressable>
        </View>
      )}
      {subMenu === 'priority' && (
        <View className="py-2">
          <Text className="px-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Priority
          </Text>
          <PriorityPicker value={priority} onChange={(p) => { onPriorityChange(p); onClose() }} />
        </View>
      )}
      {subMenu === 'date' && (
        <QuickDatePicker
          taskId={taskId}
          onSelect={(date) => { onDateChange(date); onClose() }}
          onClose={onClose}
        />
      )}
    </View>
  )

  // Always use BottomSheet (on web it still works via Modal)
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={subMenu === 'priority' ? 'Set Priority' : subMenu === 'date' ? 'Due Date' : 'Task Actions'}
    >
      {menuContent}
    </BottomSheet>
  )
}
