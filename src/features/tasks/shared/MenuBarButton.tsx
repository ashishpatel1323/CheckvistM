import { useEffect, useState } from 'react'
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native'
import { MonitorDot, X, Copy, Check } from 'lucide-react-native'
import { getRelayCoords, CHECKVIST_SERVER, useMenuBarPublishStatus } from '@/services/menuBarSync'
import { useAuth } from '@/auth/useAuth'

// Web-only header button that reveals the macOS menu-bar app setup: the private Checkvist list/task
// that holds the live snapshot, plus install instructions. The app writes the snapshot into a hidden
// Checkvist list using your session; the menu-bar app logs in with your own API key and polls it.
// Display-only mirror of the in-app global timer — see tools/menubar-app/.

const BLUE = '#4772FA'

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — user can select the text manually */
    }
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </Text>
      <Pressable
        onPress={copy}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
        }}
      >
        <Text selectable style={{ flex: 1, fontSize: 12, color: '#111827', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }} numberOfLines={1}>
          {value}
        </Text>
        {copied ? <Check size={15} color="#16A34A" /> : <Copy size={15} color={BLUE} />}
      </Pressable>
    </View>
  )
}

function PublishStatusRow() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated)
  const { lastOkAt, lastError } = useMenuBarPublishStatus()
  // Re-render every second so the "Xs ago" age stays current while the panel is open.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const ageSec = lastOkAt ? Math.floor((Date.now() - lastOkAt) / 1000) : Infinity
  // useMenuBarSync posts at least once per 60s heartbeat while active; allow buffer.
  const active = isAuthenticated && lastOkAt > 0 && ageSec <= 90 && !lastError

  let color: string
  let dot: string
  let message: string
  if (!isAuthenticated) {
    color = '#B45309'; dot = '#F59E0B'
    message = 'Not signed in — sign in and keep this tab open to publish.'
  } else if (lastOkAt === 0) {
    color = '#B45309'; dot = '#F59E0B'
    message = lastError ? 'Publish failed — check your connection.' : 'Waiting for first publish…'
  } else if (active) {
    color = '#166534'; dot = '#16A34A'
    message = `Publishing · last sent ${ageSec <= 1 ? 'just now' : `${ageSec}s ago`}`
  } else {
    color = '#B45309'; dot = '#F59E0B'
    message = lastError
      ? 'Last publish failed — check your connection.'
      : `Stale · last sent ${formatAgo(ageSec)} ago. Keep this tab open and awake.`
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
      <View style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: dot }} />
      <Text style={{ flex: 1, fontSize: 12, color, lineHeight: 17 }}>{message}</Text>
    </View>
  )
}

function formatAgo(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h`
}

function SetupPanel({ onClose }: { onClose: () => void }) {
  // Coords are created on the first write; re-read once a second until they appear.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const coords = getRelayCoords()

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, backgroundColor: 'white', borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MonitorDot size={18} color={BLUE} />
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>Menu bar timer</Text>
            </View>
            <Pressable hitSlop={8} onPress={onClose}><X size={18} color="#9CA3AF" /></Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text style={{ fontSize: 13, color: '#4B5563', lineHeight: 19 }}>
              Mirror this app's live timer in the macOS menu bar. Keep this tab open so it keeps writing
              the snapshot into a hidden, private Checkvist list (below); the menu-bar app logs in with
              your own Checkvist API key and shows the running task, routine step, or idle countdown.
            </Text>

            <PublishStatusRow />

            <CopyRow label="Checkvist server" value={CHECKVIST_SERVER} />
            {coords ? (
              <>
                <CopyRow label="List ID" value={String(coords.listId)} />
                <CopyRow label="Task ID" value={String(coords.taskId)} />
              </>
            ) : (
              <Text style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
                Start a timer once to create the hidden state list — the List ID and Task ID will appear here.
              </Text>
            )}

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Setup
              </Text>
              {[
                'Build the app:  ./tools/menubar-app/build.sh  then open ~/Applications/CheckvistTimer.app',
                'Get your API key from Checkvist → Profile → "OpenAPI key" (this is your remote key).',
                'In the app’s menu, enter your Checkvist email + API key, then the List ID and Task ID above.',
              ].map((step, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: BLUE, width: 14 }}>{i + 1}.</Text>
                  <Text style={{ flex: 1, fontSize: 12, color: '#374151', lineHeight: 18 }}>{step}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function MenuBarButton() {
  const [open, setOpen] = useState(false)
  // Menu-bar mirror only makes sense on the web build (the desktop browser tab does the publishing).
  if (Platform.OS !== 'web') return null

  return (
    <>
      <Pressable
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 }}
      >
        <MonitorDot size={16} color="#9CA3AF" />
      </Pressable>
      {open && <SetupPanel onClose={() => setOpen(false)} />}
    </>
  )
}
