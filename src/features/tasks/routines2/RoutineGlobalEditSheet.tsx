/**
 * RoutineGlobalEditSheet — fullscreen global habit editor for Routine 2.
 *
 * Shows every habit across every routine, grouped by routine. Each habit row has
 * a routine dropdown so it can be re-tagged to another routine (its completion
 * history follows it, because habit logs are keyed by habit id alone). The
 * dropdown can also create a new routine (quick name + color). Routine sections
 * are editable (name / trigger / color / delete). Saving persists each routine
 * def via the shared useRoutineSystem; the routine is purely a grouping.
 */

import { useState } from 'react'
import { View, Text, Pressable, TextInput, ScrollView, Modal, Switch, Platform } from 'react-native'
import { X, Plus, ChevronUp, ChevronDown, Trash2, ChevronDown as Caret } from 'lucide-react-native'
import { useRoutineSystem } from '../routines/useRoutineSystem'
import { useRoutine2System } from './useRoutine2System'
import { useRoutine2Store } from './useRoutine2Store'
import { ROUTINE_COLORS, ROUTINE_COLOR_OPTIONS } from '../routines/routineTypes'
import type { RoutineColor, RoutineStep } from '../routines/routineTypes'

const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const BLANK_STEP = (): RoutineStep => ({
  id: genId(),
  name: '',
  emoji: '✨',
  durationMin: 5,
  optional: false,
  scheduledDays: [],
})

/** Local editable copy of a routine. taskId null = newly created this session. */
interface EditRoutine {
  taskId: number | null
  name: string
  trigger: string
  color: RoutineColor
  steps: RoutineStep[]
}

interface RoutineGlobalEditSheetProps {
  isMobile: boolean
  onClose: () => void
}

