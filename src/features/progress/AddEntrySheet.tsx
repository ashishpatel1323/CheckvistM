import { useState } from 'react'
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native'
import { format } from 'date-fns'
import type { EntryMode, TrackerEntry } from './types'

interface Props {
  currentValue: number
  initial?: TrackerEntry
  onSave: (mode: EntryMode, value: number, note: string, date: Date) => void
  onCancel: () => void
}

export function AddEntrySheet({ currentValue, initial, onSave, onCancel }: Props) {
  const [mode, setMode] = useState<EntryMode>(initial?.meta.mode ?? 'set')
  const [value, setValue] = useState(String(initial?.meta.value ?? 0))
  const [note, setNote] = useState(initial?.meta.note ?? '')
  const [date] = useState<Date>(initial ? new Date(initial.effectiveDate) : new Date())

  function handleSave() {
    onSave(mode, parseFloat(value) || 0, note, date)
  }

  const modeLabels: { key: EntryMode; label: string }[] = [
    { key: 'set', label: 'Set' },
    { key: 'increase', label: 'Increase' },
    { key: 'decrease', label: 'Decrease' },
  ]

  const valueLabel = mode === 'set' ? 'Set Value To' : mode === 'increase' ? 'Increase By' : 'Decrease By'

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' }}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '500' }}>Cancel</Text>
        </Pressable>
        <Text style={{ fontSize: 17, fontWeight: '600', color: '#1C1C1E' }}>{initial ? 'Edit Entry' : 'Add Entry'}</Text>
        <Pressable onPress={handleSave} hitSlop={8}>
          <Text style={{ color: '#FF3B30', fontSize: 16, fontWeight: '600' }}>Save</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {/* Date (read-only display — date picker on mobile is complex; show date) */}
        <View style={{ margin: 16, backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 16, color: '#1C1C1E' }}>Date</Text>
            <Text style={{ fontSize: 16, color: '#8E8E93' }}>{format(date, 'MMM d, yyyy h:mm a')}</Text>
          </View>
        </View>

        {/* Mode + Value */}
        <View style={{ marginHorizontal: 16, backgroundColor: 'white', borderRadius: 12 }}>
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#F2F2F7' }}>
            <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E5EA' }}>
              {modeLabels.map(m => (
                <Pressable
                  key={m.key}
                  onPress={() => setMode(m.key)}
                  style={{ flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: mode === m.key ? 'white' : '#F2F2F7' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '500', color: mode === m.key ? '#1C1C1E' : '#8E8E93' }}>{m.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, color: '#1C1C1E' }}>{valueLabel}</Text>
              <Text style={{ fontSize: 12, color: '#8E8E93', marginTop: 2 }}>Current: {currentValue}</Text>
            </View>
            <TextInput
              keyboardType="numeric"
              value={value}
              onChangeText={setValue}
              style={{ fontSize: 22, color: '#8E8E93', textAlign: 'right', minWidth: 80 }}
            />
          </View>
        </View>

        {/* Note */}
        <View style={{ marginHorizontal: 16, marginTop: 16, marginBottom: 32, backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor="#C7C7CC"
            multiline
            numberOfLines={4}
            style={{ fontSize: 16, color: '#1C1C1E', minHeight: 96 }}
          />
        </View>
      </ScrollView>
    </View>
  )
}
