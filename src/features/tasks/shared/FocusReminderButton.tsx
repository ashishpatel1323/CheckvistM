import { useState, type ReactNode } from 'react'
import { View, Pressable, Modal, Switch, ScrollView } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
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
    <View className="mb-4.5">
      <UIText className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </UIText>
      <View className="gap-2.5">{children}</View>
    </View>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between min-h-7">
      <UIText className="text-[13px] text-foreground flex-shrink pr-2">{label}</UIText>
      <View className="flex-row items-center gap-1.5">{children}</View>
    </View>
  )
}

function Chips<T extends string | number>({ options, value, onChange }: {
  options: ReadonlyArray<{ label: string; value: T }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <View className="flex-row gap-1 flex-wrap justify-end">
      {options.map((o) => {
        const selected = o.value === value
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            className="px-2.5 py-1 rounded-md"
            style={{ backgroundColor: selected ? BLUE : '#F1F5F9' }}
          >
            <UIText className="text-xs font-semibold" style={{ color: selected ? 'white' : '#475569' }}>
              {o.label}
            </UIText>
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
      className="w-6.5 h-6.5 rounded-full bg-secondary/10 items-center justify-center"
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
            className="bg-background rounded-2xl w-90 max-w-full max-h-[85%] overflow-hidden"
            style={{ maxWidth: '100%' }}
          >
            {/* Header */}
            <View className="flex-row items-center justify-between px-4.5 py-3.5 border-b border-border">
              <UIText className="text-base font-bold text-foreground">Focus Reminders</UIText>
              <Pressable onPress={onClose} hitSlop={8}><X size={18} className="text-muted-foreground" /></Pressable>
            </View>

          <ScrollView className="px-4.5" contentContainerStyle={{ paddingVertical: 16 }}>
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
        className="flex-row items-center gap-0.75 px-1.5 py-0.75 rounded-md"
        style={{ backgroundColor: masterEnabled ? '#EEF2FF' : 'transparent' }}
      >
        {masterEnabled ? <Bell size={16} color={BLUE} /> : <BellOff size={16} color="#9CA3AF" />}
      </Pressable>
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
    </>
  )
}
