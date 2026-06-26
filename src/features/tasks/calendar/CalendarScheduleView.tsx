import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Text, View, Pressable, Modal } from 'react-native'
import { format } from 'date-fns'
import type { Calendar } from '@fullcalendar/core'
import type { TaskNode } from '@/lib/taskTree'
import type { UpdateTaskPayload } from '@/api/types'
import { tasksToCalendarEvents, calibrateSlots } from '@/lib/calendarAdapter'
import { RefreshCw, Maximize2, Minimize2 } from 'lucide-react-native'
import { toApiDate } from '@/lib/dateUtils'
import { TIME_QUADRANTS, classifyTime, type TimeBucket } from '@/features/tasks/list/EisenhowerMatrixView'
import { classifyPriority, type PriorityBucket, BUCKET_META } from '@/features/tasks/shared/PriorityPicker'
import { useTimeSlotStore } from './useTimeSlotStore'
import { useCloseTask } from '@/features/tasks/list/useTasksQuery'
import { useToast } from '@/components/Toast'
import { colors, radii, typography } from '@/design/tokens'

export interface CalendarScheduleViewProps {
  tasks: TaskNode[]
  checklistId: number
  getEstimateMin: (task: TaskNode) => number
  jumpTo: (index: number) => void
  playTask: (index: number) => void
  updateTask: (args: { taskId: number; payload: UpdateTaskPayload }) => void
  onJumpToRaw?: (taskId: number) => void
  onJumpToMindmap?: (taskId: number) => void
  onExpand?: () => void
  searchQuery?: string
}

function minutesOf(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

const TIME_SCALE_OPTIONS = [
  { value: 60, label: '60 minutes', description: 'Least space for details' },
  { value: 30, label: '30 minutes', description: '' },
  { value: 15, label: '15 minutes', description: '' },
  { value: 10, label: '10 minutes', description: '' },
  { value: 6, label: '6 minutes', description: '' },
  { value: 5, label: '5 minutes', description: 'Most space for details' },
] as const
const ZOOM_HOST_CLASS = 'cal-zoom-host'
const BASE_SLOT_PX = 24

function applyZoomCss(timeScale: number): void {
  if (typeof document === 'undefined') return
  let style = document.getElementById('cal-zoom-css')
  if (!style) {
    style = document.createElement('style')
    style.id = 'cal-zoom-css'
    document.head.appendChild(style)
  }
  const px = BASE_SLOT_PX * (10 / timeScale)
  style.textContent =
    `.${ZOOM_HOST_CLASS} .fc-timegrid-slot { height: ${px}px !important; }` +
    `.${ZOOM_HOST_CLASS} .fc-timegrid-slot-lane { height: ${px}px !important; }`
}

export function CalendarScheduleView(props: CalendarScheduleViewProps) {
  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#666', textAlign: 'center' }}>Calendar is web-only for now.</Text>
      </View>
    )
  }
  return <CalendarWeb {...props} />
}

