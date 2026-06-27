import { type ReactNode } from 'react'
import { View, Pressable, ScrollView, Switch } from 'react-native'
import { Text as UIText } from '@/components/ui/text'
import { Sun, Moon, Monitor, Play } from 'lucide-react-native'
import { useTheme, type ThemeMode } from './useTheme'
import { useTaskSettings } from './useTaskSettings'
import { useFocusReminderSettings, previewSound, FREQUENCY_OPTIONS, type SoundName } from '@/services/focusReminder'
import { usePomodoro, POMO_WORK_PRESETS, POMO_BREAK_PRESETS } from '@/features/pomodoro/usePomodoro'

const BLUE = '#4772FA'

// ── Theme section ──────────────────────────────────────────────────────────────

const THEME_OPTIONS: { key: ThemeMode; icon: typeof Sun; label: string }[] = [
  { key: 'light', icon: Sun, label: 'Light' },
  { key: 'dark', icon: Moon, label: 'Dark' },
  { key: 'system', icon: Monitor, label: 'System' },
]

function ThemeSection() {
  const { mode, setMode } = useTheme()
  return (
    <Section title="Appearance">
      <View className="flex-row gap-3">
        {THEME_OPTIONS.map(({ key, icon: Icon, label }) => {
          const active = mode === key
          return (
            <Pressable
              key={key}
              onPress={() => setMode(key)}
              className="flex-1 items-center gap-1.5 py-3 rounded-xl border"
              style={{
                backgroundColor: active ? '#EEF2FF' : 'transparent',
                borderColor: active ? BLUE : '#E5E7EB',
              }}
            >
              <Icon size={20} color={active ? BLUE : '#6B7280'} />
              <UIText className="text-xs font-semibold" style={{ color: active ? BLUE : '#6B7280' }}>
                {label}
              </UIText>
            </Pressable>
          )
        })}
      </View>
    </Section>
  )
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="mb-6">
      <UIText className="text-sm font-bold text-foreground uppercase tracking-wider mb-3.5">
        {title}
      </UIText>
      <View className="gap-3">{children}</View>
    </View>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between min-h-8">
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

const VOLUME_PRESETS = [
  { label: 'Low', value: 0.3 },
  { label: 'Med', value: 0.6 },
  { label: 'High', value: 0.9 },
] as const

function VolumeChips({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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

// ── Focus Reminder section ─────────────────────────────────────────────────────

function FocusReminderSection() {
  const s = useFocusReminderSettings()
  const patch = s.patch

  return (
    <Section title="Focus Reminders">
      <Row label="Enable all reminders">
        <Switch value={s.masterEnabled} onValueChange={(v) => patch({ masterEnabled: v })} />
      </Row>

      {/* Unified reminder settings */}
      <Row label="Frequency">
        <Chips options={FREQUENCY_OPTIONS} value={s.execute.intervalSec} onChange={(v) => patch({ execute: { intervalSec: v }, routine: { intervalSec: v } })} />
      </Row>
      <Row label="Reminder sound">
        <Switch value={s.execute.sound.enabled} onValueChange={(v) => patch({ execute: { sound: { enabled: v } }, routine: { sound: { enabled: v } } })} />
      </Row>
      <Row label="Volume">
        <VolumeChips value={s.execute.sound.volume} onChange={(v) => patch({ execute: { sound: { volume: v } }, routine: { sound: { volume: v } } })} />
      </Row>
      <Row label="Heartbeat tick">
        <Switch value={s.execute.heartbeat.enabled} onValueChange={(v) => patch({ execute: { heartbeat: { enabled: v } }, routine: { heartbeat: { enabled: v } } })} />
      </Row>

      {/* Overtime */}
      <UIText className="text-[12px] font-semibold text-foreground mt-2">Overtime beep alert</UIText>
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
  )
}

// ── Pomodoro section ───────────────────────────────────────────────────────────

function PomodoroSection() {
  const pomo = usePomodoro()
  return (
    <Section title="Pomodoro Timer">
      <Row label="Work duration">
        <Chips
          options={POMO_WORK_PRESETS.map((m) => ({ label: `${m} min`, value: m }))}
          value={pomo.workMin}
          onChange={(v) => pomo.setWorkMin(v)}
        />
      </Row>
      <Row label="Break duration">
        <Chips
          options={POMO_BREAK_PRESETS.map((m) => ({ label: `${m} min`, value: m }))}
          value={pomo.breakMin}
          onChange={(v) => pomo.setBreakMin(v)}
        />
      </Row>
    </Section>
  )
}

// ── Task Display section ──────────────────────────────────────────────────────

function TaskDisplaySection() {
  const { hierarchyMode, setHierarchyMode } = useTaskSettings()
  return (
    <Section title="Task Display">
      <Row label="Hierarchy mode">
        <Switch value={hierarchyMode} onValueChange={setHierarchyMode} />
      </Row>
      <UIText className="text-[11px] text-muted-foreground" style={{ lineHeight: 16 }}>
        When on, parent tasks show their children inline (expandable). When off, all tasks appear as a flat list.
      </UIText>
    </Section>
  )
}

// ── Screenshot section ───────────────────────────────────────────────────────

function ScreenshotSection() {
  const { screenshotEnabled, setScreenshotEnabled } = useTaskSettings()
  return (
    <Section title="Capture">
      <Row label="Screenshot on task complete">
        <Switch value={screenshotEnabled} onValueChange={setScreenshotEnabled} />
      </Row>
      <UIText className="text-[11px] text-muted-foreground" style={{ lineHeight: 16 }}>
        Automatically capture a screenshot when you mark a task as done.
      </UIText>
    </Section>
  )
}

// ── Main SettingsView ──────────────────────────────────────────────────────────

export function SettingsView() {
  return (
    <View style={{ flex: 1, backgroundColor: 'hsl(var(--background))' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <ThemeSection />
        <TaskDisplaySection />
        <PomodoroSection />
        <FocusReminderSection />
        <ScreenshotSection />
      </ScrollView>
    </View>
  )
}
