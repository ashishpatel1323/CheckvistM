import { useState, useRef } from 'react'
import { View, Text, Pressable, Platform, Modal } from 'react-native'
import { Volume2, VolumeX } from 'lucide-react-native'
import { useTTSStore, useTTSAnnouncer, useTTSActive, TTS_FREQUENCIES, type TTSFrequency } from './useTTS'

// Web-only portal menu rendered into document.body to escape overflow:hidden
function WebPortalMenu({ pos, onClose, frequencySec, setFrequency, sayElapsedTime, toggleSayElapsedTime }: {
  pos: { x: number; y: number }
  onClose: () => void
  frequencySec: number
  setFrequency: (v: TTSFrequency) => void
  sayElapsedTime: boolean
  toggleSayElapsedTime: () => void
}) {
  if (typeof document === 'undefined') return null
  const { createPortal } = require('react-dom') as typeof import('react-dom')
  return createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: 99998 }}
        onClick={onClose}
      />
      <div
        className="fixed bg-white rounded-xl border border-gray-200 py-1"
        style={{ right: window.innerWidth - pos.x, top: pos.y, minWidth: 160, zIndex: 99999, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}
      >
        <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide px-3 pt-1 pb-0.5">
          Speak every
        </div>
        {TTS_FREQUENCIES.map(({ label, value }) => (
          <div
            key={value}
            className="flex items-center justify-between px-3 py-2 text-[13px] text-gray-900 cursor-pointer hover:bg-gray-50"
            onClick={() => { setFrequency(value as TTSFrequency); onClose() }}
          >
            <span>{label}</span>
            {frequencySec === value && (
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </div>
        ))}
        <div className="border-t border-gray-100 mt-1 pt-1">
          <div
            className="flex items-center justify-between px-3 py-2 text-[13px] text-gray-900 cursor-pointer hover:bg-gray-50"
            onClick={toggleSayElapsedTime}
          >
            <span>Say elapsed time</span>
            {sayElapsedTime && (
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

// Native modal frequency picker
function NativeMenu({ onClose, frequencySec, setFrequency, sayElapsedTime, toggleSayElapsedTime }: {
  onClose: () => void
  frequencySec: number
  setFrequency: (v: TTSFrequency) => void
  sayElapsedTime: boolean
  toggleSayElapsedTime: () => void
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()} style={{
          backgroundColor: 'white', borderRadius: 14,
          paddingVertical: 8, width: 200,
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, elevation: 12,
        }}>
          <Text style={{ fontSize: 10, color: '#9ca3af', fontWeight: '600', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Speak every
          </Text>
          {TTS_FREQUENCIES.map(({ label, value }) => (
            <Pressable
              key={value}
              onPress={() => { setFrequency(value as TTSFrequency); onClose() }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 14, color: '#111827' }}>{label}</Text>
              {frequencySec === value && (
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#4772FA' }} />
              )}
            </Pressable>
          ))}
          <View style={{ borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 4, paddingTop: 4 }}>
            <Pressable
              onPress={toggleSayElapsedTime}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 14, color: '#111827' }}>Say elapsed time</Text>
              {sayElapsedTime && (
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#4772FA' }} />
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export function MuteButton() {
  const { muted, toggleMuted, frequencySec, setFrequency, sayElapsedTime, toggleSayElapsedTime } = useTTSStore()
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const activeName = useTTSActive((s) => s.activeName)
  const buttonRef = useRef<View>(null)

  useTTSAnnouncer()

  function openMenu() {
    if (Platform.OS === 'web') {
      const el = buttonRef.current as unknown as HTMLElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      setMenuPos({ x: rect.right, y: rect.bottom + 4 })
    } else {
      setShowMenu(true)
    }
  }

  return (
    <>
      <View ref={buttonRef}>
        <Pressable
          hitSlop={8}
          onPress={() => { toggleMuted(); setMenuPos(null); setShowMenu(false) }}
          onLongPress={openMenu}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 3,
            paddingHorizontal: 6, paddingVertical: 3,
            borderRadius: 8,
            backgroundColor: !muted && activeName ? '#EEF2FF' : 'transparent',
          }}
        >
          {muted
            ? <VolumeX size={16} color="#9ca3af" />
            : <Volume2 size={16} color={activeName ? '#4772FA' : '#666'} />}
          {!muted && activeName && (
            <Text style={{ fontSize: 10, color: '#4772FA', fontWeight: '600', maxWidth: 80 }} numberOfLines={1}>
              {activeName}
            </Text>
          )}
        </Pressable>
      </View>

      {Platform.OS === 'web' && menuPos && (
        <WebPortalMenu
          pos={menuPos}
          onClose={() => setMenuPos(null)}
          frequencySec={frequencySec}
          setFrequency={setFrequency}
          sayElapsedTime={sayElapsedTime}
          toggleSayElapsedTime={toggleSayElapsedTime}
        />
      )}

      {Platform.OS !== 'web' && showMenu && (
        <NativeMenu
          onClose={() => setShowMenu(false)}
          frequencySec={frequencySec}
          setFrequency={setFrequency}
          sayElapsedTime={sayElapsedTime}
          toggleSayElapsedTime={toggleSayElapsedTime}
        />
      )}
    </>
  )
}
