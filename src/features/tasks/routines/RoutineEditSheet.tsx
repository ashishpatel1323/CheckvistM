import { useState, useRef, useEffect } from 'react'
import { View, Text, Pressable, TextInput, ScrollView, Modal, Switch, Platform } from 'react-native'
import { X, Plus, ChevronUp, ChevronDown, Trash2, GripVertical } from 'lucide-react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { ROUTINE_COLORS, ROUTINE_COLOR_OPTIONS } from './routineTypes'
import type { RoutineDef, RoutineColor, RoutineStep } from './routineTypes'

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Web-only drag handle hook
function useDragHandle(
  stepId: string,
  onDragStart: (id: string) => void,
  onDragOver: (id: string) => void,
  onDrop: () => void,
) {
  const ref = useRef<View>(null)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const el = ref.current as unknown as HTMLElement | null
    if (!el) return
    el.setAttribute('draggable', 'true')
    el.style.cursor = 'grab'
    const onDragStartH = (e: DragEvent) => {
      e.dataTransfer?.setData('text/plain', stepId)
      el.style.opacity = '0.5'
      onDragStart(stepId)
    }
    const onDragEndH = () => { el.style.opacity = '1' }
    const onDragOverH = (e: DragEvent) => { e.preventDefault(); onDragOver(stepId) }
    const onDropH = (e: DragEvent) => { e.preventDefault(); onDrop() }
    el.addEventListener('dragstart', onDragStartH)
    el.addEventListener('dragend', onDragEndH)
    el.addEventListener('dragover', onDragOverH)
    el.addEventListener('drop', onDropH)
    return () => {
      el.removeEventListener('dragstart', onDragStartH)
      el.removeEventListener('dragend', onDragEndH)
      el.removeEventListener('dragover', onDragOverH)
      el.removeEventListener('drop', onDropH)
    }
  }, [stepId, onDragStart, onDragOver, onDrop])
  return ref
}

