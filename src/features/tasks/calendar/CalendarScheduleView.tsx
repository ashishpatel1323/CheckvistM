import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { format } from 'date-fns'
import type { Calendar } from '@fullcalendar/core'
import type { TaskNode } from '@/lib/taskTree'
import type { UpdateTaskPayload } from '@/api/types'
import { tasksToCalendarEvents, calibrateSlots } from '@/lib/calendarAdapter'
import { toApiDate } from '@/lib/dateUtils'
import { TIME_QUADRANTS, classifyTime, type TimeBucket } from '@/features/tasks/list/EisenhowerMatrixView'
import { classifyPriority, type PriorityBucket, BUCKET_META } from '@/features/tasks/shared/PriorityPicker'
import { useTimeSlotStore } from './useTimeSlotStore'

export interface CalendarScheduleViewProps {
  /** Today's open tasks, in Execute order (used for index → playTask/jumpTo). */
  tasks: TaskNode[]
  checklistId: number
  /** Per-task Execute estimate in minutes (block duration fallback). */
  getEstimateMin: (task: TaskNode) => number
  /** Select a task in the Execute timer by index (no start). */
  jumpTo: (index: number) => void
  /** Start the timer for a task by index (mirrors row Play button). */
  playTask: (index: number) => void
  updateTask: (args: { taskId: number; payload: UpdateTaskPayload }) => void
  onJumpToRaw?: (taskId: number) => void
  onJumpToMindmap?: (taskId: number) => void
  /** Called when the user expands to full screen — closes the Execute right panel. */
  onExpand?: () => void
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
  { value: 5, label: '5 minutes', description: 'Most space for details' }
] as const
const ZOOM_HOST_CLASS = 'cal-zoom-host'
/** Height (px) of one 30-min slot at 10-minute scale. Scaled by the time scale. */
const BASE_SLOT_PX = 24

/**
 * Force the time-grid row height via injected CSS. This is the supported way to "zoom" a
 * FullCalendar timeGrid — overriding `.fc-timegrid-slot` height with `!important` makes the
 * rows (and therefore the events) taller; the grid's own scroller handles overflow.
 */