function CalendarWeb({
  tasks, checklistId, getEstimateMin, jumpTo, playTask, updateTask, onJumpToRaw, onJumpToMindmap, onExpand, searchQuery,
}: CalendarScheduleViewProps) {
  const { mutate: closeTask } = useCloseTask(checklistId)
  const toast = useToast()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<Calendar | null>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<TimeBucket | null>(null)
  const [selectedPriority, setSelectedPriority] = useState<PriorityBucket | null>(null)
  const [timeScale, setTimeScale] = useState(10)
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<TimeBucket | 'all'>('all')
  const [calibrating, setCalibrating] = useState(false)
  const [slotsVersion, setSlotsVersion] = useState(0) // Track slot changes for calendar rebuild

  const slots = useTimeSlotStore((s) => s.slots)
  const setSlot = useTimeSlotStore((s) => s.setSlot)

  function toggleFullScreen() {
    setFullScreen((v) => {
      const next = !v
      if (next) onExpand?.()
      return next
    })
  }
  function selectBucket(b: TimeBucket | null) {
    setSelectedBucket((prev) => (prev === b ? null : b))
  }
  function selectPriority(p: PriorityBucket | null) {
    setSelectedPriority((prev) => (prev === p ? null : p))
  }
  function selectTimeFilter(t: TimeBucket | 'all') {
    setSelectedTimeFilter((prev) => (prev === t ? 'all' : t))
  }
  function selectPriorityFilter(p: PriorityBucket | null) {
    setSelectedPriority((prev) => (prev === p ? null : p))
  }

  const filteredTasks = useMemo(() => {
    let visible = tasks
    if (selectedTimeFilter !== 'all') {
      visible = visible.filter((t) => classifyTime(t as any) === selectedTimeFilter)
    }
    if (searchQuery?.trim()) {
      const q = searchQuery.trim().toLowerCase()
      visible = visible.filter((t) => t.content.toLowerCase().includes(q))
    }
    return visible
  }, [tasks, selectedTimeFilter, searchQuery])

  const tasksRef = useRef(tasks); tasksRef.current = tasks
  const jumpToRef = useRef(jumpTo); jumpToRef.current = jumpTo
  const playTaskRef = useRef(playTask); playTaskRef.current = playTask
  const updateTaskRef = useRef(updateTask); updateTaskRef.current = updateTask
  const setSlotRef = useRef(setSlot); setSlotRef.current = setSlot
  const onJumpToRawRef = useRef(onJumpToRaw); onJumpToRawRef.current = onJumpToRaw
  const onJumpToMindmapRef = useRef(onJumpToMindmap); onJumpToMindmapRef.current = onJumpToMindmap
  const closeTaskRef = useRef(closeTask); closeTaskRef.current = closeTask
  const toastRef = useRef(toast); toastRef.current = toast

  const events = useMemo(() => {
    let visible = filteredTasks
    if (selectedBucket !== null) {
      visible = visible.filter((t) => classifyTime(t as any) === selectedBucket)
    }
    if (selectedPriority !== null) {
      visible = visible.filter((t) => classifyPriority(t.priority) === selectedPriority)
    }
    return tasksToCalendarEvents(visible, slots, getEstimateMin)
  }, [filteredTasks, slots, getEstimateMin, selectedBucket, selectedPriority])

  function persistPlacement(taskId: number, start: Date, end: Date) {
    const duration = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000))
    setSlotRef.current(taskId, {
      date: toApiDate(start),
      startMinutes: minutesOf(start),
      durationMinutes: duration,
      source: 'manual',
    })
    updateTaskRef.current({ taskId, payload: { due_date: toApiDate(start) } })
  }

  function idxOf(taskId: number): number {
    return tasksRef.current.findIndex((t) => t.id === taskId)
  }

  function buildCtaRow(taskId: number): HTMLElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:4px;align-items:center;'

    const mk = (iconSvg: string, title: string, onClick: () => void) => {
      const b = document.createElement('button')
      b.title = title
      b.style.cssText = `cursor:pointer;border:none;border-radius:${radii.sm}px;background:rgba(255,255,255,0.22);color:#fff;padding:4px;display:flex;align-items:center;justify-content:center;min-width:26px;min-height:26px;transition:background 120ms ease;`
      b.innerHTML = iconSvg
      b.onmouseenter = () => { b.style.background = 'rgba(255,255,255,0.38)' }
      b.onmouseleave = () => { b.style.background = 'rgba(255,255,255,0.22)' }
      b.onclick = (e) => { e.stopPropagation(); onClick() }
      return b
    }

    const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
    const networkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="7" y2="17"/><line x1="12" y1="12" x2="17" y2="17"/><circle cx="7" cy="20" r="3"/><circle cx="17" cy="20" r="3"/></svg>`
    const alignLeftIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>`

    // To-do checkbox — complete the task straight from the calendar (parity with the List tab).
    row.appendChild(mk(checkIcon, 'Complete', () => {
      closeTaskRef.current(taskId, {
        onSuccess: () => toastRef.current.success('Task completed'),
        onError: () => toastRef.current.error('Failed to complete task'),
      })
    }))
    row.appendChild(mk(playIcon, 'Start', () => { const i = idxOf(taskId); if (i >= 0) playTaskRef.current(i) }))
    if (onJumpToMindmapRef.current) row.appendChild(mk(networkIcon, 'Mindmap', () => onJumpToMindmapRef.current?.(taskId)))
    if (onJumpToRawRef.current) row.appendChild(mk(alignLeftIcon, 'Raw', () => onJumpToRawRef.current?.(taskId)))
    return row
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false
    let instance: Calendar | null = null

    const waitForSize = () => new Promise<void>((resolve) => {
      if (el.clientWidth > 0 && el.clientHeight > 0) return resolve()
      const ro = new ResizeObserver(() => {
        if (el.clientWidth > 0 && el.clientHeight > 0) { ro.disconnect(); resolve() }
      })
      ro.observe(el)
    })

    ;(async () => {
      await waitForSize()
      if (cancelled) return
      const [{ Calendar }, timeGridPlugin, interactionPlugin] = await Promise.all([
        import('@fullcalendar/core'),
        import('@fullcalendar/timegrid').then((m) => m.default),
        import('@fullcalendar/interaction').then((m) => m.default),
      ])
      if (cancelled) return
      applyZoomCss(timeScale)

      const now = new Date()
      instance = new Calendar(el, {
        plugins: [timeGridPlugin, interactionPlugin],
        initialView: 'timeGridDay',
        headerToolbar: false,
        slotMinTime: '06:00:00',
        slotMaxTime: '22:00:00',
        allDaySlot: false,
        nowIndicator: true,
        editable: true,
        eventResizableFromStart: true,
        height: '100%',
        slotDuration: `00:${String(timeScale).padStart(2, '0')}:00`,
        events,
        eventContent: (arg) => {
          const taskId = arg.event.extendedProps.taskId as number
          const nlp = arg.event.extendedProps.source === 'nlp'
          const bg = (arg.event.backgroundColor as string) || '#E8632A'

          const wrap = document.createElement('div')
          wrap.style.cssText = `padding:3px 6px;overflow:hidden;display:flex;align-items:center;gap:4px;min-height:26px;background:${bg};border-radius:4px;`

          const title = document.createElement('div')
          title.style.cssText = 'font-size:12px;line-height:1.3;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1;color:#fff;font-weight:500;text-shadow:0 1px 2px rgba(0,0,0,0.4);'
          title.textContent = (nlp ? '✦ ' : '') + arg.event.title
          title.title = arg.event.title

          wrap.appendChild(title)
          wrap.appendChild(buildCtaRow(taskId))
          return { domNodes: [wrap] }
        },
        eventClick: (info) => {
          const i = idxOf(info.event.extendedProps.taskId as number)
          if (i >= 0) jumpToRef.current(i)
        },
        eventDrop: (info) => {
          const taskId = info.event.extendedProps.taskId as number
          if (info.event.start && info.event.end) persistPlacement(taskId, info.event.start, info.event.end)
        },
        eventResize: (info) => {
          const taskId = info.event.extendedProps.taskId as number
          if (info.event.start && info.event.end) persistPlacement(taskId, info.event.start, info.event.end)
        },
      })
      instance.render()
      instanceRef.current = instance

      requestAnimationFrame(() => {
        try { instance?.scrollToTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`) } catch {}
      })
    })()

    return () => {
      cancelled = true
      try { instance?.destroy() } catch {}
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

   // Rebuild calendar events whenever slots change - this ensures visual updates happen
   useEffect(() => {
     const inst = instanceRef.current
     if (!inst) return

     // Always remove all events and re-add them to ensure times are fully synced
     inst.batchRendering(() => {
       for (const event of inst.getEvents()) {
         event.remove()
       }
       for (const event of events) {
         inst.addEvent(event)
       }
     })
   }, [events]) // This runs whenever slots change via events useMemo

  useEffect(() => {
    const inst = instanceRef.current
    if (!inst) return
    const id = requestAnimationFrame(() => { try { inst.updateSize() } catch {} })
    return () => cancelAnimationFrame(id)
  }, [fullScreen])

  useEffect(() => {
    applyZoomCss(timeScale)
    const inst = instanceRef.current
    if (!inst) return
    inst.setOption('slotDuration', `00:${String(timeScale).padStart(2, '0')}:00`)
    const currentHeight = inst.getOption('height')
    inst.setOption('height', '99%')
    requestAnimationFrame(() => {
      try { inst.setOption('height', currentHeight) } catch {}
    })
  }, [timeScale])

  useEffect(() => {
    if (!fullScreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); setFullScreen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullScreen])

  function calibrate() {
    // Show immediate visual feedback - disable button and show loading
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    
    // Calculate slots (this is synchronous, but we still want to show loading)
    const next = calibrateSlots(tasksRef.current, nowMin, getEstimateMin, now)
    
    // Update all slots at once for instant visible change
    for (const [taskId, slot] of Object.entries(next)) {
      setSlotRef.current(Number(taskId), slot)
    }
    
    // Increment version counter to force calendar rebuild (slots changed)
    setSlotsVersion(prev => prev + 1)
    
    // Show success toast after a brief delay to ensure UI updates
    setTimeout(() => {
      toastRef.current.success(`Tasks calibrated! ${Object.keys(next).length} tasks scheduled.`)
    }, 50)
  }

  const wrapperStyle: React.CSSProperties = fullScreen
    ? { position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', display: 'flex', flexDirection: 'column' }
    : { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', overflowX: 'hidden' }

  const btnStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6,
    padding: '3px 9px', cursor: 'pointer', fontSize: 13, color: '#374151',
  }

  const toolbarStyle: React.CSSProperties = {
    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
    flexWrap: 'wrap', padding: '8px 12px',
    borderBottom: `1px solid ${colors.border}`, background: colors.bgSecondary,
    width: '100%',
  }

  function TimeFilterDropdown() {
    const [open, setOpen] = useState(false)
    const anchorRef = useRef<View>(null)
    const [anchorPos, setAnchorPos] = useState<{ top: number; left: number }>({ top: 48, left: 12 })

    const options: { key: TimeBucket | 'all'; label: string; sublabel?: string; color: string }[] = [
      { key: 'all', label: 'All time filters', color: '#6366F1' },
      ...TIME_QUADRANTS.map((q) => ({
        key: q.bucket,
        label: q.label,
        sublabel: q.sublabel,
        color: q.color,
      })),
    ]

    const currentLabel = options.find((o) => o.key === selectedTimeFilter)?.label ?? 'All time filters'
    const currentColor = options.find((o) => o.key === selectedTimeFilter)?.color ?? '#6366F1'

    function handleOpen() {
      if (Platform.OS === 'web') {
        const domNode = (anchorRef.current as any) as HTMLElement | null
        if (domNode && typeof domNode.getBoundingClientRect === 'function') {
          const r = domNode.getBoundingClientRect()
          setAnchorPos({ top: r.bottom + 4, left: r.left })
        }
      } else {
        anchorRef.current?.measureInWindow((x: number, y: number) => {
          setAnchorPos({ top: y + 28, left: x })
        })
      }
      setOpen(true)
    }

    const menuItems = options.map((opt) => (
      <Pressable
        key={opt.key}
        onPress={() => { selectTimeFilter(opt.key); setOpen(false) }}
        style={{
          paddingHorizontal: 14, paddingVertical: 9,
          backgroundColor: selectedTimeFilter === opt.key ? '#EEF2FF' : 'transparent',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: opt.color }} />
        <View>
          <Text style={{ fontSize: 13, color: selectedTimeFilter === opt.key ? '#4772FA' : '#374151', fontWeight: selectedTimeFilter === opt.key ? '600' : '400' }}>
            {opt.label}
          </Text>
          {opt.sublabel ? (
            <Text style={{ fontSize: 11, color: selectedTimeFilter === opt.key ? '#4772FA' : '#6B7280', fontWeight: '400' }}>
              {opt.sublabel}
            </Text>
          ) : null}
        </View>
      </Pressable>
    ))

    const btnBg = selectedTimeFilter === 'all' ? '#F3F4F6' : '#EEF2FF'
    const btnColor = selectedTimeFilter === 'all' ? '#374151' : currentColor

    return (
      <View ref={anchorRef}>
        <Pressable
          onPress={handleOpen}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 10, paddingVertical: 5,
            backgroundColor: btnBg, borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: btnColor }}>{currentLabel}</Text>
          <Text style={{ fontSize: 10, color: '#6B7280' }}>▼</Text>
        </Pressable>

        <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
            <View
              style={{
                position: 'absolute',
                top: anchorPos.top,
                left: anchorPos.left,
                backgroundColor: '#fff', borderRadius: 10,
                shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, elevation: 20,
                paddingVertical: 4, minWidth: 140, zIndex: 999,
              }}
            >
              {menuItems}
            </View>
          </Pressable>
        </Modal>
      </View>
    )
  }

  function PriorityFilterDropdown({ onSelect, selected }: { onSelect: (p: PriorityBucket | null) => void, selected: PriorityBucket | null }) {
    const [open, setOpen] = useState(false)
    const anchorRef = useRef<View>(null)
    const [anchorPos, setAnchorPos] = useState<{ top: number; left: number }>({ top: 48, left: 12 })

    const options: { key: PriorityBucket | null; label: string; sublabel?: string; color: string }[] = [
      { key: null, label: 'All priorities', color: '#6366F1' },
      ...Object.entries(BUCKET_META).map(([key, meta]) => ({
        key: key as PriorityBucket,
        label: meta.label,
        sublabel: meta.sublabel,
        color: meta.color,
      })),
    ]

    const current = options.find((o) => o.key === selected) ?? options[0]
    const currentLabel2 = options.find((o) => o.key === selected)?.label ?? 'All priorities'
    const currentColor2 = options.find((o) => o.key === selected)?.color ?? '#6366F1'

    function handleOpen() {
      if (Platform.OS === 'web') {
        const domNode = (anchorRef.current as any) as HTMLElement | null
        if (domNode && typeof domNode.getBoundingClientRect === 'function') {
          const r = domNode.getBoundingClientRect()
          setAnchorPos({ top: r.bottom + 4, left: r.left })
        }
      } else {
        anchorRef.current?.measureInWindow((x: number, y: number) => {
          setAnchorPos({ top: y + 28, left: x })
        })
      }
      setOpen(true)
    }

    const menuItems = options.map((opt) => (
      <Pressable
        key={opt.key ?? 'all'}
        onPress={() => { onSelect(opt.key as PriorityBucket | null); setOpen(false) }}
        style={{
          paddingHorizontal: 14, paddingVertical: 9,
          backgroundColor: selected === opt.key ? '#EEF2FF' : 'transparent',
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: opt.color }} />
        <View>
          <Text style={{ fontSize: 13, color: selected === opt.key ? '#4772FA' : '#374151', fontWeight: selected === opt.key ? '600' : '400' }}>
            {opt.label}
          </Text>
          {opt.sublabel ? (
            <Text style={{ fontSize: 11, color: selected === opt.key ? '#4772FA' : '#6B7280', fontWeight: '400' }}>
              {opt.sublabel}
            </Text>
          ) : null}
        </View>
      </Pressable>
    ))

    const btnBg = selected ? '#EEF2FF' : '#F3F4F6'
    const btnColor = selected ? currentColor2 : '#374151'

    return (
      <View ref={anchorRef}>
        <Pressable
          onPress={handleOpen}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 10, paddingVertical: 5,
            backgroundColor: btnBg, borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: btnColor }}>{currentLabel2}</Text>
          <Text style={{ fontSize: 10, color: '#6B7280' }}>▼</Text>
        </Pressable>

        <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
            <View
              style={{
                position: 'absolute',
                top: anchorPos.top,
                left: anchorPos.left,
                backgroundColor: '#fff', borderRadius: 10,
                shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, elevation: 20,
                paddingVertical: 4, minWidth: 150, zIndex: 999,
              }}
            >
              {menuItems}
            </View>
          </Pressable>
        </Modal>
      </View>
    )
  }

  return (
    <div style={wrapperStyle}>
      <div style={{ ...toolbarStyle, flexWrap: 'wrap', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '600', marginRight: 2 }}>Time</Text>
          {([
            { key: 'all' as const, label: 'All time filters', color: '#6366F1' },
            ...TIME_QUADRANTS.map((q) => ({ key: q.bucket, label: q.label, color: q.color })),
          ]).map((opt) => {
            const active = selectedTimeFilter === opt.key
            return (
              <Pressable
                key={opt.key}
                onPress={() => selectTimeFilter(opt.key)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: active ? opt.color : '#F3F4F6',
                  borderWidth: active ? 0 : 1,
                  borderColor: active ? 'transparent' : '#E5E7EB',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: active ? '#fff' : opt.color }} />
                <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#fff' : '#374151' }}>
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <View style={{ width: 1, height: 18, backgroundColor: '#E5E7EB', marginHorizontal: 4 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Text style={{ fontSize: 11, color: '#6B7280', fontWeight: '600', marginRight: 2 }}>Priority</Text>
          {([
            { key: null as any, label: 'All priorities', color: '#6366F1' },
            ...Object.entries(BUCKET_META).map(([key, meta]) => ({ key, label: meta.label, color: meta.color })),
          ]).map((opt) => {
            const active = selectedPriority === opt.key
            const color = opt.color ?? '#6366F1'
            return (
              <Pressable
                key={String(opt.key)}
                onPress={() => selectPriorityFilter(opt.key === null ? null : (opt.key as PriorityBucket))}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: active ? color : '#F3F4F6',
                  borderWidth: active ? 0 : 1,
                  borderColor: active ? 'transparent' : '#E5E7EB',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: active ? '#fff' : color }} />
                <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#fff' : '#374151' }}>
                  {opt.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 'auto' }}>
          <Pressable
            disabled={calibrating}
            onPress={() => {
              setCalibrating(true)
              calibrate()
              // Reset loading state after brief delay
              setTimeout(() => setCalibrating(false), 500)
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: calibrating ? '#E0E7FF' : '#EEF2FF',
              borderWidth: 1, borderColor: calibrating ? '#A5B4FC' : '#C7D2FE',
              opacity: calibrating ? 0.7 : 1,
            }}
          >
            {/* Refresh icon - shows spinning when calibrating */}
            {calibrating ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
            ) : (
              <RefreshCw size={14} color="#6366F1" />
            )}
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#6366F1' }}>
              {calibrating ? 'Calibrating...' : 'Calibrate'}
            </Text>
          </Pressable>
          <Pressable
            onPress={toggleFullScreen}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB',
            }}
          >
            {fullScreen ? <Minimize2 size={14} color="#6B7280" /> : <Maximize2 size={14} color="#6B7280" />}
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280' }}>{fullScreen ? 'Exit' : 'Fullscreen'}</Text>
          </Pressable>
        </View>
      </div>
      <div style={{ flex: 1, minHeight: 0, width: '100%', position: 'relative' }}>
        <div ref={containerRef} className={`${ZOOM_HOST_CLASS} cal-inner-container`} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
      </div>
    </div>
  )
}

function FilterPillGroup({ label, options, allSelected, onClearAll }: {
  label: string
  options: { key: string; label: string; color: string; selected: boolean; onClick: () => void }[]
  allSelected: boolean
  onClearAll: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={label}>
      <button
        onClick={onClearAll}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 11, lineHeight: '16px',
          border: 'none', background: 'transparent', cursor: 'pointer', padding: '3px 6px',
          color: allSelected ? colors.primary : colors.textSecondary,
          fontWeight: allSelected ? '600' : '400', borderRadius: radii.sm,
        }}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={opt.onClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, lineHeight: '16px',
            border: `1px solid ${opt.selected ? colors.border : 'transparent'}`,
            background: opt.selected ? colors.bgPrimary : colors.bgTertiary,
            cursor: 'pointer', padding: '3px 8px',
            color: opt.selected ? colors.textPrimary : colors.textSecondary,
            fontWeight: opt.selected ? '600' : '400', borderRadius: radii.pill,
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: opt.selected ? opt.color : colors.textTertiary,
          }} />
          {opt.label}
        </button>
      ))}
    </div>
  )
}
