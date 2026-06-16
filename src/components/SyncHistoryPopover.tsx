/**
 * SyncHistoryPopover — shows last 20 synced items.
 * Uses Modal on all platforms so it escapes any overflow:hidden parent.
 * Web: renders at fixed screen coordinates measured from the trigger ref.
 * Native: BottomSheet slide-up.
 */

import { useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, Pressable, Platform, Modal } from 'react-native'
import { CheckCircle2, XCircle, Clock } from 'lucide-react-native'
import { formatDistanceToNow } from 'date-fns'
import { useSyncState, type SyncHistoryItem } from '@/lib/sync/syncState'
import { BottomSheet } from './BottomSheet'
import { colors } from '@/design/tokens'

export interface SyncHistoryAnchor {
  /** Ref to the element that triggers the popover — used to measure position on web */
  triggerRef: React.RefObject<View>
}

interface SyncHistoryPopoverProps extends SyncHistoryAnchor {
  open: boolean
  onClose: () => void
}

const ENTITY_LABELS: Record<string, string> = {
  task: 'Task',
  routine: 'Routine',
  checkin: 'Check-in',
  session: 'Log',
  tracker: 'Tracker',
  entry: 'Progress',
  map: 'Map',
}

function HistoryRow({ item }: { item: SyncHistoryItem }) {
  const isSynced = item.status === 'synced'
  const timeAgo = formatDistanceToNow(item.syncedAt, { addSuffix: true })
  const entityBadge = ENTITY_LABELS[item.entityType] ?? item.entityType

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: '#F3F4F6',
    }}>
      {isSynced
        ? <CheckCircle2 size={16} color="#10B981" />
        : <XCircle size={16} color="#EF4444" />}

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textPrimary ?? '#111827' }}>
          {item.label}
        </Text>
        <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{timeAgo}</Text>
      </View>

      <View style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: '#F3F4F6',
      }}>
        <Text style={{ fontSize: 10, color: '#6B7280', fontWeight: '500' }}>
          {entityBadge}
        </Text>
      </View>
    </View>
  )
}

function HistoryList() {
  const history = useSyncState((s) => s.history)
  const reversed = [...history].reverse()

  if (reversed.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
        <Clock size={24} color="#D1D5DB" />
        <Text style={{ fontSize: 13, color: '#9CA3AF' }}>No sync history yet</Text>
        <Text style={{ fontSize: 12, color: '#D1D5DB', textAlign: 'center' }}>
          Items will appear here after syncing
        </Text>
      </View>
    )
  }

  return (
    <>
      {reversed.map((item) => <HistoryRow key={item.id + item.syncedAt} item={item} />)}
    </>
  )
}

const DROPDOWN_WIDTH = 320

// ─── Web Modal dropdown ────────────────────────────────────────────────────────

function WebModalDropdown({ open, onClose, triggerRef }: SyncHistoryPopoverProps) {
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (!open || !triggerRef.current) return

    // Measure the trigger element's position in the viewport
    triggerRef.current.measure((_x, _y, width, height, pageX, pageY) => {
      // Anchor to bottom-right of trigger
      const right = window.innerWidth - pageX - width
      setCoords({ top: pageY + height + 6, right })
    })
  }, [open, triggerRef])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open || !coords) return null

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose}>
      {/* Full-screen backdrop to catch outside clicks */}
      <Pressable
        style={{ flex: 1 }}
        onPress={onClose}
      >
        {/* Stop propagation so clicking inside the dropdown doesn't close it */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: coords.top,
            right: coords.right,
            width: DROPDOWN_WIDTH,
            backgroundColor: 'white',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 16,
          }}
        >
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#F3F4F6',
          }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>
              Sync History
            </Text>
            <Text style={{ fontSize: 11, color: '#9CA3AF' }}>Last 20 items</Text>
          </View>

          <ScrollView
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8 }}
          >
            <HistoryList />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function SyncHistoryPopover(props: SyncHistoryPopoverProps) {
  if (Platform.OS !== 'web') {
    return (
      <BottomSheet open={props.open} onClose={props.onClose} title="Sync History">
        <HistoryList />
      </BottomSheet>
    )
  }

  return <WebModalDropdown {...props} />
}
