import { View, Text, Pressable } from 'react-native'

interface PriorityPickerProps {
  value: number
  onChange: (priority: number) => void
}

export function priorityBadgeClass(priority: number): string {
  if (priority <= 0) return 'text-gray-400 bg-gray-100'
  if (priority <= 3) return 'text-red-600 bg-red-100'
  if (priority <= 6) return 'text-amber-600 bg-amber-100'
  return 'text-green-600 bg-green-100'
}

export function priorityDisplay(priority: number): string {
  return priority > 0 ? `P${priority}` : 'P11'
}

function priorityBgColor(p: number): string {
  if (p <= 3) return '#fee2e2'
  if (p <= 6) return '#fef3c7'
  return '#dcfce7'
}

function priorityTextColor(p: number): string {
  if (p <= 3) return '#b91c1c'
  if (p <= 6) return '#b45309'
  return '#15803d'
}

export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <View className="flex-row flex-wrap gap-1.5 p-2">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
        <Pressable
          key={p}
          onPress={() => onChange(p)}
          style={{
            width: 36, height: 36, borderRadius: 8,
            backgroundColor: priorityBgColor(p),
            alignItems: 'center', justifyContent: 'center',
            borderWidth: value === p ? 2 : 0,
            borderColor: priorityTextColor(p),
            transform: [{ scale: value === p ? 1.1 : 1 }],
          }}
        >
          <Text style={{ color: priorityTextColor(p), fontSize: 11, fontWeight: 'bold' }}>
            P{p}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