interface RoutineEditSheetProps {
  initial: RoutineDef | null  // null = creating new
  isMobile: boolean
  onClose: () => void
  onSave: (def: Omit<RoutineDef, 'taskId'>) => void
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const BLANK_STEP: () => RoutineStep = () => ({
  id: genId(),
  name: '',
  emoji: '✨',
  durationMin: 5,
  optional: false,
  scheduledDays: [],  // empty = every day
})

interface StepDragCardProps {
  stepId: string
  isDragTarget: boolean
  onDragStart: (id: string) => void
  onDragOver: (id: string) => void
  onDrop: () => void
  children: React.ReactNode
}

function StepDragCard({ stepId, isDragTarget, onDragStart, onDragOver, onDrop, children }: StepDragCardProps) {
  const ref = useDragHandle(stepId, onDragStart, onDragOver, onDrop)
  return (
    <View
      ref={ref}
      style={{
        backgroundColor: isDragTarget ? '#EEF2FF' : '#F9FAFB',
        borderRadius: 12, padding: 12, marginBottom: 8, gap: 8,
        borderWidth: isDragTarget ? 2 : 0,
        borderColor: isDragTarget ? '#4772FA' : 'transparent',
      }}
    >
      {children}
    </View>
  )
}

export function RoutineEditSheet({ initial, isMobile, onClose, onSave }: RoutineEditSheetProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [trigger, setTrigger] = useState(initial?.trigger ?? '')
  const [color, setColor] = useState<RoutineColor>(initial?.color ?? 'blue')
  const [steps, setSteps] = useState<RoutineStep[]>(
    initial?.steps.length
      ? initial.steps.map((s) => ({ ...s, scheduledDays: s.scheduledDays ?? [] }))
      : [BLANK_STEP()]
  )

  const canSave = name.trim().length > 0 && steps.some((s) => s.name.trim().length > 0)

  // Drag-to-reorder state (web only)
  const draggedId = useRef<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleDragStart = (id: string) => { draggedId.current = id }
  const handleDragOver = (id: string) => { setDragOverId(id) }
  const handleDrop = () => {
    const fromId = draggedId.current
    const toId = dragOverId
    draggedId.current = null
    setDragOverId(null)
    if (!fromId || !toId || fromId === toId) return
    setSteps((prev) => {
      const fromIdx = prev.findIndex((s) => s.id === fromId)
      const toIdx   = prev.findIndex((s) => s.id === toId)
      if (fromIdx < 0 || toIdx < 0) return prev
      const arr = [...prev]
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return arr
    })
  }

  const addStep = () => setSteps((prev) => [...prev, BLANK_STEP()])

  const updateStep = (id: string, patch: Partial<RoutineStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }

  const moveStep = (id: string, dir: -1 | 1) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr
    })
  }

  const handleSave = () => {
    onSave({
      name: name.trim(),
      trigger: trigger.trim(),
      color,
      steps: steps.filter((s) => s.name.trim().length > 0),
    })
  }

  const form = (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Name */}
      <View>
        <Text style={label}>Routine Name *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Morning Routine"
          placeholderTextColor="#C4C4C4"
          maxLength={50}
          style={input}
        />
      </View>

      {/* Trigger */}
      <View>
        <Text style={label}>Trigger / Anchor</Text>
        <TextInput
          value={trigger}
          onChangeText={setTrigger}
          placeholder="After I pour my coffee…"
          placeholderTextColor="#C4C4C4"
          style={[input, { fontStyle: trigger ? 'normal' : 'italic' }]}
        />
      </View>

      {/* Color */}
      <View>
        <Text style={[label, { marginBottom: 10 }]}>Color</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {ROUTINE_COLOR_OPTIONS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: ROUTINE_COLORS[c],
                alignItems: 'center', justifyContent: 'center',
                shadowColor: ROUTINE_COLORS[c],
                shadowOpacity: color === c ? 0.5 : 0,
                shadowRadius: 6,
                elevation: color === c ? 4 : 0,
              }}
            >
              {color === c && <Text style={{ color: '#fff', fontSize: 16 }}>✓</Text>}
            </Pressable>
          ))}
        </View>
      </View>

      {/* Steps */}
      <View>
        <Text style={[label, { marginBottom: 12 }]}>Steps</Text>
        {steps.map((step, idx) => {
          const isDragTarget = dragOverId === step.id
          return (
          <StepDragCard
            key={step.id}
            stepId={step.id}
            isDragTarget={isDragTarget}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {/* Grip handle (web drag) */}
              {Platform.OS === 'web' && (
                <GripVertical size={14} color="#D1D5DB" />
              )}
              {/* Emoji */}
              <TextInput
                value={step.emoji}
                onChangeText={(v) => updateStep(step.id, { emoji: v || '✨' })}
                style={{ fontSize: 24, width: 40, textAlign: 'center' }}
                maxLength={2}
              />
              {/* Name */}
              <TextInput
                value={step.name}
                onChangeText={(v) => updateStep(step.id, { name: v })}
                placeholder="Step name"
                placeholderTextColor="#C4C4C4"
                style={[input, { flex: 1, marginBottom: 0, backgroundColor: '#fff' }]}
              />
              {/* Duration */}
              <TextInput
                value={String(step.durationMin)}
                onChangeText={(v) => updateStep(step.id, { durationMin: Math.max(0, parseInt(v) || 0) })}
                keyboardType="number-pad"
                style={[input, { width: 50, textAlign: 'center', marginBottom: 0, backgroundColor: '#fff' }]}
              />
              <Text style={{ fontSize: 12, color: '#9CA3AF' }}>min</Text>
            </View>

            {/* Per-step day picker */}
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'nowrap' }}>
              {DAY_LABELS.map((lbl, di) => {
                const active = step.scheduledDays.length === 0
                  ? true  // visual: all selected when empty (every day)
                  : step.scheduledDays.includes(di)
                const isEveryDay = step.scheduledDays.length === 0
                return (
                  <Pressable
                    key={di}
                    onPress={() => {
                      const cur = step.scheduledDays.length === 0
                        ? [0, 1, 2, 3, 4, 5, 6]  // expand "every day" before toggling
                        : step.scheduledDays
                      const next = cur.includes(di)
                        ? cur.filter((d) => d !== di)
                        : [...cur, di].sort()
                      // collapse back to [] if all 7 days selected
                      updateStep(step.id, { scheduledDays: next.length === 7 ? [] : next })
                    }}
                    style={{
                      flex: 1, paddingVertical: 4, borderRadius: 6,
                      backgroundColor: active ? ROUTINE_COLORS[color] : '#F3F4F6',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '700', color: active ? '#fff' : '#9CA3AF' }}>
                      {lbl}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Switch
                  value={step.optional}
                  onValueChange={(v) => updateStep(step.id, { optional: v })}
                  trackColor={{ true: '#D1D5DB' }}
                  thumbColor="#fff"
                  style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                />
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Optional</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => moveStep(step.id, -1)} hitSlop={8} style={{ opacity: idx === 0 ? 0.3 : 1 }}>
                <ChevronUp size={16} color="#6B7280" />
              </Pressable>
              <Pressable onPress={() => moveStep(step.id, 1)} hitSlop={8} style={{ opacity: idx === steps.length - 1 ? 0.3 : 1 }}>
                <ChevronDown size={16} color="#6B7280" />
              </Pressable>
              <Pressable onPress={() => removeStep(step.id)} hitSlop={8}>
                <Trash2 size={16} color="#EF4444" />
              </Pressable>
            </View>
          </StepDragCard>
          )
        })}

        <Pressable
          onPress={addStep}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingVertical: 10, justifyContent: 'center',
            borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
            borderStyle: 'dashed',
          }}
        >
          <Plus size={16} color="#9CA3AF" />
          <Text style={{ fontSize: 14, color: '#9CA3AF' }}>Add Step</Text>
        </Pressable>
      </View>

      {/* Total duration */}
      <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
        Total: {steps.reduce((sum, s) => sum + s.durationMin, 0)} min
      </Text>

      {/* Save */}
      <Pressable
        onPress={handleSave}
        disabled={!canSave}
        style={{
          backgroundColor: canSave ? ROUTINE_COLORS[color] : '#E5E7EB',
          borderRadius: 14, paddingVertical: 16,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: canSave ? '#fff' : '#9CA3AF', fontWeight: '700', fontSize: 16 }}>
          {initial ? 'Save Changes' : 'Create Routine'}
        </Text>
      </Pressable>
    </ScrollView>
  )

  if (isMobile) {
    return (
      <BottomSheet
        open
        onClose={onClose}
        title={initial ? `Edit: ${initial.name}` : 'New Routine'}
      >
        {form}
      </BottomSheet>
    )
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View
          style={{
            backgroundColor: '#fff', borderRadius: 20, width: 480, maxHeight: '85%',
            shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 30, elevation: 20,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', padding: 20,
              borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
            }}
          >
            <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: '#111' }}>
              {initial ? `Edit: ${initial.name}` : 'New Routine'}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={22} color="#6B7280" />
            </Pressable>
          </View>
          {form}
        </View>
      </View>
    </Modal>
  )
}

const label: object = { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }
const input: object = {
  fontSize: 15, color: '#111', backgroundColor: '#F9FAFB',
  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 0,
}
