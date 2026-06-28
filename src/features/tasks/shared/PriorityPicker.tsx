import { View, Pressable } from 'react-native'
import { Text as UIText } from '@/components/ui/text'

interface PriorityPickerProps {
  value: number
  onChange: (priority: number) => void
}

// ─── 4-bucket priority system ─────────────────────────────────────────────────
// High: P1–P3 (red), Medium: P4–P6 (amber), Low: P7–P8 (green), TBD: P9–P10 (purple)

export type PriorityBucket = 'high' | 'medium' | 'low' | 'tbd'

export const BUCKET_META: Record<PriorityBucket, { label: string; sublabel: string; color: string; bg: string; bgLight: string; border: string; priorities: number[] }> = {
  high:   { label: 'High',   sublabel: 'P1–P3 · Urgent & Important',    color: '#DC7070', bg: '#F8E3E3', bgLight: '#FBF0F0', border: '#F3DADA', priorities: [1, 2, 3] },
  medium: { label: 'Medium', sublabel: 'P4–P6 · Important, Not Urgent', color: '#D8A14A', bg: '#F8EDD6', bgLight: '#FBF6EC', border: '#F1E4CB', priorities: [4, 5, 6] },
  low:    { label: 'Low',    sublabel: 'P7–P8 · Delegate',              color: '#5FA97E', bg: '#DEEFE4', bgLight: '#EEF7F1', border: '#D4E9DC', priorities: [7, 8] },
  tbd:    { label: 'TBD',    sublabel: 'P9–P10 · Meetings & TBD',       color: '#9277C4', bg: '#E9E1F5', bgLight: '#F4F1FB', border: '#E3DBF2', priorities: [9, 10] },
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
  if (priority <= 0) return 'text-muted-foreground bg-muted'
  const bucket = classifyPriority(priority)
  if (bucket === 'high')   return 'text-destructive bg-destructive/10'
  if (bucket === 'medium') return 'text-amber-600 bg-amber-100'
  if (bucket === 'low')    return 'text-green-600 bg-green-100'
  return 'text-violet-600 bg-violet-100'
}

export function priorityDisplay(priority: number): string {
  return priority > 0 ? `P${priority}` : '—'
}

export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <View className="gap-2.5 p-3">
      {BUCKETS.map((bucket) => {
        const meta = BUCKET_META[bucket]
        return (
          <View key={bucket}>
            {/* Group label + sublabel */}
            <View className="flex-row items-center gap-1.5 mb-1.5">
              <UIText className="text-[11px] font-bold uppercase tracking-wide" style={{ color: meta.color }}>
                {meta.label}
              </UIText>
              <UIText className="text-[10px]" style={{ color: meta.color, opacity: 0.65 }}>
                {meta.sublabel}
              </UIText>
            </View>
            {/* Priority chips (data palette — keep dynamic bg/border via style) */}
            <View className="flex-row gap-2">
              {meta.priorities.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => onChange(p)}
                  className="items-center justify-center"
                  style={{
                    width: 40,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: meta.bg,
                    borderWidth: value === p ? 2 : 0,
                    borderColor: meta.color,
                    transform: [{ scale: value === p ? 1.08 : 1 }],
                  }}
                >
                  <UIText className="text-xs font-bold" style={{ color: meta.color }}>
                    P{p}
                  </UIText>
                </Pressable>
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}
