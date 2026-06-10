import { View, Text, Pressable } from 'react-native'
import { COLOR_PAIRS } from './lib/trackerEncoding'
import type { Tracker } from './types'
import { formatDistanceToNow } from 'date-fns'

interface Props {
  tracker: Tracker
  onClick: () => void
}

export function TrackerCard({ tracker, onClick }: Props) {
  const { meta, currentValue, name, lastUpdatedAt } = tracker
  const { filled, background, text } = COLOR_PAIRS[meta.colorKey]
  const pct = meta.targetValue > 0
    ? Math.min(100, (currentValue / meta.targetValue) * 100)
    : 0

  const show = (field: string) => meta.displayFields.includes(field as never)

  return (
    <Pressable
      onPress={onClick}
      style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: background, minHeight: 80, flex: 1 }}
    >
      <View
        style={{
          width: `${Math.max(pct, 35)}%` as `${number}%`,
          backgroundColor: filled,
          minHeight: 80,
          justifyContent: 'center',
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        {show('name') && (
          <Text style={{ fontSize: 13, fontWeight: '700', color: text, lineHeight: 17 }} numberOfLines={1}>{name}</Text>
        )}
        {show('values') && (
          <Text style={{ fontSize: 11, color: text, opacity: 0.9, marginTop: 1 }}>
            {currentValue}{meta.unit ? ` ${meta.unit}` : ''} / {meta.targetValue}{meta.unit ? ` ${meta.unit}` : ''}
          </Text>
        )}
        {show('percentage') && (
          <Text style={{ fontSize: 11, color: text, opacity: 0.85 }}>{pct.toFixed(1)}%</Text>
        )}
        {show('lastUpdated') && lastUpdatedAt && (
          <Text style={{ fontSize: 10, color: text, opacity: 0.7, marginTop: 1 }}>
            {formatDistanceToNow(new Date(lastUpdatedAt), { addSuffix: true })}
          </Text>
        )}
        {show('remaining') && (
          <Text style={{ fontSize: 10, color: text, opacity: 0.8, marginTop: 1 }}>
            {meta.targetValue - currentValue} left
          </Text>
        )}
      </View>
    </Pressable>
  )
}
