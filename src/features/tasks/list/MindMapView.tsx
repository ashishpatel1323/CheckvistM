import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CheckvistTask } from '@/api/types'
import type { TaskNode } from '@/lib/taskTree'
import { buildTaskTree } from '@/lib/taskTree'
import { priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { stripMarkdown } from '@/components/InlineMarkdown'
import { useChecklists } from '@/features/checklists/useChecklists'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'

// ─── Layout constants ────────────────────────────────────────────────────────
const RW = 220   // root (virtual checklist) node width
const RH = 60    // root node height
const NW = 180   // regular node width
const NH = 36    // regular node height
const HG = 72    // horizontal gap between depth levels
const VG = 12    // vertical gap between siblings
const RG = 28    // extra gap between root task groups
const PAD = 48   // canvas padding
const TOGGLE_R = 10 // radius of +/- toggle circle

const ZOOM_PRESETS = [500, 400, 300, 200, 150, 120, 100, 80, 50, 20, 10]

// ─── Types ───────────────────────────────────────────────────────────────────
interface PlacedNode {
  task: TaskNode | null
  id: number           // -1 = virtual root
  label: string
  x: number
  y: number
  w: number
  h: number
  depth: number
  hasRealChildren: boolean  // true if task has children regardless of collapse
}

interface PlacedEdge {
  x1: number; y1: number
  x2: number; y2: number
}

// ─── Layout ──────────────────────────────────────────────────────────────────
function computeLayout(
  visibleRoots: TaskNode[],
  collapsed: Set<number>,
  checklistName: string,
): { nodes: PlacedNode[]; edges: PlacedEdge[]; canvasW: number; canvasH: number } {
  const nodes: PlacedNode[] = []
  const edges: PlacedEdge[] = []
  let nextLeafY = PAD

  // Place a task node recursively; returns vertical midpoint of this node
  function place(task: TaskNode, depth: number): number {
    const x = PAD + RW + HG + (depth - 1) * (NW + HG)
    const isCollapsed = collapsed.has(task.id)
    const hasRealChildren = task.children.length > 0

    if (hasRealChildren && !isCollapsed) {
      // Recurse first
      const childMids: number[] = []
      for (const child of task.children) {
        childMids.push(place(child, depth + 1))
      }
      const myMid = (childMids[0] + childMids[childMids.length - 1]) / 2
      const y = myMid - NH / 2
      nodes.push({ task, id: task.id, label: stripMarkdown(task.content), x, y, w: NW, h: NH, depth, hasRealChildren })
      // Edges to children
      for (const child of task.children) {
        const cn = nodes.find((n) => n.id === child.id)!
        edges.push({ x1: x + NW, y1: myMid, x2: cn.x, y2: cn.y + NH / 2 })
      }
      return myMid
    } else {
      // Leaf or collapsed — place at next slot
      const y = nextLeafY
      nextLeafY += NH + VG
      nodes.push({ task, id: task.id, label: stripMarkdown(task.content), x, y, w: NW, h: NH, depth, hasRealChildren })
      return y + NH / 2
    }
  }

  // Place all visible root tasks
  const rootMids: number[] = []
  for (let i = 0; i < visibleRoots.length; i++) {
    rootMids.push(place(visibleRoots[i], 1))
    if (i < visibleRoots.length - 1) nextLeafY += RG
  }

  // Place virtual root node
  const centerY = rootMids.length > 0
    ? (rootMids[0] + rootMids[rootMids.length - 1]) / 2
    : PAD + RH / 2
  const vrX = PAD
  const vrY = centerY - RH / 2
  nodes.push({ task: null, id: -1, label: checklistName, x: vrX, y: vrY, w: RW, h: RH, depth: 0, hasRealChildren: visibleRoots.length > 0 })

  // Edges from virtual root to task roots
  for (const root of visibleRoots) {
    const rn = nodes.find((n) => n.id === root.id)!
    edges.push({ x1: vrX + RW, y1: centerY, x2: rn.x, y2: rn.y + NH / 2 })
  }

  const canvasW = nodes.length > 0 ? Math.max(...nodes.map((n) => n.x + n.w)) + PAD : PAD * 2
  const canvasH = nodes.length > 0 ? Math.max(...nodes.map((n) => n.y + n.h)) + PAD : PAD * 2

  return { nodes, edges, canvasW, canvasH }
}

function bezier({ x1, y1, x2, y2 }: PlacedEdge): string {
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
}

// ─── Component ───────────────────────────────────────────────────────────────
interface MindMapViewProps {
  tasks: CheckvistTask[]
  checklistId: number
}

export function MindMapView({ tasks, checklistId }: MindMapViewProps) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Checklist name
  const { activeChecklistId } = useActiveChecklist()
  const { data: checklists } = useChecklists()
  const checklistName = checklists?.find((c) => c.id === activeChecklistId)?.name ?? 'Tasks'

  // Pan / zoom
  const [pan, setPan] = useState({ x: 40, y: 40 })
  const [scale, setScale] = useState(1)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  // Collapse state
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  // Drill-down stack (array of task node IDs)
  const [drillStack, setDrillStack] = useState<number[]>([])

  const { allNodes, roots } = useMemo(() => buildTaskTree(tasks), [tasks])

  // Resolve which roots to show based on drill stack
  const visibleRoots = useMemo((): TaskNode[] => {
    if (drillStack.length === 0) return roots
    const topId = drillStack[drillStack.length - 1]
    const topNode = allNodes.find((n) => n.id === topId)
    return topNode ? [topNode] : roots
  }, [drillStack, roots, allNodes])

  const { nodes, edges, canvasW, canvasH } = useMemo(
    () => computeLayout(visibleRoots, collapsed, checklistName),
    [visibleRoots, collapsed, checklistName]
  )

  // ── Pan ────────────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
  }, [pan])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({ x: dragStart.current.px + e.clientX - dragStart.current.mx, y: dragStart.current.py + e.clientY - dragStart.current.my })
  }, [])

  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  const touchStart = useRef({ tx: 0, ty: 0, px: 0, py: 0 })
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { tx: t.clientX, ty: t.clientY, px: pan.x, py: pan.y }
  }, [pan])
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    setPan({ x: touchStart.current.px + t.clientX - touchStart.current.tx, y: touchStart.current.py + t.clientY - touchStart.current.ty })
  }, [])

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale((s) => Math.min(Math.max(s * (e.deltaY > 0 ? 0.92 : 1.08), 0.1), 5))
  }, [])

  const zoomTo = (pct: number) => { setScale(pct / 100); setShowZoomMenu(false) }

  const fitMap = useCallback(() => {
    if (!containerRef.current) return
    const { clientWidth: cw, clientHeight: ch } = containerRef.current
    const sx = (cw - 80) / canvasW
    const sy = (ch - 80) / canvasH
    const s = Math.min(sx, sy, 2)
    setScale(s)
    setPan({ x: (cw - canvasW * s) / 2, y: (ch - canvasH * s) / 2 })
    setShowZoomMenu(false)
  }, [canvasW, canvasH])

  // Auto-fit on first render / when task list changes
  useEffect(() => { fitMap() }, [tasks.length])  // eslint-disable-line react-hooks/exhaustive-deps

  // IDs of every node that has children
  const allParentIds = useMemo(
    () => new Set(allNodes.filter((n) => n.children.length > 0).map((n) => n.id)),
    [allNodes]
  )

  const allFolded = allParentIds.size > 0 && allParentIds.size === collapsed.size

  const toggleFoldAll = useCallback(() => {
    setCollapsed((prev) => (prev.size === allParentIds.size ? new Set() : new Set(allParentIds)))
  }, [allParentIds])

  // ── Collapse toggle ────────────────────────────────────────────────────────
  const toggleCollapse = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Drill ──────────────────────────────────────────────────────────────────
  const drillDown = useCallback((id: number) => {
    setDrillStack((s) => [...s, id])
  }, [])

  const drillUp = useCallback(() => {
    setDrillStack((s) => s.slice(0, -1))
  }, [])

  if (roots.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">No tasks to display</div>
  }

  const zoomPct = Math.round(scale * 100)
  const isDrilledIn = drillStack.length > 0

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative bg-[#f0f4f8] cursor-grab active:cursor-grabbing select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onWheel={onWheel}
    >
      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})`, transformOrigin: '0 0', position: 'absolute', top: 0, left: 0 }}>
        {/* SVG edges */}
        <svg width={canvasW} height={canvasH} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}>
          {edges.map((edge, i) => (
            <path key={i} d={bezier(edge)} stroke="#93b4d8" strokeWidth={1.5} fill="none" strokeLinecap="round" />
          ))}
        </svg>

        {/* Nodes */}
        {nodes.map((node) => {
          const isVR = node.id === -1
          const isDrilledRoot = isDrilledIn && node.task && node.task.id === drillStack[drillStack.length - 1]
          const isCollapsed = node.id !== -1 && collapsed.has(node.id)

          return (
            <div key={node.id} style={{ position: 'absolute', left: node.x, top: node.y, width: node.w, height: node.h }}>
              {/* Main node box */}
              <button
                className={[
                  'w-full h-full rounded-xl flex items-center px-3 gap-1.5 shadow-sm border-2 transition-colors text-left',
                  isVR
                    ? 'bg-[#dbe8f6] border-[#4a7ab5] hover:bg-[#cdddf0] font-bold text-[#1e3a5f] text-[15px]'
                    : node.depth === 1
                      ? 'bg-[#e8f0fb] border-[#7aaad4] hover:bg-[#d8e6f5] font-semibold text-[#1e3a5f] text-[13px]'
                      : 'bg-white border-[#b0cce8] hover:bg-[#eef4fb] text-gray-700 text-[12px]',
                  isDrilledRoot ? 'ring-2 ring-[#4a7ab5] ring-offset-1' : '',
                ].join(' ')}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={() => !isVR && navigate(`/${checklistId}/tasks/${node.id}`)}
                title={node.label}
              >
                {/* Drill-up icon (only on drilled root) */}
                {isDrilledRoot && (
                  <button
                    className="shrink-0 w-5 h-5 rounded border border-[#7aaad4] bg-[#dbe8f6] flex items-center justify-center text-[#4a7ab5] hover:bg-[#c5d9f0] text-[10px]"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); drillUp() }}
                    title="Drill Up"
                  >
                    ↑
                  </button>
                )}

                <span className="flex-1 truncate leading-tight">{node.label}</span>

                {/* Due date + priority for non-VR nodes */}
                {!isVR && node.task?.due && (
                  <span className={`text-[10px] font-medium shrink-0 ${dueDateColorClass(node.task.due)}`}>
                    {humanizeDueDate(node.task.due)}
                  </span>
                )}
                {!isVR && node.task && node.task.priority > 0 && (
                  <span className={`text-[10px] font-bold px-1 rounded shrink-0 ${priorityBadgeClass(node.task.priority)}`}>
                    {priorityDisplay(node.task.priority)}
                  </span>
                )}
              </button>

              {/* Collapse/expand toggle — right edge, vertically centered */}
              {!isVR && node.hasRealChildren && (
                <button
                  style={{ position: 'absolute', right: -(TOGGLE_R), top: node.h / 2 - TOGGLE_R, width: TOGGLE_R * 2, height: TOGGLE_R * 2 }}
                  className="rounded-full bg-white border-2 border-[#7aaad4] text-[#4a7ab5] flex items-center justify-center text-[10px] font-bold hover:bg-[#dbe8f6] z-10 shadow-sm"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); toggleCollapse(node.id) }}
                  title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed ? '+' : '−'}
                </button>
              )}

              {/* Drill-down button — appears on parent nodes via hover, top-right */}
              {!isVR && node.hasRealChildren && !isDrilledRoot && (
                <button
                  style={{ position: 'absolute', right: -(TOGGLE_R), top: -(TOGGLE_R) }}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-[#4a7ab5] text-white text-[9px] flex items-center justify-center hover:bg-[#2e5f96] z-10 shadow"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); drillDown(node.id) }}
                  title="Drill Down"
                >
                  ⤵
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-1.5 z-20" onMouseDown={(e) => e.stopPropagation()}>

        {/* Drill up breadcrumb */}
        {isDrilledIn && (
          <button
            onClick={drillUp}
            className="px-2 py-0.5 text-xs font-medium text-[#4a7ab5] hover:bg-[#eef4fb] rounded-lg mr-1"
            title="Drill Up"
          >
            ↑ Up
          </button>
        )}

        <button onClick={() => setScale((s) => Math.max(s * 0.8, 0.1))} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg flex items-center justify-center">−</button>

        {/* Zoom percentage — click for dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowZoomMenu((v) => !v)}
            className="px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg min-w-[52px] text-center"
          >
            {zoomPct}%
          </button>
          {showZoomMenu && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-30 min-w-[100px]">
              <button onClick={fitMap} className="w-full text-center px-4 py-1.5 text-xs font-semibold text-[#4a7ab5] hover:bg-[#eef4fb] border-b border-gray-100">
                Fit Map
              </button>
              {ZOOM_PRESETS.map((pct) => (
                <button
                  key={pct}
                  onClick={() => zoomTo(pct)}
                  className={`w-full text-center px-4 py-1 text-xs hover:bg-gray-50 ${zoomPct === pct ? 'font-bold text-[#4a7ab5]' : 'text-gray-700'}`}
                >
                  {zoomPct === pct && '✓ '}{pct}%
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setScale((s) => Math.min(s * 1.2, 5))} className="w-7 h-7 rounded-lg hover:bg-gray-100 text-gray-600 font-bold text-lg flex items-center justify-center">+</button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button onClick={fitMap} className="px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Fit</button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={toggleFoldAll}
          className="px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg whitespace-nowrap"
          title={allFolded ? 'Unfold all branches' : 'Fold all branches'}
        >
          {allFolded ? '⊞ Unfold All' : '⊟ Fold All'}
        </button>
      </div>

      {/* Close zoom menu on outside click */}
      {showZoomMenu && <div className="fixed inset-0 z-10" onClick={() => setShowZoomMenu(false)} />}
    </div>
  )
}
