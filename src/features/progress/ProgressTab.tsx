import { useState } from 'react'
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { useTrackers, useCreateTracker } from './hooks/useTrackers'
import { TrackerCard } from './TrackerCard'
import { TrackerDetailView } from './TrackerDetailView'
import { AddTrackerSheet } from './AddTrackerSheet'
import type { Tracker, TrackerMeta } from './types'

type TabView = { kind: 'list' } | { kind: 'detail'; tracker: Tracker } | { kind: 'add' }

export function ProgressTab() {
  const [view, setView] = useState<TabView>({ kind: 'list' })
  // Always mounted so the query observer stays active across view changes
  const { data: trackers = [], isLoading, error, refetch } = useTrackers()
  const createTracker = useCreateTracker()

  async function handleCreate(name: string, meta: TrackerMeta) {
    try {
      await createTracker.mutateAsync({ name, meta })
      await refetch()
      setView({ kind: 'list' })
    } catch (e) {
      Alert.alert('Save failed', String(e))
    }
  }

  if (view.kind === 'add') {
    return (
      <View style={{ flex: 1 }}>
        <AddTrackerSheet onSave={handleCreate} onCancel={() => setView({ kind: 'list' })} />
      </View>
    )
  }

  if (view.kind === 'detail') {
    return (
      <View style={{ flex: 1 }}>
        <TrackerDetailView
          tracker={view.tracker}
          onBack={() => { refetch(); setView({ kind: 'list' }) }}
          onDeleted={() => { refetch(); setView({ kind: 'list' }) }}
        />
      </View>
    )
  }

  // List view
  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' }}>
        <View style={{ width: 32 }} />
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#1C1C1E' }}>Progress</Text>
        <Pressable onPress={() => setView({ kind: 'add' })} hitSlop={8}>
          <Text style={{ fontSize: 26, color: '#8E8E93', lineHeight: 30, fontWeight: '300' }}>+</Text>
        </Pressable>
      </View>

      {error && (
        <View style={{ margin: 12, padding: 10, backgroundColor: '#FFF2F2', borderRadius: 8 }}>
          <Text style={{ color: '#DC2626', fontSize: 12 }} selectable>Error: {String(error)}</Text>
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#8E8E93" />
          <Text style={{ color: '#8E8E93', marginTop: 8, fontSize: 14 }}>Loading trackers…</Text>
        </View>
      ) : trackers.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#3C3C43' }}>No trackers yet</Text>
          <Text style={{ fontSize: 14, color: '#8E8E93', textAlign: 'center' }}>Tap + to create your first progress tracker</Text>
          <Pressable
            onPress={() => setView({ kind: 'add' })}
            style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#2B5BAD', borderRadius: 22 }}
          >
            <Text style={{ color: 'white', fontWeight: '600', fontSize: 15 }}>Add Tracker</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {trackers.map(tracker => (
              <View key={tracker.taskId} style={{ width: '47%' }}>
                <TrackerCard
                  tracker={tracker}
                  onClick={() => setView({ kind: 'detail', tracker })}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}
