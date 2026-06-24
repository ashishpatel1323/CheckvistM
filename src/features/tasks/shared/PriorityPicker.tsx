import { View, Text, Pressable } from 'react-native'

interface PriorityPickerProps {
  value: number
  onChange: (priority: number) => void
}

// ─── 4-bucket priority system ─────────────────────────────────────────────────
// High: P1–P3 (red), Medium: P4–P6 (amber), Low: P7–P8 (green), TBD: P9–P10 (purple)

export type PriorityBucket = 'high' | 'medium' | 'low' | 'tbd'

export const BUCKET_META: Record<PriorityBucket, { label: string; sublabel: string; color: string; bg: string; bgLight: string; priorities: number[] }> = {
  high:   { label: 'High',   sublabel: 'P1–P3 · Urgent & Important',    color: '#b91c1c', bg: '#fee2e2', bgLight: '#FEF2F2', priorities: [1, 2, 3] },
  medium: { label: 'Medium', sublabel: 'P4–P6 · Important, Not Urgent', color: '#b45309', bg: '#fef3c7', bgLight: '#FFFBEB', priorities: [4, 5, 6] },
  low:    { label: 'Low',    sublabel: 'P7–P8 · Delegate',              color: '#15803d', bg: '#dcfce7', bgLight: '#F0FDF4', priorities: [7, 8] },
  tbd:    { label: 'TBD',    sublabel: 'P9–P10 · Meetings & TBD',       color: '#7c3aed', bg: '#ede9fe', bgLight: '#F5F3FF', priorities: [9, 10] },
}

const BUCKETS: PriorityBucket[] = ['high', 'medium', 'low', 'tbd']

export function classifyPriority(priority: number): PriorityBucket {
  if (priority >= 1 && priority <= 3) return 'high'
  if (priority >= 4 && priority <= 6) return 'medium'
  if (priority >= 7 && priority <= 8) return 'low'
  return 'tbd'
}

export function priorityTextColor(p: number): string {
  if (p <= 0 || p > 10) return '#6B7280'
  return BUCKET_META[classifyPriority(p)].color
}

export function priorityRowBg(priority: number): string | undefined {
  if (!priority || priority <= 0 || priority > 10) return undefined
  return BUCKET_META[classifyPriority(priority)].bgLight
}

export function priorityBadgeClass(priority: number): string {
  if (priority <= 0) return 'text-gray-400 bg-gray-100'
  const bucket = classifyPriority(priority)
  if (bucket === 'high')   return 'text-red-600 bg-red-100'
  if (bucket === 'medium') return 'text-amber-600 bg-amber-100'
  if (bucket === 'low')    return 'text-green-600 bg-green-100'
  return 'text-violet-600 bg-violet-100'
}

export function priorityDisplay(priority: number): string {
  return priority > 0 ? `P${priority}` : '—'
}

export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <View style={{ gap: 10, padding: 12 }}>
      {BUCKETS.map((bucket) => {
        const meta = BUCKET_META[bucket]
        return (
          <View key={bucket}>
            {/* Group label + sublabel */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: meta.color, letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {meta.label}
              </Text>
              <Text style={{ fontSize: 10, color: meta.color, opacity: 0.65 }}>
                {meta.sublabel}
              </Text>
            </View>
            {/* Priority chips */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {meta.priorities.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => onChange(p)}
                  style={{
                    width: 40, height: 36, borderRadius: 8,
                    backgroundColor: meta.bg,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: value === p ? 2 : 0,
                    borderColor: meta.color,
                    transform: [{ scale: value === p ? 1.08 : 1 }],
                  }}
                >
                  <Text style={{ color: meta.color, fontSize: 12, fontWeight: 'bold' }}>
                    P{p}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}
