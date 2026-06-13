import { ReactNode, useState } from 'react'
import { View, Text, Pressable, Platform } from 'react-native'
import { Linking } from 'react-native'
import { Globe, Maximize2, Minimize2 } from 'lucide-react-native'

interface RawViewProps {
  checklistId: number
  taskId?: number | null
  onClose?: () => void
  timerBar?: ReactNode
}

const BLUE = '#6366F1'

function FullscreenToggle({ fullscreen, onToggle }: { fullscreen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 8,
        border: '1px solid #E5E7EB', backgroundColor: 'white',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {fullscreen
        ? <Minimize2 size={13} color="#6B7280" />
        : <Maximize2 size={13} color="#6B7280" />}
    </button>
  )
}

export function RawView({ checklistId, taskId, onClose, timerBar }: RawViewProps) {
  const [fullscreen, setFullscreen] = useState(false)

  const url = taskId
    ? `https://checkvist.com/checklists/${checklistId}#task_${taskId}`
    : `https://checkvist.com/checklists/${checklistId}`

  if (Platform.OS === 'web') {
    const toolbar = (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px',
        borderBottom: '1px solid #F1F5F9',
        backgroundColor: '#FAFAFA',
        flexShrink: 0,
      }}>
        {/* Timer bar slot — flex fills the row */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {timerBar}
        </div>
        <FullscreenToggle fullscreen={fullscreen} onToggle={() => setFullscreen(f => !f)} />
      </div>
    )

    if (fullscreen) {
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          backgroundColor: 'white',
        }}>
          {toolbar}
          <iframe
            key={url}
            src={url}
            style={{ flex: 1, width: '100%', border: 'none' }}
            title="Checkvist Raw View"
          />
        </div>
      )
    }

    return (
      <View style={{ flex: 1, flexDirection: 'column' }}>
        {toolbar}
        <iframe
          key={url}
          src={url}
          style={{ flex: 1, width: '100%', border: 'none' } as React.CSSProperties}
          title="Checkvist Raw View"
        />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
      <View style={{
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
      }}>
        <Globe size={36} color={BLUE} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '600', color: '#222', textAlign: 'center' }}>
        View in Browser
      </Text>
      <Text style={{ fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 }}>
        Opens the full Checkvist web app in your browser with all features.
      </Text>
      <Pressable
        onPress={() => Linking.openURL(url)}
        style={{
          backgroundColor: BLUE, borderRadius: 28, paddingVertical: 14,
          paddingHorizontal: 32, marginTop: 8,
        }}
      >
        <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>Open Checkvist</Text>
      </Pressable>
      <Text style={{ fontSize: 12, color: '#BDBDBD', textAlign: 'center' }}>{url}</Text>
    </View>
  )
}
