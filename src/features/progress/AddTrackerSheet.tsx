import { useState } from 'react'
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native'
import { ColorsSubscreen } from './ColorsSubscreen'
import { DisplaySubscreen } from './DisplaySubscreen'
import { COLOR_PAIRS, RESET_OPTIONS } from './lib/trackerEncoding'
import type { ColorKey, DisplayField, ResetPeriod, TrackerMeta, Tracker } from './types'

type Screen = 'main' | 'colors' | 'display'

interface Props {
  initial?: Tracker
  onSave: (name: string, meta: TrackerMeta) => void
  onCancel: () => void
}

export function AddTrackerSheet({ initial, onSave, onCancel }: Props) {
  const [screen, setScreen] = useState<Screen>('main')
  const [name, setName] = useState(initial?.name ?? '')
  const [initialValue, setInitialValue] = useState(String(initial?.meta.initialValue ?? 0))
  const [currentValue, setCurrentValue] = useState(String(initial?.currentValue ?? 0))
  const [targetValue, setTargetValue] = useState(String(initial?.meta.targetValue ?? 100))
  const [unit, setUnit] = useState(initial?.meta.unit ?? '')
  const [category, setCategory] = useState(initial?.meta.category ?? '')
  const [colorKey, setColorKey] = useState<ColorKey>(initial?.meta.colorKey ?? 'blue')
  const [displayFields, setDisplayFields] = useState<DisplayField[]>(
    initial?.meta.displayFields ?? ['name', 'values', 'percentage']
  )
  const [resets, setResets] = useState<ResetPeriod>(initial?.meta.resets ?? 'never')
  const [action1Label, setAction1Label] = useState(initial?.meta.actions[0]?.label ?? 'Add 1')
  const [action1Delta, setAction1Delta] = useState(String(initial?.meta.actions[0]?.delta ?? 1))
  const [action2Label, setAction2Label] = useState(initial?.meta.actions[1]?.label ?? 'Add 5')
  const [action2Delta, setAction2Delta] = useState(String(initial?.meta.actions[1]?.delta ?? 5))
  const [notes, setNotes] = useState(initial?.meta.notes ?? '')
  const [resetIdx, setResetIdx] = useState(0)

  function handleSave() {
    if (!name.trim()) return
    const meta: TrackerMeta = {
      targetValue: parseFloat(targetValue) || 100,
      initialValue: parseFloat(initialValue) || 0,
      unit: unit.trim() || null,
      category: category.trim() || null,
      colorKey,
      displayFields,
      resets,
      actions: [
        { label: action1Label, delta: parseFloat(action1Delta) || 1 },
        { label: action2Label, delta: parseFloat(action2Delta) || 5 },
      ],
      notes,
    }
    onSave(name.trim(), meta)
  }

  if (screen === 'colors') {
    return <ColorsSubscreen selected={colorKey} onSelect={setColorKey} onBack={() => setScreen('main')} />
  }

  if (screen === 'display') {
    return (
      <DisplaySubscreen
        fields={displayFields}
        colorKey={colorKey}
        name={name}
        currentValue={parseFloat(currentValue) || 0}
        targetValue={parseFloat(targetValue) || 100}
        onChange={setDisplayFields}
        onBack={() => setScreen('main')}
      />
    )
  }

  const { filled, background } = COLOR_PAIRS[colorKey]

  function cycleResets() {
    const idx = RESET_OPTIONS.findIndex(o => o.value === resets)
    const next = RESET_OPTIONS[(idx + 1) % RESET_OPTIONS.length]
    setResets(next.value)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' }}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '500' }}>Cancel</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: '#1C1C1E' }}>{initial ? 'Edit Tracker' : 'Add Tracker'}</Text>
        <Pressable onPress={handleSave} hitSlop={8} disabled={!name.trim()}>
          <Text style={{ color: name.trim() ? '#FF3B30' : '#C7C7CC', fontSize: 16, fontWeight: '600' }}>Save</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <View style={{ margin: 16, backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="Tracker name"
            placeholderTextColor="#C7C7CC"
            style={{ fontSize: 16, color: '#1C1C1E' }}
          />
        </View>

        {/* Numeric fields */}
        <View style={{ marginHorizontal: 16, backgroundColor: 'white', borderRadius: 12 }}>
          {[
            { label: 'Initial Value', value: initialValue, set: setInitialValue },
            { label: 'Current Value', value: currentValue, set: setCurrentValue },
            { label: 'Target Value', value: targetValue, set: setTargetValue },
          ].map((row, idx) => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F2F2F7' }}>
              <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>{row.label}</Text>
              <TextInput
                keyboardType="numeric"
                value={row.value}
                onChangeText={row.set}
                style={{ fontSize: 16, color: '#8E8E93', textAlign: 'right', minWidth: 60 }}
              />
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F2F2F7' }}>
            <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>Unit</Text>
            <TextInput
              value={unit}
              onChangeText={setUnit}
              placeholder="None"
              placeholderTextColor="#C7C7CC"
              style={{ fontSize: 16, color: '#8E8E93', textAlign: 'right', minWidth: 80 }}
            />
          </View>
        </View>

        {/* Options */}
        <View style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: 'white', borderRadius: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>Category</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="None"
              placeholderTextColor="#C7C7CC"
              style={{ fontSize: 16, color: '#8E8E93', textAlign: 'right', minWidth: 100 }}
            />
          </View>
          <Pressable onPress={() => setScreen('display')} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F2F2F7' }}>
            <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>Display</Text>
            <View style={{ width: 32, height: 20, borderRadius: 10, flexDirection: 'row', overflow: 'hidden', marginRight: 6 }}>
              <View style={{ flex: 1, backgroundColor: filled }} />
              <View style={{ flex: 1, backgroundColor: background }} />
            </View>
            <Text style={{ color: '#C7C7CC', fontSize: 18 }}>›</Text>
          </Pressable>
          <Pressable onPress={cycleResets} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F2F2F7' }}>
            <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>Resets</Text>
            <Text style={{ fontSize: 16, color: '#8E8E93', marginRight: 6 }}>{RESET_OPTIONS.find(o => o.value === resets)?.label}</Text>
            <Text style={{ color: '#C7C7CC', fontSize: 18 }}>›</Text>
          </Pressable>
        </View>

        {/* Colors */}
        <View style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: 'white', borderRadius: 12 }}>
          <Pressable onPress={() => setScreen('colors')} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>Colors</Text>
            <View style={{ width: 32, height: 20, borderRadius: 10, flexDirection: 'row', overflow: 'hidden', marginRight: 6 }}>
              <View style={{ flex: 1, backgroundColor: filled }} />
              <View style={{ flex: 1, backgroundColor: background }} />
            </View>
            <Text style={{ color: '#C7C7CC', fontSize: 18 }}>›</Text>
          </Pressable>
        </View>

        {/* Notes */}
        <View style={{ marginHorizontal: 16, marginTop: 16, backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            placeholderTextColor="#C7C7CC"
            multiline
            numberOfLines={3}
            style={{ fontSize: 16, color: '#1C1C1E', minHeight: 72 }}
          />
        </View>

        {/* Actions */}
        <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 32, backgroundColor: 'white', borderRadius: 12 }}>
          {[
            { label: 'Action 1', lv: action1Label, setL: setAction1Label, dv: action1Delta, setD: setAction1Delta },
            { label: 'Action 2', lv: action2Label, setL: setAction2Label, dv: action2Delta, setD: setAction2Delta },
          ].map((row, idx) => (
            <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F2F2F7', gap: 8 }}>
              <Text style={{ fontSize: 15, color: '#8E8E93', width: 68 }}>{row.label}</Text>
              <TextInput
                value={row.lv}
                onChangeText={row.setL}
                placeholder="Label"
                placeholderTextColor="#C7C7CC"
                style={{ flex: 1, fontSize: 15, color: '#1C1C1E', borderBottomWidth: 1, borderBottomColor: '#E5E5EA', paddingBottom: 2 }}
              />
              <TextInput
                keyboardType="numeric"
                value={row.dv}
                onChangeText={row.setD}
                style={{ width: 56, fontSize: 15, color: '#8E8E93', textAlign: 'right', borderBottomWidth: 1, borderBottomColor: '#E5E5EA', paddingBottom: 2 }}
              />
              <Text style={{ color: '#C7C7CC', fontSize: 18 }}>›</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
