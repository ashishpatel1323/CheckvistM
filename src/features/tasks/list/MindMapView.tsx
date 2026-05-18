import { useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CheckvistTask } from '@/api/types'
import type { TaskNode } from '@/lib/taskTree'
import { buildTaskTree } from '@/lib/taskTree'
import { priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { stripMarkdown } from '@/components/InlineMarkdown'

const NW = 180   // node width
const NH = 36    // node height
const HG = 52    // horizontal gap between depth levels
const VG = 10    // vertical gap between sibling nodes
const RG = 20    // extra gap between separate root trees
const PAD = 40   // canvas padding

interface PlacedNode {
  task: TaskNode
  x: number
  y: number
  isRoot: boolean
}

interface PlacedEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

function computeLayout(roots: TaskNode[]): {
  nodes: PlacedNode[]
  edges: PlacedEdge[]
  canvasW: number
  canvasH: number
} {
  const nodes: PlacedNode[] = []
  const edges: PlacedEdge[] = []
  let nextLeafY = PAD

  function place(task: TaskNode, depth: number, isRoot: boolean): number {
    // Returns the vertical midpoint (center) of this node
    const x = PAD + depth * (NW + HG)

    if (task.children.length === 0) {
      const y = nextLeafY
      nextLeafY += NH + VG
      nodes.push({ task, x, y, isRoot })
      return y + NH / 2
    }

    // Recurse into children first so we can center the parent
    const childMids: number[] = []
    for (const child of task.children) {
      childMids.push(place(child, depth + 1, false))
    }

    const myMid = (childMids[0] + childMids[childMids.length - 1]) / 2
    const y = myMid - NH / 2
    nodes.push({ task, x, y, isRoot })

    // Draw edges from this node to each child
    for (const child of task.children) {
      const cn = nodes.find((n) => n.task.id === child.id)!
      edges.push({
        x1: x + NW,
        y1: myMid,
        x2: cn.x,
        y2: cn.y + NH / 2,
      })
    }

    return myMid
  }

  for (let i = 0; i < roots.length; i++) {
    place(roots[i], 0, true)
    if (i < roots.length - 1) {
      nextLeafY += RG
    }
  }

  const canvasW = nodes.length > 0 ? Math.max(...nodes.map((n) => n.x + NW)) + PAD : PAD * 2
  const canvasH = nodes.length > 0 ? Math.max(...nodes.map((n) => n.y + NH)) + PAD : PAD * 2

  return { nodes, edges, canvasW, canvasH }
}

function bezier(e: PlacedEdge): string {
  const mx = (e.x1 + e.x2) / 2
  return `M ${e.x1} ${e.y1} C ${mx} ${e.y1} ${mx} ${e.y2} ${e.x2} ${e.y2}`
}

interface MindMapViewProps {
  tasks: CheckvistTask[]
  checklistId: number
}

export function MindMapView({ tasks, checklistId }: MindMapViewProps) {
  const navigate = useNavigate()

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const dragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const { roots } = useMemo(() => buildTaskTree(tasks), [tasks])
  const { nodes, edges, canvasW, canvasH } = useMemo(() => computeLayout(roots), [roots])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true
      dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y }
    },
    [pan]
  )

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return
    setPan({
      x: dragStart.current.px + e.clientX - dragStart.current.mx,
      y: dragStart.current.py + e.clientY - dragStart.current.my,
    })
  }, [])

  const onMouseUp = useCallback(() => {
    dragging.current = false
  }, [])

  // Touch pan support
  const touchStart = useRef({ tx: 0, ty: 0, px: 0, py: 0 })

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const t = e.touches[0]
      touchStart.current = { tx: t.clientX, ty: t.clientY, px: pan.x, py: pan.y }
    },
    [pan]
  )

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    setPan({
      x: touchStart.current.px + t.clientX - touchStart.current.tx,
      y: touchStart.current.py + t.clientY - touchStart.current.ty,
    })
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    setScale((s) => Math.min(Math.max(s * factor, 0.15), 4))
  }, [])

  const zoomIn = () => setScale((s) => Math.min(s * 1.2, 4))
  const zoomOut = () => setScale((s) => Math.max(s * 0.8, 0.15))
  const resetView = () => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  if (roots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        No tasks to display
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-hidden relative bg-[#f8f9fa] cursor-grab active:cursor-grabbing select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onWheel={onWheel}
    >
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button
          onClick={zoomIn}
          className="w-8 h-8 rounded-lg bg-white shadow border border-gray-200 text-gray-600 hover:bg-gray-50 text-lg font-bold flex items-center justify-center"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={zoomOut}
          className="w-8 h-8 rounded-lg bg-white shadow border border-gray-200 text-gray-600 hover:bg-gray-50 text-lg font-bold flex items-center justify-center"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={resetView}
          className="w-8 h-8 rounded-lg bg-white shadow border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs flex items-center justify-center"
          title="Reset view"
        >
          ↺
        </button>
      </div>

      {/* Hint */}
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-gray-400 pointer-events-none z-10">
        Drag to pan · Scroll to zoom · Click a node to open
      </p>

      {/* Canvas */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        {/* SVG edges */}
        <svg
          width={canvasW}
          height={canvasH}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
        >
          {edges.map((edge, i) => (
            <path key={i} d={bezier(edge)} stroke="#d1d5db" strokeWidth={2} fill="none" />
          ))}
        </svg>

        {/* Nodes */}
        {nodes.map(({ task, x, y, isRoot }) => (
          <button
            key={task.id}
            style={{ position: 'absolute', left: x, top: y, width: NW, height: NH }}
            className={`text-left rounded-lg px-2.5 py-1 flex items-center gap-1.5 shadow-sm border transition-colors cursor-pointer ${
              isRoot
                ? 'bg-orange-50 border-orange-200 hover:bg-orange-100 font-semibold text-orange-900'
                : 'bg-white border-gray-200 hover:bg-blue-50 hover:border-blue-300 text-gray-800'
            }`}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={() => navigate(`/${checklistId}/tasks/${task.id}`)}
            title={stripMarkdown(task.content)}
          >
            <span className="flex-1 truncate text-xs">{stripMarkdown(task.content)}</span>
            {task.due && (
              <span className={`text-[10px] font-medium shrink-0 ${dueDateColorClass(task.due)}`}>
                {humanizeDueDate(task.due)}
              </span>
            )}
            {task.priority > 0 && (
              <span className={`text-[10px] font-bold px-1 rounded shrink-0 ${priorityBadgeClass(task.priority)}`}>
                {priorityDisplay(task.priority)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
