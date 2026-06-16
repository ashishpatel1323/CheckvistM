/**
 * SyncButton — single pill that shows sync status + acts as the sync CTA.
 * Tap → trigger sync. Long-press → open history popover.
 */

import { useState, useCallback, useRef } from 'react'
import { Pressable, View, Text } from 'react-native'
import { CheckCircle2, AlertCircle, Clock, Loader } from 'lucide-react-native'
import { useSyncState } from '@/lib/sync/syncState'
import { run, isRunning } from '@/lib/sync/syncEngine'
import { SyncHistoryPopover } from './SyncHistoryPopover'

interface SyncButtonProps {
  onRefetch?: () => void
}

type SyncStatus = 'syncing' | 'failed' | 'pending' | 'synced'

function deriveStatus(syncing: number, failed: number, pending: number): SyncStatus {
  if (syncing > 0) return 'syncing'
  if (failed > 0) return 'failed'
  if (pending > 0) return 'pending'
  return 'synced'
}

const STATUS_CONFIG: Record<SyncStatus, {
  icon: (size: number, color: string) => React.ReactNode
  label: string
  color: string
  iconColor: string
  bg: string
  border: string
  disabled: boolean
}> = {
  syncing: {
    icon: (size, color) => <Loader size={size} color={color} />,
    label: 'Syncing…',
    color: '#3B82F6',
    iconColor: '#3B82F6',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    disabled: true,
  },
  failed: {
    icon: (size, color) => <AlertCircle size={size} color={color} />,
    label: 'Sync failed — tap to retry',
    color: '#EF4444',
    iconColor: '#EF4444',
    bg: '#FEF2F2',
    border: '#FECACA',
    disabled: false,
  },
  pending: {
    icon: (size, color) => <Clock size={size} color={color} />,
    label: 'Tap to sync',
    color: '#92400E',
    iconColor: '#F59E0B',
    bg: '#FFFBEB',
    border: '#FDE68A',
    disabled: false,
  },
  synced: {
    icon: (size, color) => <CheckCircle2 size={size} color={color} />,
    label: 'All synced',
    color: '#6B7280',
    iconColor: '#10B981',
    bg: '#F9FAFB',
    border: '#E5E7EB',
    disabled: false,
  },
}

export function SyncButton({ onRefetch }: SyncButtonProps) {
  const { pending, syncing, failed } = useSyncState()
  const status = deriveStatus(syncing, failed, pending)
  const cfg = STATUS_CONFIG[status]
  const [historyOpen, setHistoryOpen] = useState(false)
  const triggerRef = useRef<View>(null)

  const handleSync = useCallback(() => {
    if (isRunning()) return
    run().catch(console.warn)
    onRefetch?.()
  }, [onRefetch])

  return (
    <View>
      <Pressable
        ref={triggerRef}
        onPress={cfg.disabled ? undefined : handleSync}
        onLongPress={() => setHistoryOpen((v) => !v)}
        delayLongPress={400}
        disabled={cfg.disabled}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: cfg.border,
          backgroundColor: cfg.bg,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {cfg.icon(13, cfg.iconColor)}
        <Text style={{ fontSize: 12, fontWeight: '500', color: cfg.color }}>
          {cfg.label}
        </Text>
      </Pressable>

      <SyncHistoryPopover
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        triggerRef={triggerRef}
      />
    </View>
  )
}
