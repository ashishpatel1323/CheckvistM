/**
 * Duration picker component for quick selection and custom entry
 */

import { useState } from 'react'
import { View, Pressable, TextInput, ScrollView } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
import { X } from 'lucide-react-native'

interface DurationPickerProps {
  value?: { minutes: number; formatted: string } | null
  onChange: (duration: { minutes: number; formatted: string } | null) => void
  onClose: () => void
}

const QUICK_DURATIONS = [
  { minutes: 5,  formatted: '5m',  label: '5m'  },
  { minutes: 10, formatted: '10m', label: '10m' },
  { minutes: 30, formatted: '30m', label: '30m' },
  { minutes: 45, formatted: '45m', label: '45m' },
  { minutes: 60, formatted: '1h',  label: '1h'  },
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
        <UIText className="text-lg font-semibold text-foreground">Set Duration</UIText>
        <Pressable onPress={onClose} hitSlop={8}>
          <X size={20} className="text-muted-foreground" />
        </Pressable>
      </View>

      {/* Current duration display */}
      {value && (
        <View className="bg-primary/10 rounded-lg px-3 py-2 mb-4 flex-row items-center justify-between">
          <UIText className="text-sm text-primary">Current: {value.formatted}</UIText>
          <Pressable
            onPress={() => {
              onChange(null)
              setCustomInput('')
            }}
            className="px-2 py-1 rounded active:bg-primary/10"
          >
            <UIText className="text-sm text-primary font-medium">Clear</UIText>
          </Pressable>
        </View>
      )}

      {/* Quick duration grid */}
      <UIText className="text-xs font-semibold text-muted-foreground mb-2">Quick Select</UIText>
      <ScrollView className="mb-4">
        <View className="flex-row flex-wrap gap-2">
          {QUICK_DURATIONS.map((duration) => (
            <Pressable
              key={duration.minutes}
              onPress={() => handleQuickSelect(duration)}
              className={`px-3 py-2 rounded-lg border ${
                value?.minutes === duration.minutes
                  ? 'bg-primary border-primary'
                  : 'border-border bg-muted active:bg-muted'
              }`}
            >
              <UIText
                className={`text-sm font-medium ${
                  value?.minutes === duration.minutes ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {duration.label}
              </UIText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Custom input */}
      <View className="mb-4">
        <UIText className="text-xs font-semibold text-muted-foreground mb-2">Custom (e.g., "1.5h" or "90m")</UIText>
        <View className="flex-row gap-2">
          <TextInput
            value={customInput}
            onChangeText={setCustomInput}
            placeholder="Enter duration"
            placeholderTextColor="hsl(220 9% 63%)"
            className="flex-1 px-3 py-2.5 border border-border rounded-lg text-sm text-foreground"
          />
          <Pressable
            onPress={handleCustomSubmit}
            className="px-4 py-2.5 bg-primary rounded-lg active:bg-primary items-center justify-center"
          >
            <UIText className="text-sm font-medium text-primary-foreground">Set</UIText>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
