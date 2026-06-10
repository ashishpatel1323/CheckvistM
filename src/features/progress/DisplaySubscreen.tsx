import { View, Text, Pressable, ScrollView } from 'react-native'
import { ALL_DISPLAY_FIELDS, COLOR_PAIRS } from './lib/trackerEncoding'
import type { DisplayField, ColorKey } from './types'

interface Props {
  fields: DisplayField[]
  colorKey: ColorKey
  name: string
  currentValue: number
  targetValue: number
  onChange: (fields: DisplayField[]) => void
  onBack: () => void
}

export function DisplaySubscreen({ fields, colorKey, name, currentValue, targetValue, onChange, onBack }: Props) {
  const { filled, background, text } = COLOR_PAIRS[colorKey]
  const pct = targetValue > 0 ? Math.min(100, (currentValue / targetValue) * 100) : 0
  const shown = fields
  const hidden = ALL_DISPLAY_FIELDS.filter(f => !fields.includes(f.key))

  function toggle(key: DisplayField) {
    if (fields.includes(key)) {
      onChange(fields.filter(f => f !== key))
    } else {
      onChange([...fields, key])
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' }}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '500' }}>‹ Back</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: '#1C1C1E' }}>Display</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={{ flex: 1 }}>
        {/* Preview card */}
        <View style={{ margin: 16 }}>
          <View style={{ borderRadius: 12, height: 80, backgroundColor: background, overflow: 'hidden', flexDirection: 'row' }}>
            <View style={{ width: `${Math.max(pct, 35)}%` as `${number}%`, backgroundColor: filled, justifyContent: 'center', paddingHorizontal: 12 }}>
              {fields.includes('name') && <Text style={{ fontSize: 12, fontWeight: '700', color: text }}>{name || 'Name'}</Text>}
              {fields.includes('values') && <Text style={{ fontSize: 11, color: text, opacity: 0.9 }}>{currentValue} / {targetValue}</Text>}
              {fields.includes('percentage') && <Text style={{ fontSize: 11, color: text, opacity: 0.8 }}>{pct.toFixed(0)}%</Text>}
            </View>
          </View>
          <Text style={{ fontSize: 12, color: '#8E8E93', textAlign: 'center', marginTop: 8 }}>Customize the appearance for this tracker</Text>
        </View>

        {/* Shown fields */}
        <View style={{ margin: 16, backgroundColor: 'white', borderRadius: 12 }}>
          {shown.map((key, idx) => {
            const f = ALL_DISPLAY_FIELDS.find(f => f.key === key)!
            return (
              <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F2F2F7', gap: 12 }}>
                <Pressable onPress={() => toggle(key)} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: 'white', fontSize: 18, lineHeight: 20, fontWeight: '500' }}>−</Text>
                </Pressable>
                <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>{f.label}</Text>
                <Text style={{ color: '#C7C7CC', fontSize: 18 }}>≡</Text>
              </View>
            )
          })}
        </View>

        {/* Hidden fields */}
        <View style={{ marginHorizontal: 16, marginBottom: 32, backgroundColor: 'white', borderRadius: 12 }}>
          {hidden.map((f, idx) => (
            <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F2F2F7', gap: 12 }}>
              <Pressable onPress={() => toggle(f.key)} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: 'white', fontSize: 18, lineHeight: 20, fontWeight: '500' }}>+</Text>
              </Pressable>
              <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>{f.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
