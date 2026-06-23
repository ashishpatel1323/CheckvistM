import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Text, View } from 'react-native'
import type { CheckvistTask } from '@/api/types'
import { tasksToMindElixir } from '@/lib/mindElixirAdapter'
import { buildTaskTree } from '@/lib/taskTree'
import { stripMarkdown } from '@/components/InlineMarkdown'
import { useMindMapSync } from './useMindMapSync'
import { mindElixirCss } from './mindElixirCss'

function ensureMindElixirCss(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return
  if (document.getElementById('mind-elixir-css-inline')) return
  const style = document.createElement('style')
  style.id = 'mind-elixir-css-inline'
  style.textContent = mindElixirCss
  document.head.appendChild(style)
}

export interface MindElixirViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  /** If set, mindmap is rooted at this task's subtree. */
  rootTaskId?: number | null
  /** Optional virtual-root label when rootTaskId is null. */
  rootLabel?: string
  focusedId?: number | null
  setFocusedId?: (id: number | null) => void
  /** Optional banner / toolbar rendered above the canvas. */
  timerBar?: React.ReactNode
}

export function MindElixirView(props: MindElixirViewProps) {
  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: '#666', textAlign: 'center' }}>
          Mindmap view is web-only for now.
        </Text>
      </View>
    )
  }
  return <MindElixirWeb {...props} />
}

const SHORTCUTS: { key: string; desc: string }[] = [
  { key: 'Tab', desc: 'Add child' },
  { key: 'Enter', desc: 'Add sibling' },
  { key: 'F2 / Space', desc: 'Edit node' },
  { key: 'Del / Backspace', desc: 'Delete node' },
  { key: 'Arrows', desc: 'Navigate' },
  { key: 'Ctrl/Cmd+Z / Y', desc: 'Undo / Redo' },
  { key: 'Ctrl/Cmd+C / V / X', desc: 'Copy / Paste / Cut subtree' },
  { key: 'PageUp / PageDown', desc: 'Reorder' },
  { key: 'F', desc: 'Drill into selected' },
  { key: 'Esc', desc: 'Drill back / Exit' },
  { key: 'E', desc: 'Toggle expand/collapse selected' },
  { key: 'Shift+E', desc: 'Toggle expand/collapse subtree (all descendants)' },
]

const drillStorageKey = (checklistId: number, paneKey: string) =>
  `mindmap.drill.${checklistId}.${paneKey}`

