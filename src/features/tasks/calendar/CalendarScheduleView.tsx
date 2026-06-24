import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import { format } from 'date-fns'
import type { Calendar } from '@fullcalendar/core'
import type { TaskNode } from '@/lib/taskTree'
import type { UpdateTaskPayload } from '@/api/types'
import { tasksToCalendarEvents, calibrateSlots } from '@/lib/calendarAdapter'
import { toApiDate } from '@/lib/dateUtils'
import { TIME_QUADRANTS, classifyTime, type TimeBucket } from '@/features/tasks/list/EisenhowerMatrixView'
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

const ZOOM_LEVELS = [1, 2, 4, 8] as const
const ZOOM_HOST_CLASS = 'cal-zoom-host'
/** Height (px) of one 30-min slot at 1x. Scaled by the zoom level. */
const BASE_SLOT_PX = 24

/**
 * Force the time-grid row height via injected CSS. This is the supported way to "zoom" a
 * FullCalendar timeGrid — overriding `.fc-timegrid-slot` height with `!important` makes the
 * rows (and therefore the events) taller; the grid's own scroller handles overflow.
 */
function applyZoomCss(zoom: number): void {
  if (typeof document === 'undefined') return
  let style = document.getElementById('cal-zoom-css')
  if (!style) {
    style = document.createElement('style')
    style.id = 'cal-zoom-css'
    document.head.appendChild(style)
  }
  const px = BASE_SLOT_PX * zoom
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
  const [hiddenBuckets, setHiddenBuckets] = useState<Set<TimeBucket>>(new Set())
  const [zoom, setZoom] = useState(1)

  const slots = useTimeSlotStore((s) => s.slots)
  const setSlot = useTimeSlotStore((s) => s.setSlot)

  function toggleFullScreen() {
    setFullScreen((v) => {
      const next = !v
      if (next) onExpand?.()
      return next
    })
  }
  function toggleBucket(b: TimeBucket) {
    setHiddenBuckets((prev) => {
      const s = new Set(prev)
      s.has(b) ? s.delete(b) : s.add(b)
      return s
    })
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
    const visible = tasks.filter((t) => !hiddenBuckets.has(classifyTime(t)))
    return tasksToCalendarEvents(visible, slots, getEstimateMin)
  }, [tasks, slots, getEstimateMin, hiddenBuckets])

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
    row.style.cssText = 'display:flex;gap:3px;margin-top:2px;'
    const mk = (label: string, title: string, onClick: () => void) => {
      const b = document.createElement('button')
      b.textContent = label
      b.title = title
      b.style.cssText = 'cursor:pointer;border:none;border-radius:4px;background:rgba(255,255,255,0.25);color:#fff;font-size:11px;line-height:1;padding:2px 5px;'
      b.onclick = (e) => { e.stopPropagation(); onClick() }
      return b
    }
    row.appendChild(mk('▶', 'Start', () => { const i = idxOf(taskId); if (i >= 0) playTaskRef.current(i) }))
    if (onJumpToMindmapRef.current) row.appendChild(mk('⧉', 'Mindmap', () => onJumpToMindmapRef.current?.(taskId)))
    if (onJumpToRawRef.current) row.appendChild(mk('≡', 'Raw', () => onJumpToRawRef.current?.(taskId)))
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
      applyZoomCss(zoom)
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
        slotDuration: '00:30:00',
        events,
        eventContent: (arg) => {
          const taskId = arg.event.extendedProps.taskId as number
          const nlp = arg.event.extendedProps.source === 'nlp'
          const wrap = document.createElement('div')
          wrap.style.cssText = 'padding:1px 4px;overflow:hidden;'
          const title = document.createElement('div')
          title.style.cssText = 'font-size:11px;line-height:1.3;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;'
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
    })()
    return () => {
      cancelled = true
      try { instance?.destroy() } catch {}
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-feed events when tasks/slots change.
  useEffect(() => {
    const inst = instanceRef.current
    if (!inst) return
    inst.batchRendering(() => {
      inst.removeAllEvents()
      for (const e of events) inst.addEvent(e)
    })
  }, [events])

  // Recompute size after the fullscreen layout flips.
  useEffect(() => {
    const inst = instanceRef.current
    if (!inst) return
    const id = requestAnimationFrame(() => { try { inst.updateSize() } catch {} })
    return () => cancelAnimationFrame(id)
  }, [fullScreen])

  // Scale row height on zoom change.
  useEffect(() => {
    applyZoomCss(zoom)
    const inst = instanceRef.current
    if (!inst) return
    const id = requestAnimationFrame(() => { try { inst.updateSize() } catch {} })
    return () => cancelAnimationFrame(id)
  }, [zoom])

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
        {/* Duration-bucket legend — same colors as By Time; click toggles a filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {TIME_QUADRANTS.map((q) => {
            const hidden = hiddenBuckets.has(q.bucket)
            return (
              <button
                key={q.bucket}
                onClick={() => toggleBucket(q.bucket)}
                title={hidden ? `Show ${q.label}` : `Hide ${q.label}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3, fontSize: 11,
                  border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                  color: hidden ? '#C4C4C4' : '#6B7280',
                  textDecoration: hidden ? 'line-through' : 'none',
                }}
              >
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: hidden ? '#D1D5DB' : q.color }} />
                {q.label}
              </button>
            )
          })}
        </div>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>✦ NLP</span>
        <div style={{ flex: 1 }} />
        {/* Zoom: taller hour rows so dense days stay readable */}
        <div style={{ display: 'flex', border: '1px solid #D1D5DB', borderRadius: 6, overflow: 'hidden' }}>
          {ZOOM_LEVELS.map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              title={`${z}× row height`}
              style={{
                border: 'none', cursor: 'pointer', fontSize: 12, padding: '3px 8px',
                background: zoom === z ? '#6366F1' : '#fff',
                color: zoom === z ? '#fff' : '#374151',
              }}
            >
              {z}×
            </button>
          ))}
        </div>
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
