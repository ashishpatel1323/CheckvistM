import { useEffect } from 'react'
import { Modal, View, Text, Pressable, ScrollView, Platform } from 'react-native'
import { X } from 'lucide-react-native'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  // Web: handle Escape key
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        {/* Backdrop */}
        <Pressable className="absolute inset-0 bg-black/40" onPress={onClose} />

        {/* Sheet */}
        <View className="relative bg-white rounded-t-2xl max-h-[85%]"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 20 }}
        >
          {/* Handle */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-gray-300 rounded-full" />
          </View>

          {/* Header */}
          {title && (
            <View className="flex-row items-center justify-between px-4 py-2 border-b border-gray-100">
              <Text className="font-semibold text-gray-800">{title}</Text>
              <Pressable onPress={onClose} className="p-1 rounded-lg active:bg-gray-100">
                <X size={20} color="#9ca3af" />
              </Pressable>
            </View>
          )}

          {/* Content */}
          <ScrollView contentContainerStyle={{ padding: 16 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  )
}