function applyZoomCss(timeScale: number): void {
  if (typeof document === 'undefined') return
  let style = document.getElementById('cal-zoom-css')
  if (!style) {
    style = document.createElement('style')
    style.id = 'cal-zoom-css'
    document.head.appendChild(style)
  }
  // Calculate pixel height: at 10-minute scale, 30-min slot is BASE_SLOT_PX
  // Scale inversely: smaller timeScale = taller slots
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
  tasks, getEstimateMin, jumpTo, playTask, updateTask, onJumpToRaw, onJumpToMindmap, onExpand,
}: CalendarScheduleViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<Calendar | null>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [selectedBucket, setSelectedBucket] = useState<TimeBucket | null>(null)
  const [selectedPriority, setSelectedPriority] = useState<PriorityBucket | null>(null)
  const [timeScale, setTimeScale] = useState(10)

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

  // Latest props for handlers captured at calendar init (closures).
  const tasksRef = useRef(tasks); tasksRef.current = tasks
  const jumpToRef = useRef(jumpTo); jumpToRef.current = jumpTo
  const playTaskRef = useRef(playTask); playTaskRef.current = playTask
  const updateTaskRef = useRef(updateTask); updateTaskRef.current = updateTask
  const setSlotRef = useRef(setSlot); setSlotRef.current = setSlot
  const onJumpToRawRef = useRef(onJumpToRaw); onJumpToRawRef.current = onJumpToRaw
  const onJumpToMindmapRef = useRef(onJumpToMindmap); onJumpToMindmapRef.current = onJumpToMindmap

  const events = useMemo(() => {
    let visible = tasks
    if (selectedBucket !== null) {
      visible = visible.filter((t) => classifyTime(t) === selectedBucket)
    }
    if (selectedPriority !== null) {
      visible = visible.filter((t) => classifyPriority(t.priority) === selectedPriority)
    }
    return tasksToCalendarEvents(visible, slots, getEstimateMin)
  }, [tasks, slots, getEstimateMin, selectedBucket, selectedPriority])
  const eventsRef = useRef(events)
  eventsRef.current = events

  function persistPlacement(taskId: number, start: Date, end: Date) {
    const duration = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000))
    setSlotRef.current(taskId, {
      date: toApiDate(start),
      startMinutes: minutesOf(start),
      durationMinutes: duration,
      source: 'manual',
    })
    // Keep the day-level due date synced to Checkvist; time-of-day stays local.
    updateTaskRef.current({ taskId, payload: { due_date: toApiDate(start) } })
  }

  function idxOf(taskId: number): number {
    return tasksRef.current.findIndex((t) => t.id === taskId)
  }

  // Builds the small CTA buttons appended to each event (FullCalendar eventContent is DOM).
  function buildCtaRow(taskId: number): HTMLElement {
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:4px;align-items:center;'
    
    const mk = (iconSvg: string, title: string, onClick: () => void) => {
      const b = document.createElement('button')
      b.title = title
      b.style.cssText = 'cursor:pointer;border:none;border-radius:4px;background:rgba(255,255,255,0.25);color:#fff;padding:4px;display:flex;align-items:center;justify-content:center;min-width:24px;min-height:24px;'
      b.innerHTML = iconSvg
      b.onclick = (e) => { e.stopPropagation(); onClick() }
      return b
    }
    
    // Play icon (lucide Play)
    const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
    // Network icon (lucide Network for Mindmap)
    const networkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="7" y2="17"/><line x1="12" y1="12" x2="17" y2="17"/><circle cx="7" cy="20" r="3"/><circle cx="17" cy="20" r="3"/></svg>`
    // AlignLeft icon (lucide AlignLeft for Raw)
    const alignLeftIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>`
    
    row.appendChild(mk(playIcon, 'Start', () => { const i = idxOf(taskId); if (i >= 0) playTaskRef.current(i) }))
    if (onJumpToMindmapRef.current) row.appendChild(mk(networkIcon, 'Mindmap', () => onJumpToMindmapRef.current?.(taskId)))
    if (onJumpToRawRef.current) row.appendChild(mk(alignLeftIcon, 'Raw', () => onJumpToRawRef.current?.(taskId)))
    return row
  }

  // Init once on mount, deferred until the container has nonzero size.
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    let instance: Calendar | null = null
    const el = containerRef.current
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
      instance = new Calendar(el, {
        plugins: [timeGridPlugin, interactionPlugin],
        initialView: 'timeGridDay',
        headerToolbar: false,
        slotMinTime: '04:00:00',
        slotMaxTime: '22:00:00',
        allDaySlot: false,
        nowIndicator: true,
        editable: true,
        eventResizableFromStart: true,
        // Fill the pane; row height (zoom) is forced via injected CSS on .fc-timegrid-slot.
        height: '100%',
        expandRows: true,
        slotDuration: `00:${String(timeScale).padStart(2, '0')}:00`,
        events,
        eventContent: (arg) => {
          const taskId = arg.event.extendedProps.taskId as number
          const nlp = arg.event.extendedProps.source === 'nlp'
          const wrap = document.createElement('div')
          wrap.style.cssText = 'padding:4px 6px;overflow:hidden;display:flex;align-items:center;gap:6px;min-height:44px;'
          
          const ctaRow = buildCtaRow(taskId)
          wrap.appendChild(ctaRow)
          
          const title = document.createElement('div')
          title.style.cssText = 'font-size:11px;line-height:1.3;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1;background-color:rgba(0,0,0,0.6);padding:2px 6px;border-radius:3px;color:#fff;'
          title.textContent = (nlp ? '✦ ' : '') + arg.event.title
          title.title = arg.event.title
          
          wrap.appendChild(title)
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
    })()
    return () => {
      cancelled = true
      try { instance?.destroy() } catch {}
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update events when tasks/slots change using mutation APIs to preserve handlers
  useEffect(() => {
    const inst = instanceRef.current
    if (!inst) return
    
    // Get current events in calendar
    const currentEvents = inst.getEvents()
    const currentTaskIds = new Set(currentEvents.map((e: any) => e.extendedProps?.taskId))
    const newTaskIds = new Set(events.map((e: any) => e.extendedProps?.taskId))
    
    inst.batchRendering(() => {
      // Remove events that are no longer in the new list
      for (const event of currentEvents) {
        if (!newTaskIds.has(event.extendedProps?.taskId)) {
          event.remove()
        }
      }
      // Add new events that aren't in the current list
      for (const event of events) {
        if (!currentTaskIds.has(event.extendedProps?.taskId)) {
          inst.addEvent(event)
        }
      }
    })
  }, [events])

  // Recompute size after the fullscreen layout flips.
  useEffect(() => {
    const inst = instanceRef.current
    if (!inst) return
    const id = requestAnimationFrame(() => { try { inst.updateSize() } catch {} })
    return () => cancelAnimationFrame(id)
  }, [fullScreen])

  // Scale row height on time scale change.
  useEffect(() => {
    applyZoomCss(timeScale)
    const inst = instanceRef.current
    if (!inst) return
    // Update slotDuration to match timeScale
    inst.setOption('slotDuration', `00:${String(timeScale).padStart(2, '0')}:00`)
    // Trigger a re-render by toggling a harmless option
    const currentHeight = inst.getOption('height')
    inst.setOption('height', '99%')
    requestAnimationFrame(() => {
      try {
        inst.setOption('height', currentHeight)
      } catch {}
    })
  }, [timeScale])

  // Esc exits fullscreen.
  useEffect(() => {
    if (!fullScreen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); setFullScreen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullScreen])

  function calibrate() {
    const now = new Date()
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const next = calibrateSlots(tasksRef.current, nowMin, getEstimateMin, now)
    for (const [taskId, slot] of Object.entries(next)) setSlotRef.current(Number(taskId), slot)
  }

  const wrapperStyle: React.CSSProperties = fullScreen
    ? { position: 'fixed', inset: 0, zIndex: 1000, background: '#fff', display: 'flex', flexDirection: 'column' }
    : { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', height: '100%' }

  const btnStyle: React.CSSProperties = {
    background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6,
    padding: '3px 9px', cursor: 'pointer', fontSize: 13, color: '#374151',
  }

  return (
    <div style={wrapperStyle}>
      <div style={{
        flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '6px 12px', borderBottom: '1px solid #E5E7EB', background: '#FAFAFA',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
          {format(new Date(), 'EEEE, MMM d')}
        </span>
        {/* Duration-bucket legend — same colors as By Time; click to filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { selectBucket(null); selectPriority(null) }}
            title="Show all items"
            style={{
              display: 'flex', alignItems: 'center', gap: 3, fontSize: 11,
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
              color: selectedBucket === null && selectedPriority === null ? '#4772FA' : '#6B7280',
              fontWeight: selectedBucket === null && selectedPriority === null ? '600' : '400',
            }}
          >
            All
          </button>
          {TIME_QUADRANTS.map((q) => {
            const selected = selectedBucket === q.bucket
            return (
              <button
                key={q.bucket}
                onClick={() => selectBucket(q.bucket)}
                title={`Show only ${q.label}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3, fontSize: 11,
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  color: selected ? '#4772FA' : '#6B7280',
                  fontWeight: selected ? '600' : '400',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: selected ? q.color : '#D1D5DB' }} />
                {q.label}
              </button>
            )
          })}
        </div>
        {/* Priority filter buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(Object.keys(BUCKET_META) as PriorityBucket[]).map((bucket) => {
            const meta = BUCKET_META[bucket]
            const selected = selectedPriority === bucket
            return (
              <button
                key={bucket}
                onClick={() => selectPriority(bucket)}
                title={`Show only ${meta.label} priority`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3, fontSize: 11,
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  color: selected ? '#4772FA' : '#6B7280',
                  fontWeight: selected ? '600' : '400',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: selected ? meta.color : '#D1D5DB' }} />
                {meta.label}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>✦ NLP</span>
        <div style={{ flex: 1 }} />
        {/* Time scale: Outlook-style selector for slot height */}
        <select
          value={timeScale}
          onChange={(e) => setTimeScale(Number(e.target.value))}
          style={{
            border: '1px solid #D1D5DB',
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 12,
            cursor: 'pointer',
            background: '#fff',
            color: '#374151',
          }}
        >
          {TIME_SCALE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}{opt.description ? ` - ${opt.description}` : ''}
            </option>
          ))}
        </select>
        <button onClick={calibrate} title="Spread tasks from now to 10 PM" style={btnStyle}>
          ⟳ Calibrate
        </button>
        <button
          onClick={toggleFullScreen}
          title={fullScreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          style={btnStyle}
        >
          {fullScreen ? '⤡ Exit' : '⤢ Full screen'}
        </button>
      </div>
      <div ref={containerRef} className={ZOOM_HOST_CLASS} style={{ flex: '1 1 auto', minHeight: 0, width: '100%', overflow: 'hidden' }} />
    </div>
  )
}