function MindElixirWeb({
  tasks, checklistId, rootTaskId, rootLabel, focusedId, setFocusedId, timerBar,
}: MindElixirViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<any>(null)
  const { handle, pendingRef } = useMindMapSync(checklistId)

  // Drill stack overrides external rootTaskId once user drills in.
  const paneKey = rootTaskId != null ? `pane-${rootTaskId}` : 'main'
  const [drillStack, setDrillStack] = useState<number[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem(drillStorageKey(checklistId, paneKey))
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((n: unknown) => typeof n === 'number') : []
    } catch { return [] }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(
        drillStorageKey(checklistId, paneKey),
        JSON.stringify(drillStack),
      )
    } catch {}
  }, [drillStack, checklistId, paneKey])

  const effectiveRootId = drillStack.length > 0
    ? drillStack[drillStack.length - 1]
    : (rootTaskId ?? null)

  // Breadcrumb labels
  const taskTitleById = useMemo(() => {
    const { getById } = buildTaskTree(tasks)
    return (id: number) => {
      const t = getById(id)
      return t ? (stripMarkdown(t.content) || '(empty)') : `#${id}`
    }
  }, [tasks])

  const [showShortcuts, setShowShortcuts] = useState(false)

  // Refs for callbacks consumed by mind-elixir contextMenu (closures captured at init).
  const drillIntoRef = useRef<() => void>(() => {})
  const toggleExpandRef = useRef<(all: boolean) => void>(() => {})

  // Init once on mount, deferred until container has nonzero size
  useEffect(() => {
    ensureMindElixirCss()
    if (!containerRef.current) return
    let cancelled = false
    let instance: any = null
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
      const mod = await import('mind-elixir')
      if (cancelled) return
      const MindElixir = mod.default
      instance = new MindElixir({
        el,
        direction: MindElixir.SIDE,
        editable: true,
        contextMenu: {
          focus: true,
          link: true,
          extend: [
            {
              name: 'Toggle expand/collapse',
              key: 'E',
              onclick: () => toggleExpandRef.current(false),
            },
            {
              name: 'Toggle expand/collapse subtree',
              key: 'Shift+E',
              onclick: () => toggleExpandRef.current(true),
            },
            {
              name: 'Drill into',
              key: 'F',
              onclick: () => drillIntoRef.current(),
            },
          ],
        },
        toolBar: true,
        keypress: true,
        draggable: true,
        allowUndo: true,
      } as any)
      const initialData = tasksToMindElixir(tasks, {
        rootTaskId: effectiveRootId,
        virtualRootLabel: rootLabel,
        collapseChildren: effectiveRootId != null,
      })
      instance.init(initialData)
      instance.bus.addListener('operation', (op: any) => {
        handle(op, () => instance?.nodeData)
      })
      if (setFocusedId) {
        instance.bus.addListener('selectNewNode', (n: any) => {
          const id = Number(n?.id)
          if (Number.isFinite(id)) setFocusedId(id)
        })
      }
      instanceRef.current = instance
    })()
    return () => {
      cancelled = true
      try { instance?.destroy?.() } catch {}
      instanceRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh data when tasks/effectiveRootId change AND no local op is in-flight.
  useEffect(() => {
    if (!instanceRef.current) return
    if (pendingRef.current > 0) return
    const data = tasksToMindElixir(tasks, {
      rootTaskId: effectiveRootId,
      virtualRootLabel: rootLabel,
      collapseChildren: effectiveRootId != null,
    })
    try {
      instanceRef.current.refresh(data)
      instanceRef.current.clearHistory?.()
    } catch (e) {
      console.warn('[MindElixirView] refresh failed', e)
    }
  }, [tasks, effectiveRootId, rootLabel, pendingRef])

  // External focus sync
  useEffect(() => {
    const inst = instanceRef.current
    if (!inst || focusedId == null) return
    try {
      const tpc = inst.findEle?.(String(focusedId))
      if (tpc) inst.selectNode(tpc)
    } catch {}
  }, [focusedId])

  const drillIntoSelected = useCallback(() => {
    const inst = instanceRef.current
    if (!inst) return
    const cur = inst.currentNode
    const id = Number(cur?.nodeObj?.id)
    if (!Number.isFinite(id)) return
    setDrillStack((s) => [...s, id])
  }, [])

  const drillBack = useCallback(() => {
    setDrillStack((s) => (s.length > 0 ? s.slice(0, -1) : s))
  }, [])

  // keep refs current
  useEffect(() => { drillIntoRef.current = () => drillIntoSelected() })
  const toggleExpand = useCallback((all: boolean) => {
    const inst = instanceRef.current
    if (!inst) return
    const cur = inst.currentNode
    if (!cur) return
    const isExpanded = cur.nodeObj?.expanded !== false
    try {
      if (all) inst.expandNodeAll(cur, !isExpanded)
      else inst.expandNode(cur, !isExpanded)
    } catch (e) { console.warn('[MindElixir] expand toggle failed', e) }
  }, [])
  useEffect(() => { toggleExpandRef.current = (all: boolean) => toggleExpand(all) })

  // Custom keypress: F drill in, Esc drill back
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName
      const editable = (e.target as HTMLElement | null)?.isContentEditable
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return
      if (!containerRef.current) return
      // Only act when mindmap container is visible
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        drillIntoSelected()
      } else if (e.key === 'Escape' && drillStack.length > 0) {
        e.preventDefault()
        drillBack()
      } else if (e.key.toLowerCase() === 'e' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        toggleExpand(e.shiftKey)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drillIntoSelected, drillBack, toggleExpand, drillStack.length])

  const breadcrumb = useMemo(() => {
    if (drillStack.length === 0) return null
    return drillStack.map((id, i) => ({
      id,
      label: taskTitleById(id),
      isLast: i === drillStack.length - 1,
    }))
  }, [drillStack, taskTitleById])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 400, width: '100%', height: '100%', position: 'relative' }}>
      {timerBar ? <div style={{ flex: '0 0 auto' }}>{timerBar}</div> : null}

      {/* Breadcrumb */}
      {breadcrumb && (
        <div style={{
          flex: '0 0 auto',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px',
          background: '#F9FAFB',
          borderBottom: '1px solid #E5E7EB',
          fontSize: 12, color: '#374151',
          overflowX: 'auto',
        }}>
          <button
            onClick={drillBack}
            style={{
              background: '#fff', border: '1px solid #D1D5DB', borderRadius: 4,
              padding: '2px 8px', cursor: 'pointer', fontSize: 12,
            }}
            title="Drill back (Esc)"
          >← Back</button>
          <span style={{ color: '#9CA3AF' }}>Drill:</span>
          {breadcrumb.map((b, i) => (
            <React.Fragment key={b.id}>
              {i > 0 && <span style={{ color: '#9CA3AF' }}>›</span>}
              <span style={{ fontWeight: b.isLast ? 600 : 400, whiteSpace: 'nowrap' }}>
                {b.label.length > 40 ? b.label.slice(0, 40) + '…' : b.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        style={{ flex: '1 1 auto', minHeight: 0, width: '100%', overflow: 'hidden' }}
      />

      {/* Floating toolbar (top-right) */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 10,
        display: 'flex', gap: 6,
      }}>
        <ToolbarButton
          title="Drill into selected (F)"
          onClick={drillIntoSelected}
          bg="#EEF2FF" color="#4F46E5"
        >⊕</ToolbarButton>
        <ToolbarButton
          title="Drill back (Esc)"
          onClick={drillBack}
          bg="#F3F4F6" color="#374151"
          disabled={drillStack.length === 0}
        >⊖</ToolbarButton>
        <ToolbarButton
          title="Keyboard shortcuts"
          onClick={() => setShowShortcuts(true)}
          bg="#FEF3C7" color="#B45309"
        >?</ToolbarButton>
      </div>

      {/* Shortcuts modal */}
      {showShortcuts && (
        <div
          onClick={() => setShowShortcuts(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 8, padding: 20,
              minWidth: 320, maxWidth: 480,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              fontSize: 13, color: '#111',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>Keyboard shortcuts</strong>
              <button
                onClick={() => setShowShortcuts(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18 }}
              >×</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {SHORTCUTS.map((s) => (
                  <tr key={s.key}>
                    <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>
                      <code style={{
                        background: '#F3F4F6', padding: '2px 6px', borderRadius: 4,
                        fontSize: 12,
                      }}>{s.key}</code>
                    </td>
                    <td style={{ padding: 4, color: '#374151' }}>{s.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolbarButton({
  children, onClick, title, bg, color, disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  bg: string
  color: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: 32, height: 32, borderRadius: 16,
        background: disabled ? '#F3F4F6' : bg,
        color: disabled ? '#9CA3AF' : color,
        border: '1px solid rgba(0,0,0,0.08)',
        fontSize: 16, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      }}
    >
      {children}
    </button>
  )
}