export function RoutineGlobalEditSheet({ isMobile, onClose }: RoutineGlobalEditSheetProps) {
  const routines = useRoutine2Store((s) => s.routines)
  const loadRoutines = useRoutine2Store((s) => s.loadRoutines)
  const { saveRoutineDef, deleteRoutineDef } = useRoutineSystem()
  const deleteHabitLog = useRoutine2System((s) => s.deleteHabitLog)

  const [state, setState] = useState<EditRoutine[]>(() =>
    routines.map((r) => ({
      taskId: r.taskId,
      name: r.name,
      trigger: r.trigger,
      color: r.color,
      steps: r.steps.map((s) => ({ ...s, scheduledDays: s.scheduledDays ?? [] })),
    }))
  )
  const [deletedRoutineIds, setDeletedRoutineIds] = useState<number[]>([])
  const [deletedHabitIds, setDeletedHabitIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Routine-picker overlay state: which habit (routine index + step id) is choosing.
  const [picker, setPicker] = useState<{ routineIdx: number; stepId: string } | null>(null)
  const [newRoutineFor, setNewRoutineFor] = useState<{ routineIdx: number; stepId: string } | 'standalone' | null>(null)

  // ── Mutators on local state ──────────────────────────────────────────────
  const patchRoutine = (idx: number, patch: Partial<EditRoutine>) =>
    setState((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const patchStep = (idx: number, stepId: string, patch: Partial<RoutineStep>) =>
    setState((prev) => prev.map((r, i) =>
      i === idx ? { ...r, steps: r.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) } : r
    ))

  const addStep = (idx: number) =>
    setState((prev) => prev.map((r, i) => (i === idx ? { ...r, steps: [...r.steps, BLANK_STEP()] } : r)))

  const removeStep = (idx: number, stepId: string) => {
    setState((prev) => prev.map((r, i) =>
      i === idx ? { ...r, steps: r.steps.filter((s) => s.id !== stepId) } : r
    ))
    setDeletedHabitIds((prev) => (prev.includes(stepId) ? prev : [...prev, stepId]))
  }

  const moveStep = (idx: number, stepId: string, dir: -1 | 1) =>
    setState((prev) => prev.map((r, i) => {
      if (i !== idx) return r
      const sIdx = r.steps.findIndex((s) => s.id === stepId)
      const next = sIdx + dir
      if (sIdx < 0 || next < 0 || next >= r.steps.length) return r
      const steps = [...r.steps]
      ;[steps[sIdx], steps[next]] = [steps[next], steps[sIdx]]
      return { ...r, steps }
    }))

  /** Move a habit's step from one routine section to another (re-tag). */
  const moveHabitToRoutine = (fromIdx: number, stepId: string, toIdx: number) => {
    if (fromIdx === toIdx) return
    setState((prev) => {
      const step = prev[fromIdx]?.steps.find((s) => s.id === stepId)
      if (!step) return prev
      return prev.map((r, i) => {
        if (i === fromIdx) return { ...r, steps: r.steps.filter((s) => s.id !== stepId) }
        if (i === toIdx) return { ...r, steps: [...r.steps, step] }
        return r
      })
    })
  }

  /** Append an empty routine. */
  const addRoutine = (name: string, color: RoutineColor) =>
    setState((prev) => [...prev, { taskId: null, name: name.trim() || 'New Routine', trigger: '', color, steps: [] }])

  /** Create a new routine and move the given habit into it — one atomic update. */
  const addRoutineWithHabit = (name: string, color: RoutineColor, fromIdx: number, stepId: string) =>
    setState((prev) => {
      const step = prev[fromIdx]?.steps.find((s) => s.id === stepId)
      const stripped = prev.map((r, i) => (i === fromIdx ? { ...r, steps: r.steps.filter((s) => s.id !== stepId) } : r))
      return [
        ...stripped,
        { taskId: null, name: name.trim() || 'New Routine', trigger: '', color, steps: step ? [step] : [] },
      ]
    })

  const deleteRoutine = (idx: number) => {
    setState((prev) => {
      const r = prev[idx]
      if (r?.taskId != null) setDeletedRoutineIds((d) => [...d, r.taskId as number])
      // Habits left in this routine are removed with it.
      if (r) setDeletedHabitIds((d) => [...d, ...r.steps.map((s) => s.id).filter((id) => !d.includes(id))])
      return prev.filter((_, i) => i !== idx)
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const canSave = state.every((r) => r.name.trim().length > 0) && !saving

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const r of state) {
        await saveRoutineDef(
          {
            name: r.name.trim(),
            trigger: r.trigger.trim(),
            color: r.color,
            steps: r.steps.filter((s) => s.name.trim().length > 0),
          },
          r.taskId ?? undefined
        )
      }
      for (const id of deletedRoutineIds) await deleteRoutineDef(id)
      for (const hid of deletedHabitIds) await deleteHabitLog(hid)
      await loadRoutines()
      onClose()
    } catch (e) {
      console.warn('[RoutineGlobalEdit] save failed:', e)
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const body = (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      {state.map((routine, rIdx) => (
        <View key={routine.taskId ?? `new-${rIdx}`} style={{ gap: 10 }}>
          {/* Section header — editable routine meta */}
          <View style={{ gap: 8, borderLeftWidth: 4, borderLeftColor: ROUTINE_COLORS[routine.color], paddingLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={routine.name}
                onChangeText={(v) => patchRoutine(rIdx, { name: v })}
                placeholder="Routine name *"
                placeholderTextColor="#C4C4C4"
                maxLength={50}
                style={[input, { flex: 1, fontWeight: '700', backgroundColor: '#fff' }]}
              />
              <Pressable onPress={() => deleteRoutine(rIdx)} hitSlop={8}>
                <Trash2 size={18} color="#EF4444" />
              </Pressable>
            </View>
            <TextInput
              value={routine.trigger}
              onChangeText={(v) => patchRoutine(rIdx, { trigger: v })}
              placeholder="Trigger / anchor (optional)"
              placeholderTextColor="#C4C4C4"
              style={[input, { backgroundColor: '#fff', fontStyle: routine.trigger ? 'normal' : 'italic' }]}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {ROUTINE_COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => patchRoutine(rIdx, { color: c })}
                  style={{
                    width: 26, height: 26, borderRadius: 13, backgroundColor: ROUTINE_COLORS[c],
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: routine.color === c ? 2 : 0, borderColor: '#111',
                  }}
                >
                  {routine.color === c && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                </Pressable>
              ))}
            </View>
          </View>

          {/* Habit rows */}
          {routine.steps.map((step, sIdx) => (
            <View key={step.id} style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={step.emoji}
                  onChangeText={(v) => patchStep(rIdx, step.id, { emoji: v || '✨' })}
                  style={{ fontSize: 24, width: 40, textAlign: 'center' }}
                  maxLength={2}
                />
                <TextInput
                  value={step.name}
                  onChangeText={(v) => patchStep(rIdx, step.id, { name: v })}
                  placeholder="Habit name"
                  placeholderTextColor="#C4C4C4"
                  style={[input, { flex: 1, marginBottom: 0, backgroundColor: '#fff' }]}
                />
                <TextInput
                  value={String(step.durationMin)}
                  onChangeText={(v) => patchStep(rIdx, step.id, { durationMin: Math.max(0, parseInt(v) || 0) })}
                  keyboardType="number-pad"
                  style={[input, { width: 50, textAlign: 'center', marginBottom: 0, backgroundColor: '#fff' }]}
                />
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>min</Text>
              </View>

              {/* Day picker */}
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {DAY_LABELS.map((lbl, di) => {
                  const active = step.scheduledDays.length === 0 || step.scheduledDays.includes(di)
                  return (
                    <Pressable
                      key={di}
                      onPress={() => {
                        const cur = step.scheduledDays.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : step.scheduledDays
                        const next = cur.includes(di) ? cur.filter((d) => d !== di) : [...cur, di].sort()
                        patchStep(rIdx, step.id, { scheduledDays: next.length === 7 ? [] : next })
                      }}
                      style={{
                        flex: 1, paddingVertical: 4, borderRadius: 6,
                        backgroundColor: active ? ROUTINE_COLORS[routine.color] : '#F3F4F6',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: active ? '#fff' : '#9CA3AF' }}>{lbl}</Text>
                    </Pressable>
                  )
                })}
              </View>

              {/* Controls row: routine dropdown + optional + move/delete */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable
                  onPress={() => setPicker({ routineIdx: rIdx, stepId: step.id })}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
                    backgroundColor: '#EEF2FF',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#4338CA', maxWidth: 120 }} numberOfLines={1}>
                    {routine.name || 'Routine'}
                  </Text>
                  <Caret size={14} color="#4338CA" />
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Switch
                    value={step.optional}
                    onValueChange={(v) => patchStep(rIdx, step.id, { optional: v })}
                    trackColor={{ true: '#D1D5DB' }}
                    thumbColor="#fff"
                    style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                  />
                  <Text style={{ fontSize: 11, color: '#9CA3AF' }}>Optional</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => moveStep(rIdx, step.id, -1)} hitSlop={8} style={{ opacity: sIdx === 0 ? 0.3 : 1 }}>
                  <ChevronUp size={16} color="#6B7280" />
                </Pressable>
                <Pressable onPress={() => moveStep(rIdx, step.id, 1)} hitSlop={8} style={{ opacity: sIdx === routine.steps.length - 1 ? 0.3 : 1 }}>
                  <ChevronDown size={16} color="#6B7280" />
                </Pressable>
                <Pressable onPress={() => removeStep(rIdx, step.id)} hitSlop={8}>
                  <Trash2 size={16} color="#EF4444" />
                </Pressable>
              </View>
            </View>
          ))}

          <Pressable
            onPress={() => addStep(rIdx)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, justifyContent: 'center',
              borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, borderStyle: 'dashed',
            }}
          >
            <Plus size={15} color="#9CA3AF" />
            <Text style={{ fontSize: 13, color: '#9CA3AF' }}>Add habit</Text>
          </Pressable>
        </View>
      ))}

      {/* Add new routine */}
      <Pressable
        onPress={() => setNewRoutineFor('standalone')}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, justifyContent: 'center',
          borderWidth: 1.5, borderColor: '#C7D2FE', borderRadius: 12,
        }}
      >
        <Plus size={16} color="#4338CA" />
        <Text style={{ fontSize: 14, color: '#4338CA', fontWeight: '600' }}>New routine</Text>
      </Pressable>
    </ScrollView>
  )

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'web' ? 0 : 44 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: '#111' }}>Edit Habits</Text>
          <Pressable onPress={handleSave} disabled={!canSave} hitSlop={8} style={{ marginRight: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: canSave ? '#4338CA' : '#C4C4C4' }}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} hitSlop={8}>
            <X size={22} color="#6B7280" />
          </Pressable>
        </View>

        {body}

        {/* Routine picker overlay */}
        {picker && (
          <RoutinePickerOverlay
            routines={state}
            currentIdx={picker.routineIdx}
            onPick={(toIdx) => {
              moveHabitToRoutine(picker.routineIdx, picker.stepId, toIdx)
              setPicker(null)
            }}
            onNew={() => {
              setNewRoutineFor({ routineIdx: picker.routineIdx, stepId: picker.stepId })
              setPicker(null)
            }}
            onClose={() => setPicker(null)}
            isMobile={isMobile}
          />
        )}

        {/* New routine (quick name + color) */}
        {newRoutineFor && (
          <NewRoutineOverlay
            onCreate={(name, color) => {
              if (newRoutineFor === 'standalone') addRoutine(name, color)
              else addRoutineWithHabit(name, color, newRoutineFor.routineIdx, newRoutineFor.stepId)
              setNewRoutineFor(null)
            }}
            onClose={() => setNewRoutineFor(null)}
          />
        )}
      </View>
    </Modal>
  )
}

