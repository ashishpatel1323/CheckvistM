import { View, Text, Pressable, ScrollView } from 'react-native'
import { ALL_COLOR_KEYS, COLOR_PAIRS } from './lib/trackerEncoding'
import type { ColorKey } from './types'

interface Props {
  selected: ColorKey
  onSelect: (key: ColorKey) => void
  onBack: () => void
}

export function ColorsSubscreen({ selected, onSelect, onBack }: Props) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' }}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '500' }}>‹ Back</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: '#1C1C1E' }}>Colors</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={{ padding: 16 }}>
        <Text style={{ fontSize: 12, color: '#8E8E93', fontWeight: '600', textTransform: 'uppercase', marginBottom: 12 }}>Standard</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {ALL_COLOR_KEYS.map(key => {
            const { filled, background } = COLOR_PAIRS[key]
            const isSelected = key === selected
            return (
              <Pressable
                key={key}
                onPress={() => { onSelect(key); onBack() }}
                style={{
                  height: 48, width: '28%', borderRadius: 24, flexDirection: 'row', overflow: 'hidden',
                  borderWidth: isSelected ? 3 : 0, borderColor: '#1C1C1E',
                }}
              >
                <View style={{ flex: 1, backgroundColor: filled }} />
                <View style={{ flex: 1, backgroundColor: background }} />
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}
