import { useEffect, useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet, useWindowDimensions, Platform } from 'react-native'
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

// Estimated dimensions for smart edge-flip positioning
const POPOVER_W: Record<string, number> = { null: 208, priority: 208, date: 288 }
const POPOVER_H: Record<string, number> = { null: 132, priority: 190, date: 340 }

export function ContextMenu({
  taskId, priority, open, position, onClose,
  onPriorityChange, onDateChange, onViewRaw, isMobile,
}: ContextMenuProps) {
  const [subMenu, setSubMenu] = useState<SubMenu>(null)
  const { width: screenW, height: screenH } = useWindowDimensions()

  useEffect(() => { if (!open) setSubMenu(null) }, [open])

  // Escape key for desktop
  useEffect(() => {
    if (isMobile || !open || Platform.OS !== 'web') return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, isMobile, onClose])

  const menuContent = (
    <>
      {subMenu === null && (
        <View style={{ width: 208 }} className="py-1">
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
        <View style={{ width: 208 }} className="py-2">
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
          bare
        />
      )}
    </>
  )

  // Desktop: positioned popover
  if (!isMobile && Platform.OS === 'web') {
    const key = subMenu ?? 'null'
    const w = POPOVER_W[key]
    const h = POPOVER_H[key]
    const pos = position ?? { x: screenW / 2, y: screenH / 2 }
    const left = Math.max(8, pos.x + w > screenW - 8 ? pos.x - w : pos.x)
    const top = Math.max(8, pos.y + h > screenH - 8 ? pos.y - h : pos.y)

    return (
      <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={{
            position: 'absolute',
            top,
            left,
            backgroundColor: 'white',
            borderRadius: 10,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(0,0,0,0.1)',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.12,
            shadowRadius: 20,
            elevation: 20,
            overflow: 'hidden',
          }}
        >
          {menuContent}
        </View>
      </Modal>
    )
  }

  // Mobile: BottomSheet
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
