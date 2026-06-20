import { useState, type ReactNode } from 'react'
import { View, Text, Pressable, Modal, Switch, ScrollView } from 'react-native'
import { Bell, BellOff, X, Play } from 'lucide-react-native'
import {
  useFocusReminderSettings,
  previewSound,
  EXECUTE_TONES,
  ROUTINE_TONES,
  FREQUENCY_OPTIONS,
  type SoundName,
} from '@/services/focusReminder'

const BLUE = '#4772FA'
const VOLUME_PRESETS = [
  { label: 'Low', value: 0.3 },
  { label: 'Med', value: 0.6 },
  { label: 'High', value: 0.9 },
] as const

// ── Small primitives ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        {title}
      </Text>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 }}>
      <Text style={{ fontSize: 13, color: '#111827', flexShrink: 1, paddingRight: 8 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{children}</View>
    </View>
  )
}

function Chips<T extends string | number>({ options, value, onChange }: {
  options: ReadonlyArray<{ label: string; value: T }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {options.map((o) => {
        const selected = o.value === value
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={{
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
              backgroundColor: selected ? BLUE : '#F1F5F9',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? 'white' : '#475569' }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function VolumeChips({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Snap current value to the nearest preset for highlighting.
  const nearest = VOLUME_PRESETS.reduce((a, b) => (Math.abs(b.value - value) < Math.abs(a.value - value) ? b : a))
  return <Chips options={VOLUME_PRESETS} value={nearest.value} onChange={onChange} />
}

function PreviewButton({ sound, volume }: { sound: SoundName; volume: number }) {
  return (
    <Pressable
      onPress={() => previewSound(sound, volume)}
      hitSlop={8}
      style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}
    >
      <Play size={13} color={BLUE} />
    </Pressable>
  )
}

// ── Settings panel ─────────────────────────────────────────────────────────────
function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useFocusReminderSettings()
  const patch = s.patch

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: 'white', borderRadius: 16, width: 360, maxWidth: '100%', maxHeight: '85%', overflow: 'hidden' }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>Focus Reminders</Text>
            <Pressable onPress={onClose} hitSlop={8}><X size={18} color="#94A3B8" /></Pressable>
          </View>

          <ScrollView style={{ paddingHorizontal: 18 }} contentContainerStyle={{ paddingVertical: 16 }}>
            {/* Global */}
            <Section title="Global">
              <Row label="Enable all reminders">
                <Switch value={s.masterEnabled} onValueChange={(v) => patch({ masterEnabled: v })} />
              </Row>
            </Section>

            {/* Execute */}
            <Section title="Execute mode">
              <Row label="Enabled">
                <Switch value={s.execute.enabled} onValueChange={(v) => patch({ execute: { enabled: v } })} />
              </Row>
              <Row label="Frequency">
                <Chips options={FREQUENCY_OPTIONS} value={s.execute.intervalSec} onChange={(v) => patch({ execute: { intervalSec: v } })} />
              </Row>
              <Row label="Reminder sound">
                <Switch value={s.execute.sound.enabled} onValueChange={(v) => patch({ execute: { sound: { enabled: v } } })} />
              </Row>
              <Row label="Tone">
                <PreviewButton sound={s.execute.sound.tone} volume={s.execute.sound.volume} />
                <Chips
                  options={EXECUTE_TONES.map((t) => ({ label: t, value: t }))}
                  value={s.execute.sound.tone}
                  onChange={(v) => patch({ execute: { sound: { tone: v } } })}
                />
              </Row>
              <Row label="Volume">
                <VolumeChips value={s.execute.sound.volume} onChange={(v) => patch({ execute: { sound: { volume: v } } })} />
              </Row>
              <Row label="Heartbeat tick">
                <Switch value={s.execute.heartbeat.enabled} onValueChange={(v) => patch({ execute: { heartbeat: { enabled: v } } })} />
              </Row>
            </Section>

            {/* Routine */}
            <Section title="Routine mode">
              <Row label="Enabled">
                <Switch value={s.routine.enabled} onValueChange={(v) => patch({ routine: { enabled: v } })} />
              </Row>
              <Row label="Frequency">
                <Chips options={FREQUENCY_OPTIONS} value={s.routine.intervalSec} onChange={(v) => patch({ routine: { intervalSec: v } })} />
              </Row>
              <Row label="Reminder sound">
                <Switch value={s.routine.sound.enabled} onValueChange={(v) => patch({ routine: { sound: { enabled: v } } })} />
              </Row>
              <Row label="Tone">
                <PreviewButton sound={s.routine.sound.tone} volume={s.routine.sound.volume} />
                <Chips
                  options={ROUTINE_TONES.map((t) => ({ label: t, value: t }))}
                  value={s.routine.sound.tone}
                  onChange={(v) => patch({ routine: { sound: { tone: v } } })}
                />
              </Row>
              <Row label="Volume">
                <VolumeChips value={s.routine.sound.volume} onChange={(v) => patch({ routine: { sound: { volume: v } } })} />
              </Row>
              <Row label="Heartbeat tick">
                <Switch value={s.routine.heartbeat.enabled} onValueChange={(v) => patch({ routine: { heartbeat: { enabled: v } } })} />
              </Row>
            </Section>

            {/* Escalation */}
            <Section title="Escalation (when you leave the app)">
              <Row label="Enabled">
                <Switch value={s.escalation.enabled} onValueChange={(v) => patch({ escalation: { enabled: v } })} />
              </Row>
              <Row label="Level 1 · double beep">
                <PreviewButton sound="escalation1" volume={s.escalation.volume} />
                <Switch value={s.escalation.level1} onValueChange={(v) => patch({ escalation: { level1: v } })} />
              </Row>
              <Row label="Level 2 · strong alert">
                <PreviewButton sound="escalation2" volume={s.escalation.volume} />
                <Switch value={s.escalation.level2} onValueChange={(v) => patch({ escalation: { level2: v } })} />
              </Row>
              <Row label="Level 3 · urgent">
                <PreviewButton sound="escalation3" volume={s.escalation.volume} />
                <Switch value={s.escalation.level3} onValueChange={(v) => patch({ escalation: { level3: v } })} />
              </Row>
              <Row label="Volume">
                <VolumeChips value={s.escalation.volume} onChange={(v) => patch({ escalation: { volume: v } })} />
              </Row>
            </Section>

            {/* Overtime */}
            <Section title="Overtime beep alert">
              <Row label="Enabled (beep when over estimate)">
                <PreviewButton sound="overtime" volume={s.overtime.volume} />
                <Switch value={s.overtime.enabled} onValueChange={(v) => patch({ overtime: { enabled: v } })} />
              </Row>
              <Row label="Repeat every">
                <Chips
                  options={[{ label: '2s', value: 2 }, { label: '3s', value: 3 }, { label: '5s', value: 5 }, { label: '10s', value: 10 }]}
                  value={s.overtime.intervalSec}
                  onChange={(v) => patch({ overtime: { intervalSec: v } })}
                />
              </Row>
              <Row label="Volume">
                <VolumeChips value={s.overtime.volume} onChange={(v) => patch({ overtime: { volume: v } })} />
              </Row>
            </Section>

            {/* Resume */}
            <Section title="Return chime">
              <Row label="Enabled">
                <PreviewButton sound="resume" volume={s.resume.volume} />
                <Switch value={s.resume.enabled} onValueChange={(v) => patch({ resume: { enabled: v } })} />
              </Row>
              <Row label="Volume">
                <VolumeChips value={s.resume.volume} onChange={(v) => patch({ resume: { volume: v } })} />
              </Row>
            </Section>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ── Trigger button ────────────────────────────────────────────────────────────────
export function FocusReminderButton() {
  const [open, setOpen] = useState(false)
  const masterEnabled = useFocusReminderSettings((s) => s.masterEnabled)

  return (
    <>
      <Pressable
        hitSlop={8}
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 3,
          paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8,
          backgroundColor: masterEnabled ? '#EEF2FF' : 'transparent',
        }}
      >
        {masterEnabled ? <Bell size={16} color={BLUE} /> : <BellOff size={16} color="#9CA3AF" />}
      </Pressable>
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
    </>
  )
}