// ─── Routine picker overlay ────────────────────────────────────────────────────

interface RoutinePickerOverlayProps {
  routines: EditRoutine[]
  currentIdx: number
  onPick: (idx: number) => void
  onNew: () => void
  onClose: () => void
  isMobile: boolean
}

function RoutinePickerOverlay({ routines, currentIdx, onPick, onNew, onClose }: RoutinePickerOverlayProps) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: '#fff', borderRadius: 16, width: 300, maxHeight: '70%', overflow: 'hidden' }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#111', padding: 16, paddingBottom: 8 }}>Move to routine</Text>
          <ScrollView>
            {routines.map((r, i) => (
              <Pressable
                key={r.taskId ?? `new-${i}`}
                onPress={() => onPick(i)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 }}
              >
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: ROUTINE_COLORS[r.color] }} />
                <Text style={{ flex: 1, fontSize: 14, color: '#111' }} numberOfLines={1}>{r.name || 'Untitled'}</Text>
                {i === currentIdx && <Text style={{ fontSize: 14, color: '#4338CA' }}>✓</Text>}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            onPress={onNew}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}
          >
            <Plus size={16} color="#4338CA" />
            <Text style={{ fontSize: 14, color: '#4338CA', fontWeight: '600' }}>New routine</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── New routine overlay (quick name + color) ──────────────────────────────────

interface NewRoutineOverlayProps {
  onCreate: (name: string, color: RoutineColor) => void
  onClose: () => void
}

function NewRoutineOverlay({ onCreate, onClose }: NewRoutineOverlayProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<RoutineColor>('blue')
  const canCreate = name.trim().length > 0
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 16, width: 320, padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>New routine</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="Routine name"
            placeholderTextColor="#C4C4C4"
            maxLength={50}
            style={input}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {ROUTINE_COLOR_OPTIONS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={{
                  width: 30, height: 30, borderRadius: 15, backgroundColor: ROUTINE_COLORS[c],
                  alignItems: 'center', justifyContent: 'center',
                  borderWidth: color === c ? 2 : 0, borderColor: '#111',
                }}
              >
                {color === c && <Text style={{ color: '#fff', fontSize: 13 }}>✓</Text>}
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => canCreate && onCreate(name, color)}
            disabled={!canCreate}
            style={{ backgroundColor: canCreate ? ROUTINE_COLORS[color] : '#E5E7EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: canCreate ? '#fff' : '#9CA3AF', fontWeight: '700', fontSize: 15 }}>Create</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const input: object = {
  fontSize: 15, color: '#111', backgroundColor: '#F9FAFB',
  borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 0,
}
