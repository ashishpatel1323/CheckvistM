/**
 * Duration picker component for quick selection and custom entry
 */

import { useState } from 'react'
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native'
import { X } from 'lucide-react-native'

interface DurationPickerProps {
  value?: { minutes: number; formatted: string } | null
  onChange: (duration: { minutes: number; formatted: string } | null) => void
  onClose: () => void
}

const QUICK_DURATIONS = [
  { minutes: 15, formatted: '15m', label: '15m' },
  { minutes: 30, formatted: '30m', label: '30m' },
  { minutes: 45, formatted: '45m', label: '45m' },
  { minutes: 60, formatted: '1h', label: '1h' },
  { minutes: 90, formatted: '1h 30m', label: '1h 30m' },
  { minutes: 120, formatted: '2h', label: '2h' },
  { minutes: 180, formatted: '3h', label: '3h' },
  { minutes: 240, formatted: '4h', label: '4h' },
  { minutes: 300, formatted: '5h', label: '5h' },
  { minutes: 480, formatted: '8h', label: '8h' },
]

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
}

export function DurationPicker({ value, onChange, onClose }: DurationPickerProps) {
  const [customInput, setCustomInput] = useState(value?.formatted ?? '')

  const handleQuickSelect = (duration: { minutes: number; formatted: string }) => {
    onChange(duration)
    onClose()
  }

  const handleCustomSubmit = () => {
    if (!customInput.trim()) {
      onChange(null)
      onClose()
      return
    }

    // Parse custom input (very basic: assume format like "1.5h" or "90m")
    const input = customInput.trim().toLowerCase()

    let minutes = 0

    // Try decimal hours: "1.5h"
    const decimalMatch = input.match(/^(\d+(?:\.\d+)?)\s*h/)
    if (decimalMatch) {
      const hours = parseFloat(decimalMatch[1])
      minutes = Math.round(hours * 60)
    } else {
      // Try minutes: "90m"
      const minutesMatch = input.match(/^(\d+)\s*m/)
      if (minutesMatch) {
        minutes = parseInt(minutesMatch[1], 10)
      }
    }

    if (minutes > 0) {
      onChange({ minutes, formatted: formatDuration(minutes) })
    } else {
      onChange(null)
    }
    onClose()
  }

  return (
    <View className="bg-white rounded-t-2xl px-4 pb-6 pt-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-lg font-semibold text-gray-900">Set Duration</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <X size={20} color="#6b7280" />
        </Pressable>
      </View>

      {/* Current duration display */}
      {value && (
        <View className="bg-orange-50 rounded-lg px-3 py-2 mb-4 flex-row items-center justify-between">
          <Text className="text-sm text-orange-600">Current: {value.formatted}</Text>
          <Pressable
            onPress={() => {
              onChange(null)
              setCustomInput('')
            }}
            className="px-2 py-1 rounded active:bg-orange-100"
          >
            <Text className="text-sm text-orange-600 font-medium">Clear</Text>
          </Pressable>
        </View>
      )}

      {/* Quick duration grid */}
      <Text className="text-xs font-semibold text-gray-600 mb-2">Quick Select</Text>
      <ScrollView className="mb-4">
        <View className="flex-row flex-wrap gap-2">
          {QUICK_DURATIONS.map((duration) => (
            <Pressable
              key={duration.minutes}
              onPress={() => handleQuickSelect(duration)}
              className={`px-3 py-2 rounded-lg border ${
                value?.minutes === duration.minutes
                  ? 'bg-orange-500 border-orange-500'
                  : 'border-gray-200 bg-gray-50 active:bg-gray-100'
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  value?.minutes === duration.minutes ? 'text-white' : 'text-gray-700'
                }`}
              >
                {duration.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Custom input */}
      <View className="mb-4">
        <Text className="text-xs font-semibold text-gray-600 mb-2">Custom (e.g., "1.5h" or "90m")</Text>
        <View className="flex-row gap-2">
          <TextInput
            value={customInput}
            onChangeText={setCustomInput}
            placeholder="Enter duration"
            placeholderTextColor="#9ca3af"
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm"
          />
          <Pressable
            onPress={handleCustomSubmit}
            className="px-4 py-2.5 bg-orange-500 rounded-lg active:bg-orange-600 items-center justify-center"
          >
            <Text className="text-sm font-medium text-white">Set</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
