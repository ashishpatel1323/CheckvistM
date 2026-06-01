import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, useWindowDimensions, Platform, Modal } from 'react-native'
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg'
import type { CheckvistTask } from '@/api/types'
import type { TaskNode } from '@/lib/taskTree'
import { buildTaskTree } from '@/lib/taskTree'
import { stripMarkdown } from '@/components/InlineMarkdown'
import { useChecklists } from '@/features/checklists/useChecklists'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'
import { useCreateTask, useDeleteTask, useUpdateTask } from '@/features/tasks/list/useTasksQuery'
import { useToast } from '@/components/Toast'
import { Maximize2, Minimize2, ChevronRight, ChevronLeft, ZoomIn, ZoomOut } from 'lucide-react-native'

// ─── Layout ──────────────────────────────────────────────────────────────────
const RW = 200   // virtual root width
const NW = 190   // node width
const HG = 60    // horizontal gap between levels
const VG = 10    // vertical gap between siblings
const RG = 20    // extra gap between root groups
const PAD = 32
const INDICATOR_W = 24 // width of the >/< indicator tab

// Text wrapping
const NODE_FONT = 11
const ROOT_FONT = 13
const LINE_H = 15       // px per wrapped line
const NODE_PAD_V = 9    // vertical padding inside node box
const NODE_PAD_H = 10   // horizontal text padding each side
const CHAR_W_NODE = 6.0 // approx proportional char width at NODE_FONT
const CHAR_W_ROOT = 6.8 // approx proportional char width at ROOT_FONT

const MAX_LINES = 3

function wrapText(text: string, boxWidth: number, charW: number): string[] {
  const maxChars = Math.max(1, Math.floor((boxWidth - NODE_PAD_H * 2) / charW))
  if (text.length <= maxChars) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) lines.push(current)
      // hard-wrap long tokens (e.g. URLs) without hyphenating
      let rest = word
      while (rest.length > maxChars) { lines.push(rest.slice(0, maxChars)); rest = rest.slice(maxChars) }
      current = rest
    }
    if (lines.length >= MAX_LINES) break
  }
  if (current && lines.length < MAX_LINES) lines.push(current)
  // truncate to MAX_LINES, add ellipsis if content was cut
  if (lines.length === MAX_LINES) {
    const last = lines[MAX_LINES - 1]
    if (last.length === maxChars) lines[MAX_LINES - 1] = last.slice(0, maxChars - 1) + '…'
  }
  return lines
}

function nodeLines(label: string, isRoot = false): string[] {
  return wrapText(label, isRoot ? RW : NW, isRoot ? CHAR_W_ROOT : CHAR_W_NODE)
}

function nodeBoxH(lines: string[]): number {
  return NODE_PAD_V * 2 + lines.length * LINE_H
}

// ─── Depth colour palette (NotebookLM-style) ─────────────────────────────────
const DEPTH_PALETTE = [
  { bg: '#c4b5fd', stroke: '#7c3aed', text: '#3b0764' }, // 0: purple  (virtual root)
  { bg: '#bfdbfe', stroke: '#3b82f6', text: '#1e3a8a' }, // 1: blue
  { bg: '#99f6e4', stroke: '#14b8a6', text: '#134e4a' }, // 2: teal
  { bg: '#bbf7d0', stroke: '#22c55e', text: '#14532d' }, // 3: green
  { bg: '#fde68a', stroke: '#f59e0b', text: '#78350f' }, // 4: amber
  { bg: '#fecaca', stroke: '#ef4444', text: '#7f1d1d' }, // 5+: red
]

function depthColor(depth: number) {
  return DEPTH_PALETTE[Math.min(depth, DEPTH_PALETTE.length - 1)]
}

// On Android SVG renders to a bitmap — cap zoom to avoid OOM
const ZOOM_PRESETS = Platform.OS === 'web'
  ? [200, 150, 120, 100, 80, 60, 40]
  : [100, 80, 60, 40]

// ─── Types ───────────────────────────────────────────────────────────────────
interface PlacedNode {
  task: TaskNode | null
  id: number
  label: string
  lines: string[]
  x: number; y: number; w: number; h: number
  depth: number
  hasChildren: boolean
  isExpanded: boolean
}
interface PlacedEdge { x1: number; y1: number; x2: number; y2: number; depth: number }

// ─── Layout engine ───────────────────────────────────────────────────────────
function computeLayout(
  visibleRoots: TaskNode[],
  collapsed: Set<number>,
  rootLabel: string,
): { nodes: PlacedNode[]; edges: PlacedEdge[]; canvasW: number; canvasH: number } {
  const nodes: PlacedNode[] = []
  const edges: PlacedEdge[] = []
  let nextLeafY = PAD

  function place(task: TaskNode, depth: number): number {
    const x = PAD + RW + HG + (depth - 1) * (NW + HG)
    const isCollapsed = collapsed.has(task.id)
    const hasChildren = task.children.length > 0
    const isExpanded = hasChildren && !isCollapsed
    const label = stripMarkdown(task.content)
    const lines = nodeLines(label)
    const h = nodeBoxH(lines)

    if (isExpanded) {
      const childMids: number[] = []
      for (const child of task.children) childMids.push(place(child, depth + 1))
      const myMid = (childMids[0] + childMids[childMids.length - 1]) / 2
      const y = myMid - h / 2
      nodes.push({ task, id: task.id, label, lines, x, y, w: NW, h, depth, hasChildren, isExpanded })
      for (const child of task.children) {
        const cn = nodes.find((n) => n.id === child.id)!
        edges.push({ x1: x + NW, y1: myMid, x2: cn.x, y2: cn.y + cn.h / 2, depth })
      }
      return myMid
    } else {
      const y = nextLeafY
      nextLeafY += h + VG
      nodes.push({ task, id: task.id, label, lines, x, y, w: NW, h, depth, hasChildren, isExpanded })
      return y + h / 2
    }
  }

  const rootMids: number[] = []
  for (let i = 0; i < visibleRoots.length; i++) {
    rootMids.push(place(visibleRoots[i], 1))
    if (i < visibleRoots.length - 1) nextLeafY += RG
  }

  const rlines = nodeLines(rootLabel, true)
  const rh = nodeBoxH(rlines)
  const centerY = rootMids.length > 0
    ? (rootMids[0] + rootMids[rootMids.length - 1]) / 2
    : PAD + rh / 2
  nodes.push({
    task: null, id: -1, label: rootLabel, lines: rlines,
    x: PAD, y: centerY - rh / 2, w: RW, h: rh,
    depth: 0, hasChildren: visibleRoots.length > 0, isExpanded: true,
  })
  for (const root of visibleRoots) {
    const rn = nodes.find((n) => n.id === root.id)!
    edges.push({ x1: PAD + RW, y1: centerY, x2: rn.x, y2: rn.y + rn.h / 2, depth: 0 })
  }

  const canvasW = nodes.length > 0 ? Math.max(...nodes.map((n) => n.x + n.w + INDICATOR_W)) + PAD : PAD * 2
  const canvasH = nodes.length > 0 ? Math.max(...nodes.map((n) => n.y + n.h)) + PAD : PAD * 2
  return { nodes, edges, canvasW, canvasH }
}

function bezierPath({ x1, y1, x2, y2 }: PlacedEdge): string {
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
}

// ─── Toolbar button ───────────────────────────────────────────────────────────
function ToolbarBtn({
  label, onPress, disabled, active, icon,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
  icon?: React.ReactNode
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ opacity: disabled ? 0.35 : 1 }}
      className={`flex-row items-center gap-1 px-3 py-1.5 rounded-lg ${active ? 'bg-violet-100 border border-violet-300' : 'bg-gray-100 active:bg-gray-200'}`}
    >
      {icon}
      <Text className={`text-xs font-medium ${active ? 'text-violet-700' : 'text-gray-700'}`}>{label}</Text>
    </Pressable>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────
interface MindMapViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  focusedId: number | null
  setFocusedId: (id: number | null) => void
}

export function MindMapView({ tasks, checklistId, focusedId, setFocusedId }: MindMapViewProps) {
  const { width: screenW, height: screenH } = useWindowDimensions()
  const { activeChecklistId } = useActiveChecklist()
  const { data: checklists } = useChecklists()
  const checklistName = checklists?.find((c) => c.id === activeChecklistId)?.name ?? 'Tasks'

  const [scale, setScale] = useState(1)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const [drillPath, setDrillPath] = useState<number[]>([])

  const [newChildParentId, setNewChildParentId] = useState<number | null>(null)
  const [newChildText, setNewChildText] = useState('')
  const newChildInputRef = useRef<TextInput>(null)
  const { mutateAsync: createTask } = useCreateTask(checklistId)
  const { mutateAsync: deleteTask } = useDeleteTask(checklistId)
  const { mutate: updateTaskMutate } = useUpdateTask(checklistId)
  const updateTaskRef = useRef(updateTaskMutate)
  useEffect(() => { updateTaskRef.current = updateTaskMutate }, [updateTaskMutate])

  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast }, [toast])

  // Drag state for leaf-node reparenting (web only)
  interface RenderDrag { nodeId: number; label: string; screenX: number; screenY: number; dropTargetId: number | null }
  const [renderDrag, setRenderDrag] = useState<RenderDrag | null>(null)
  const dragRef = useRef<{ nodeId: number; label: string; startX: number; startY: number; active: boolean; dropTargetId: number | null } | null>(null)

  // ─── Context menu ─────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; nodeId: number; nodeW: number; nodeH: number } | null>(null)
  const contextMenuRef = useRef(contextMenu)
  useEffect(() => { contextMenuRef.current = contextMenu }, [contextMenu])
  const hideContextMenu = useCallback(() => setContextMenu(null), [])

  // ─── Gesture state (web) ─────────────────────────────────────────────────
  const scrollViewRef = useRef<ScrollView>(null)
  const scrollPos = useRef({ x: 0, y: 0 })
  // pan: right-click drag or space+left-drag
  const panRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  const spaceHeld = useRef(false)
  const ctrlHeld = useRef(false)
  const [isPanning, setIsPanning] = useState(false)
  // marquee selection
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const canvasContainerRef = useRef<View>(null)
  // keep scale accessible in event handlers without re-attaching
  const scaleRef = useRef(scale)
  useEffect(() => { scaleRef.current = scale }, [scale])
  // keep setFocusedId accessible in once-attached event handlers
  const setFocusedIdRef = useRef(setFocusedId)
  useEffect(() => { setFocusedIdRef.current = setFocusedId }, [setFocusedId])
  // keep focusedId accessible in once-attached event handlers
  const focusedIdRef = useRef(focusedId)
  useEffect(() => { focusedIdRef.current = focusedId }, [focusedId])
  // keep nodes accessible in marquee handler
  const nodesRef = useRef<PlacedNode[]>([])

  const { allNodes, roots } = useMemo(() => buildTaskTree(tasks), [tasks])

  const nodeMap = useMemo(() => {
    const m = new Map<number, TaskNode>()
    allNodes.forEach((n) => m.set(n.id, n))
    return m
  }, [allNodes])

  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    const tree = buildTaskTree(tasks)
    return new Set(tree.allNodes.filter((n) => n.children.length > 0).map((n) => n.id))
  })

  const { visibleRoots, rootLabel } = useMemo(() => {
    if (drillPath.length === 0) return { visibleRoots: roots, rootLabel: checklistName }
    const drillId = drillPath[drillPath.length - 1]
    const drillNode = nodeMap.get(drillId)
    if (!drillNode) return { visibleRoots: roots, rootLabel: checklistName }
    return { visibleRoots: drillNode.children, rootLabel: stripMarkdown(drillNode.content) }
  }, [drillPath, roots, nodeMap, checklistName])

  const { nodes, edges, canvasW, canvasH } = useMemo(
    () => computeLayout(visibleRoots, collapsed, rootLabel),
    [visibleRoots, collapsed, rootLabel]
  )

  // keep nodes ref in sync for marquee handler
  useEffect(() => { nodesRef.current = nodes }, [nodes])

  const allParentIds = useMemo(
    () => new Set(allNodes.filter((n) => n.children.length > 0).map((n) => n.id)),
    [allNodes]
  )

  const toggleCollapse = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }, [])

  const drillIn = useCallback((id: number) => {
    const node = nodeMap.get(id)
    if (!node || node.children.length === 0) return
    setCollapsed((prev) => { const n = new Set(prev); n.delete(id); return n })
    setDrillPath((p) => [...p, id])
    setFocusedId(null)
  }, [nodeMap, setFocusedId])

  const drillOut = useCallback(() => {
    setDrillPath((p) => {
      if (p.length === 0) return p
      setFocusedId(p[p.length - 1])
      return p.slice(0, -1)
    })
  }, [setFocusedId])

  // Unfold a node and all its descendants
  const unfoldSubtree = useCallback((id: number) => {
    const toUnfold = new Set<number>()
    function collect(nodeId: number) {
      const n = nodeMap.get(nodeId)
      if (!n) return
      toUnfold.add(nodeId)
      n.children.forEach((c) => collect(c.id))
    }
    collect(id)
    setCollapsed((prev) => { const n = new Set(prev); toUnfold.forEach((id) => n.delete(id)); return n })
  }, [nodeMap])

  const submitNewChild = useCallback(async () => {
    if (!newChildParentId || !newChildText.trim()) { setNewChildParentId(null); return }
    setCollapsed((prev) => { const n = new Set(prev); n.delete(newChildParentId); return n })
    await createTask({ content: newChildText.trim(), parent_id: newChildParentId })
    setFocusedId(newChildParentId)
    setNewChildParentId(null)
    setNewChildText('')
  }, [newChildParentId, newChildText, createTask, setFocusedId])

  // Virtual root press: single-click drills out (if drilled in)
  const handleRootPress = useCallback(() => {
    if (drillPath.length > 0) drillOut()
  }, [drillPath.length, drillOut])

  // Node press: single-click focuses, double-click opens detail/edit, Ctrl+click multi-selects
  const handleNodePress = useCallback((id: number) => {
    if (ctrlHeld.current) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
      return
    }
    setFocusedId(id)
  }, [setFocusedId])

  // ─── Keyboard navigation (web only) ──────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: KeyboardEvent) => {
      // Track modifier keys
      ctrlHeld.current = e.ctrlKey || e.metaKey

      // Space key for pan cursor
      if (e.code === 'Space') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(e.target as HTMLElement)?.isContentEditable) {
          spaceHeld.current = true
          e.preventDefault() // prevent page scroll
        }
        return
      }

      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      const realNodes = nodes.filter((n) => n.id !== -1).sort((a, b) => a.y - b.y)
      const orderedIds = realNodes.map((n) => n.id)
      const currentIdx = focusedId != null ? orderedIds.indexOf(focusedId) : -1

      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        const next = orderedIds[Math.min(currentIdx + 1, orderedIds.length - 1)]
        if (next != null) setFocusedId(next)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        const next = orderedIds[Math.max(currentIdx - 1, 0)]
        if (next != null) setFocusedId(next)
      } else if (e.key === 'ArrowRight' && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        const node = nodeMap.get(focusedId)
        if (!node) return
        if (node.children.length > 0 && collapsed.has(focusedId)) {
          setCollapsed((prev) => { const n = new Set(prev); n.delete(focusedId); return n })
        } else if (node.children.length > 0) {
          const firstChild = orderedIds.find((id) => node.children.some((c) => c.id === id))
          if (firstChild != null) setFocusedId(firstChild)
        }
      } else if (e.key === 'ArrowLeft' && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        const node = nodeMap.get(focusedId)
        if (!node) return
        if (node.children.length > 0 && !collapsed.has(focusedId)) {
          setCollapsed((prev) => new Set([...prev, focusedId]))
        } else if (node.parent_id != null) {
          setFocusedId(node.parent_id)
        }
      } else if (e.key === 'F5') {
        e.preventDefault(); e.stopPropagation()
        if (focusedId != null) drillIn(focusedId)
      } else if (e.key === 'F6') {
        e.preventDefault(); e.stopPropagation()
        drillOut()
      } else if (e.key === 'Tab' && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        setNewChildParentId(focusedId)
        setNewChildText('')
        setTimeout(() => newChildInputRef.current?.focus(), 50)
      } else if ((e.key === '+' || e.key === '=') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setScale((s) => {
          const i = ZOOM_PRESETS.findIndex((p) => p <= Math.round(s * 100))
          return (ZOOM_PRESETS[Math.max(i - 1, 0)] ?? ZOOM_PRESETS[0]) / 100
        })
      } else if (e.key === '-' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setScale((s) => {
          const i = ZOOM_PRESETS.findIndex((p) => p <= Math.round(s * 100))
          return (ZOOM_PRESETS[Math.min(i + 1, ZOOM_PRESETS.length - 1)] ?? ZOOM_PRESETS[ZOOM_PRESETS.length - 1]) / 100
        })
      } else if (e.key === 'Escape') {
        if (selectedIds.size > 0) setSelectedIds(new Set())
        else if (fullScreen) setFullScreen(false)
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+A: select all visible nodes
        e.preventDefault()
        setSelectedIds(new Set(nodes.filter((n) => n.id !== -1).map((n) => n.id)))
      }
    }
    const keyUpHandler = (e: KeyboardEvent) => {
      ctrlHeld.current = e.ctrlKey || e.metaKey
      if (e.code === 'Space') {
        spaceHeld.current = false
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    window.addEventListener('keyup', keyUpHandler, { capture: true })
    return () => {
      window.removeEventListener('keydown', handler, { capture: true })
      window.removeEventListener('keyup', keyUpHandler, { capture: true })
    }
  }, [nodes, focusedId, setFocusedId, collapsed, nodeMap, drillIn, drillOut, newChildInputRef, fullScreen, selectedIds])

  // ─── Web DOM gesture events ───────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const el = canvasContainerRef.current as unknown as HTMLElement
    if (!el) return
    // The scrollable node is the inner div rendered by ScrollView
    const getSvEl = () => (scrollViewRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null)?.getScrollableNode?.() ?? null

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom: take over and prevent the default page zoom / scroll
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.08 : 0.93
        setScale((s) => Math.min(2.5, Math.max(0.2, s * factor)))
        return
      }
      // Normal scroll: forward to the ScrollView's scrollable node so both
      // mouse wheel and two-finger trackpad swipe work in all directions.
      e.preventDefault()
      const sv = getSvEl()
      if (!sv) return
      if (e.shiftKey) {
        // Shift+wheel → horizontal scroll
        sv.scrollLeft += e.deltaY
      } else {
        sv.scrollTop += e.deltaY
        sv.scrollLeft += e.deltaX
      }
    }

    // Suppress browser context menu — we use right-click for pan
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    const handleMouseDown = (e: MouseEvent) => {
      const isRightClick = e.button === 2
      const isSpacePan = e.button === 0 && spaceHeld.current

      if (isRightClick) {
        e.preventDefault()
        // Check if click lands on a node
        const rect = el.getBoundingClientRect()
        const cx = (e.clientX - rect.left + scrollPos.current.x) / scaleRef.current
        const cy = (e.clientY - rect.top + scrollPos.current.y) / scaleRef.current
        const hit = nodesRef.current.find(
          (n) => n.id !== -1 && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h
        )
        if (hit) {
          if (focusedIdRef.current !== hit.id) {
            // First right-click just selects the node, no menu
            setFocusedIdRef.current(hit.id)
          } else {
            // Node already focused: show context menu anchored to node's screen position
            const nodeScreenX = rect.left + hit.x * scaleRef.current + 40 - scrollPos.current.x
            const nodeScreenY = rect.top + hit.y * scaleRef.current + 40 - scrollPos.current.y
            setContextMenu({ screenX: nodeScreenX, screenY: nodeScreenY, nodeId: hit.id, nodeW: hit.w * scaleRef.current, nodeH: hit.h * scaleRef.current })
          }
        } else {
          // blank canvas: pan
          panRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            scrollX: scrollPos.current.x,
            scrollY: scrollPos.current.y,
          }
          setIsPanning(true)
        }
        return
      }

      if (isSpacePan) {
        e.preventDefault()
        panRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          scrollX: scrollPos.current.x,
          scrollY: scrollPos.current.y,
        }
        setIsPanning(true)
        return
      }

      // Left click: dismiss context menu if open
      if (contextMenuRef.current) {
        setContextMenu(null)
      }

      // Left-click on a leaf node (no children) → potential drag-to-reparent
      if (e.button === 0 && !isSpacePan) {
        const rect = el.getBoundingClientRect()
        const cx = (e.clientX - rect.left + scrollPos.current.x) / scaleRef.current
        const cy = (e.clientY - rect.top + scrollPos.current.y) / scaleRef.current
        const hit = nodesRef.current.find(
          (n) => n.id !== -1 && !n.hasChildren &&
                 cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h
        )
        if (hit) {
          dragRef.current = { nodeId: hit.id, label: hit.label, startX: e.clientX, startY: e.clientY, active: false, dropTargetId: null }
          return  // SVG onPress still fires normally for single-click focus
        }
      }

      // Left-click drag on blank SVG canvas → marquee selection
      const target = e.target as Element
      const isBlanCanvas = target.tagName === 'svg' || target.tagName === 'SVG'
      if (e.button === 0 && isBlanCanvas) {
        const rect = el.getBoundingClientRect()
        const cx = (e.clientX - rect.left + scrollPos.current.x) / scaleRef.current
        const cy = (e.clientY - rect.top + scrollPos.current.y) / scaleRef.current
        marqueeStartRef.current = { x: cx, y: cy }
        setMarquee({ x: cx, y: cy, w: 0, h: 0 })
        if (!e.ctrlKey && !e.metaKey) setSelectedIds(new Set())
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Handle leaf drag
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX
        const dy = e.clientY - dragRef.current.startY
        if (!dragRef.current.active && Math.sqrt(dx * dx + dy * dy) > 5) {
          dragRef.current.active = true
        }
        if (dragRef.current.active) {
          const rect = el.getBoundingClientRect()
          const cx = (e.clientX - rect.left + scrollPos.current.x) / scaleRef.current
          const cy = (e.clientY - rect.top + scrollPos.current.y) / scaleRef.current
          const hit = nodesRef.current.find(
            (n) => n.id !== -1 && n.id !== dragRef.current!.nodeId &&
                   cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h
          )
          dragRef.current.dropTargetId = hit?.id ?? null
          setRenderDrag({
            nodeId: dragRef.current.nodeId,
            label: dragRef.current.label,
            screenX: e.clientX,
            screenY: e.clientY,
            dropTargetId: hit?.id ?? null,
          })
          return
        }
      }

      if (panRef.current) {
        const dx = e.clientX - panRef.current.startX
        const dy = e.clientY - panRef.current.startY
        const sv = getSvEl()
        if (sv) {
          sv.scrollLeft = panRef.current.scrollX - dx
          sv.scrollTop = panRef.current.scrollY - dy
        }
        return
      }
      if (marqueeStartRef.current) {
        const rect = el.getBoundingClientRect()
        const cx = (e.clientX - rect.left + scrollPos.current.x) / scaleRef.current
        const cy = (e.clientY - rect.top + scrollPos.current.y) / scaleRef.current
        setMarquee({
          x: Math.min(marqueeStartRef.current.x, cx),
          y: Math.min(marqueeStartRef.current.y, cy),
          w: Math.abs(cx - marqueeStartRef.current.x),
          h: Math.abs(cy - marqueeStartRef.current.y),
        })
      }
    }

    const handleMouseUp = (_e: MouseEvent) => {
      // Commit leaf drag drop
      if (dragRef.current) {
        const wasActive = dragRef.current.active
        const { nodeId, dropTargetId } = dragRef.current
        dragRef.current = null
        if (wasActive) {
          setRenderDrag(null)
          if (dropTargetId !== null) {
            updateTaskRef.current(
              { taskId: nodeId, payload: { parent_id: dropTargetId, position: 1 } },
              {
                onSuccess: () => toastRef.current.success('Task moved'),
                onError: () => toastRef.current.error('Failed to move task'),
              }
            )
          }
          return
        }
      }

      if (panRef.current) {
        panRef.current = null
        setIsPanning(false)
      }
      if (marqueeStartRef.current) {
        setMarquee((prev) => {
          if (prev && prev.w > 8 && prev.h > 8) {
            const selected = new Set<number>()
            nodesRef.current.forEach((node) => {
              if (node.id === -1) return
              if (
                node.x < prev.x + prev.w && node.x + node.w > prev.x &&
                node.y < prev.y + prev.h && node.y + node.h > prev.y
              ) selected.add(node.id)
            })
            setSelectedIds(selected)
          }
          marqueeStartRef.current = null
          return null
        })
      }
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    el.addEventListener('contextmenu', handleContextMenu)
    el.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      el.removeEventListener('wheel', handleWheel)
      el.removeEventListener('contextmenu', handleContextMenu)
      el.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, []) // attach once; refs keep values fresh

  const zoomPct = Math.round(scale * 100)
  const scaledW = canvasW * scale
  const scaledH = canvasH * scale

  // Dynamic cursor for canvas area
  const canvasCursor = renderDrag ? 'grabbing' : isPanning ? 'grabbing' : spaceHeld.current ? 'grab' : 'default'

  if (roots.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-400 text-sm">No tasks to display</Text>
      </View>
    )
  }

  const content = (
    <View className="flex-1 bg-white" style={fullScreen && Platform.OS === 'web' ? { position: 'fixed' as never, inset: 0, zIndex: 999 } : undefined}>
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <View className="flex-row items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-white flex-wrap">

        {/* Fold / Unfold */}
        <ToolbarBtn label="Fold All"   onPress={() => setCollapsed(new Set(allParentIds))} />
        <ToolbarBtn label="Unfold All" onPress={() => setCollapsed(new Set())} />

        <View style={{ width: 1, height: 20, backgroundColor: '#e5e7eb', marginHorizontal: 4 }} />

        {/* Drill In / Out */}
        <ToolbarBtn
          label="Drill In"
          onPress={() => focusedId != null && drillIn(focusedId)}
          disabled={focusedId == null || !nodeMap.get(focusedId ?? -1)?.children.length}
          active={false}
          icon={<ChevronRight size={13} color={focusedId != null ? '#6d28d9' : '#9ca3af'} />}
        />
        <ToolbarBtn
          label="Drill Out"
          onPress={drillOut}
          disabled={drillPath.length === 0}
          active={drillPath.length > 0}
          icon={<ChevronLeft size={13} color={drillPath.length > 0 ? '#6d28d9' : '#9ca3af'} />}
        />
        {drillPath.length > 0 && (
          <Text className="text-xs text-violet-500 font-medium">{drillPath.length} level{drillPath.length > 1 ? 's' : ''} deep</Text>
        )}

        {selectedIds.size > 0 && (
          <>
            <View style={{ width: 1, height: 20, backgroundColor: '#e5e7eb', marginHorizontal: 4 }} />
            <Text className="text-xs text-blue-500 font-medium">{selectedIds.size} selected</Text>
            <ToolbarBtn label="Clear" onPress={() => setSelectedIds(new Set())} />
          </>
        )}

        <View className="flex-1" />

        {/* Zoom */}
        <Pressable onPress={() => setScale((s) => {
          const i = ZOOM_PRESETS.findIndex((p) => p <= Math.round(s * 100))
          return (ZOOM_PRESETS[Math.max(i - 1, 0)] ?? ZOOM_PRESETS[0]) / 100
        })} className="p-1.5 rounded-lg bg-gray-100 active:bg-gray-200">
          <ZoomIn size={14} color="#374151" />
        </Pressable>
        <Pressable
          onPress={() => setShowZoomMenu((v) => !v)}
          className="px-2 py-1 rounded-lg bg-gray-100 active:bg-gray-200"
        >
          <Text className="text-xs font-medium text-gray-700">{zoomPct}%</Text>
        </Pressable>
        <Pressable onPress={() => setScale((s) => {
          const i = ZOOM_PRESETS.findIndex((p) => p <= Math.round(s * 100))
          return (ZOOM_PRESETS[Math.min(i + 1, ZOOM_PRESETS.length - 1)] ?? ZOOM_PRESETS[ZOOM_PRESETS.length - 1]) / 100
        })} className="p-1.5 rounded-lg bg-gray-100 active:bg-gray-200">
          <ZoomOut size={14} color="#374151" />
        </Pressable>

        <View style={{ width: 1, height: 20, backgroundColor: '#e5e7eb', marginHorizontal: 4 }} />

        {/* Full screen */}
        <Pressable onPress={() => setFullScreen((v) => !v)} className="p-1.5 rounded-lg bg-gray-100 active:bg-gray-200">
          {fullScreen
            ? <Minimize2 size={14} color="#374151" />
            : <Maximize2 size={14} color="#374151" />}
        </Pressable>
      </View>

      {/* Zoom dropdown */}
      {showZoomMenu && (
        <View className="absolute right-12 top-12 bg-white border border-gray-100 rounded-xl py-1 z-50"
          style={{ shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 8, minWidth: 80 }}
        >
          {ZOOM_PRESETS.map((pct) => (
            <Pressable key={pct} onPress={() => { setScale(pct / 100); setShowZoomMenu(false) }} className="px-4 py-2 active:bg-gray-50">
              <Text className={`text-sm ${pct === zoomPct ? 'text-violet-600 font-medium' : 'text-gray-700'}`}>{pct}%</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ── Canvas ──────────────────────────────────────────────────── */}
      {/* Outer container receives gesture events */}
      <View
        ref={canvasContainerRef}
        className="flex-1"
        style={Platform.OS === 'web' ? { cursor: canvasCursor } as never : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          horizontal
          scrollEventThrottle={16}
          contentContainerStyle={{ width: scaledW + 80, height: scaledH + 80 }}
          className="flex-1"
          style={{ backgroundColor: '#f8fafc' }}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          onScroll={(e) => {
            scrollPos.current = { x: e.nativeEvent.contentOffset.x, y: e.nativeEvent.contentOffset.y }
          }}
          onScrollEndDrag={(e) => {
            scrollPos.current = { x: e.nativeEvent.contentOffset.x, y: e.nativeEvent.contentOffset.y }
          }}
          // Disable native scroll during pan so our manual scroll takes over
          scrollEnabled={!isPanning}
        >
          <Svg width={scaledW} height={scaledH} viewBox={`0 0 ${canvasW} ${canvasH}`} style={{ margin: 40 }}>

            {/* Edges — coloured by source depth */}
            {edges.map((edge, i) => {
              const c = depthColor(edge.depth)
              return <Path key={i} d={bezierPath(edge)} stroke={c.stroke} strokeWidth={1.5} fill="none" opacity={0.5} />
            })}

            {/* Nodes */}
            {nodes.map((node) => {
              const isVirtualRoot = node.id === -1
              const isFocused = !isVirtualRoot && focusedId === node.id
              const isSelected = !isVirtualRoot && selectedIds.has(node.id)
              const isDraggingNode = !isVirtualRoot && renderDrag?.nodeId === node.id
              const isDropTarget = !isVirtualRoot && renderDrag?.dropTargetId === node.id
              const col = depthColor(node.depth)
              const rx = isVirtualRoot ? 14 : 10
              const indicatorX = node.x + node.w
              const indicatorMidY = node.y + node.h / 2

              return (
                <React.Fragment key={node.id}>
                  {/* Selection ring (drawn behind focus ring) */}
                  {isSelected && (
                    <Rect
                      x={node.x - 3} y={node.y - 3} width={node.w + 6} height={node.h + 6} rx={rx + 3}
                      fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.7}
                    />
                  )}
                  {/* Drop target glow ring */}
                  {isDropTarget && (
                    <Rect
                      x={node.x - 4} y={node.y - 4} width={node.w + 8} height={node.h + 8} rx={rx + 4}
                      fill="#7c3aed" fillOpacity={0.15} stroke="#7c3aed" strokeWidth={2.5}
                    />
                  )}

                  {/* Main node rect */}
                  <Rect
                    x={node.x} y={node.y} width={node.w} height={node.h} rx={rx}
                    fill={isDropTarget ? '#ede9fe' : col.bg}
                    stroke={isDropTarget ? '#7c3aed' : isFocused ? '#7c3aed' : isSelected ? '#3b82f6' : col.stroke}
                    strokeWidth={isDropTarget ? 2.5 : isFocused ? 2.5 : isSelected ? 2 : 1}
                    opacity={isDraggingNode ? 0.35 : 1}
                    onPress={() => {
                      if (isVirtualRoot) { handleRootPress(); return }
                      handleNodePress(node.id)
                    }}
                  />
                  {/* Focus ring */}
                  {isFocused && (
                    <Rect
                      x={node.x - 2} y={node.y - 2} width={node.w + 4} height={node.h + 4} rx={rx + 2}
                      fill="none" stroke="#7c3aed" strokeWidth={1} opacity={0.4}
                    />
                  )}
                  {/* Wrapped text lines */}
                  {node.lines.map((line, li) => (
                    <SvgText
                      key={li}
                      x={node.x + (node.hasChildren && !isVirtualRoot ? (node.w - INDICATOR_W) / 2 : node.w / 2)}
                      y={node.y + NODE_PAD_V + (li + 0.82) * LINE_H}
                      textAnchor="middle"
                      fontSize={isVirtualRoot ? ROOT_FONT : NODE_FONT}
                      fontWeight={isVirtualRoot ? 'bold' : isFocused ? 'bold' : 'normal'}
                      fill={col.text}
                      onPress={() => { if (isVirtualRoot) { handleRootPress(); return } handleNodePress(node.id) }}
                    >
                      {line}
                    </SvgText>
                  ))}

                  {/* Expand/Collapse indicator tab (> or <) */}
                  {node.hasChildren && !isVirtualRoot && (
                    <>
                      <Rect
                        x={indicatorX - INDICATOR_W / 2}
                        y={indicatorMidY - 12}
                        width={INDICATOR_W}
                        height={24}
                        rx={6}
                        fill={node.isExpanded ? col.stroke : '#fff'}
                        stroke={col.stroke}
                        strokeWidth={1}
                        onPress={() => toggleCollapse(node.id)}
                      />
                      <SvgText
                        x={indicatorX - INDICATOR_W / 2 + INDICATOR_W / 2}
                        y={indicatorMidY + 5}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight="bold"
                        fill={node.isExpanded ? '#fff' : col.stroke}
                        onPress={() => toggleCollapse(node.id)}
                      >
                        {node.isExpanded ? '<' : '>'}
                      </SvgText>
                    </>
                  )}
                </React.Fragment>
              )
            })}

            {/* Marquee selection rect */}
            {marquee && marquee.w > 4 && marquee.h > 4 && (
              <Rect
                x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                fill="#3b82f6" fillOpacity={0.08}
                stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3"
              />
            )}
          </Svg>
        </ScrollView>
      </View>

      {/* ── Gesture hint bar (web only) ──────────────────────────────── */}
      {Platform.OS === 'web' && (
        <View className="flex-row items-center gap-3 px-4 py-1.5 border-t border-gray-100 bg-gray-50">
          <Text className="text-[10px] text-gray-400">
            Drag leaf node → drop to reparent &nbsp;·&nbsp; Scroll: pan &nbsp;·&nbsp; Ctrl+scroll: zoom &nbsp;·&nbsp;
            Right-click node: menu &nbsp;·&nbsp; Right-drag or Space+drag: pan &nbsp;·&nbsp;
            Drag canvas: select &nbsp;·&nbsp; Ctrl+click: multi-select &nbsp;·&nbsp; F5/F6: drill in/out
          </Text>
        </View>
      )}

      {/* ── Context menu ────────────────────────────────────────────── */}
      {contextMenu && Platform.OS === 'web' && (() => {
        const cmNode = nodeMap.get(contextMenu.nodeId)
        const hasChildren = (cmNode?.children.length ?? 0) > 0
        const menuItems: { label: string; icon: string; action: () => void; danger?: boolean; disabled?: boolean }[] = [
          {
            label: 'Drill In',
            icon: '⇥',
            disabled: !hasChildren,
            action: () => { drillIn(contextMenu.nodeId); hideContextMenu() },
          },
          {
            label: 'Drill Out',
            icon: '⇤',
            disabled: drillPath.length === 0,
            action: () => { drillOut(); hideContextMenu() },
          },
          {
            label: 'Unfold All',
            icon: '⊞',
            action: () => { unfoldSubtree(contextMenu.nodeId); hideContextMenu() },
          },
          {
            label: 'Insert Child',
            icon: '+',
            action: () => {
              setNewChildParentId(contextMenu.nodeId)
              setNewChildText('')
              setTimeout(() => newChildInputRef.current?.focus(), 50)
              hideContextMenu()
            },
          },
          {
            label: 'Delete',
            icon: '✕',
            danger: true,
            action: async () => {
              hideContextMenu()
              await deleteTask(contextMenu.nodeId)
              setFocusedId(null)
            },
          },
        ]

        // Position menu anchored to node — prefer below-left of node, clamp to viewport
        const menuW = 180
        const menuH = menuItems.length * 40 + 8
        const winW = typeof window !== 'undefined' ? window.innerWidth : 800
        const winH = typeof window !== 'undefined' ? window.innerHeight : 600
        // Try to align left edge with node left, below the node
        let x = contextMenu.screenX
        let y = contextMenu.screenY + contextMenu.nodeH + 4
        // If it goes off the bottom, show above the node
        if (y + menuH > winH - 8) y = contextMenu.screenY - menuH - 4
        // Clamp horizontally
        x = Math.min(Math.max(x, 8), winW - menuW - 8)

        return (
          <View
            style={{
              position: 'fixed' as never,
              left: x,
              top: y,
              width: menuW,
              zIndex: 9999,
              backgroundColor: '#ffffff',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 16,
              elevation: 16,
              paddingVertical: 4,
            }}
          >
            {menuItems.map((item) => (
              <Pressable
                key={item.label}
                onPress={item.disabled ? undefined : item.action}
                style={{ opacity: item.disabled ? 0.35 : 1 }}
                className={`flex-row items-center gap-3 px-4 py-2.5 ${item.danger ? 'active:bg-red-50' : 'active:bg-gray-50'}`}
              >
                <Text style={{ fontSize: 14, width: 18, textAlign: 'center', color: item.danger ? '#ef4444' : '#6b7280' }}>
                  {item.icon}
                </Text>
                <Text style={{ fontSize: 13, color: item.danger ? '#ef4444' : '#111827', fontWeight: '500' }}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )
      })()}

      {/* ── Drag ghost (web only) ───────────────────────────────────── */}
      {renderDrag && Platform.OS === 'web' && (
        <View style={{
          position: 'fixed' as never,
          left: renderDrag.screenX + 14,
          top: renderDrag.screenY - 20,
          zIndex: 9999,
          pointerEvents: 'none' as never,
          backgroundColor: 'white',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderWidth: 1.5,
          borderColor: '#7c3aed',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 8,
          maxWidth: 200,
        }}>
          <Text style={{ fontSize: 12, color: '#1f2937', fontWeight: '500' }} numberOfLines={1}>
            {renderDrag.label}
          </Text>
          {renderDrag.dropTargetId != null && (
            <Text style={{ fontSize: 10, color: '#7c3aed', marginTop: 2 }}>↳ move here</Text>
          )}
        </View>
      )}

      {/* ── New child input (Tab) ──────────────────────────────────── */}
      {newChildParentId != null && (
        <View
          className="absolute bottom-6 bg-white rounded-xl border-2 border-violet-400"
          style={{
            left: '50%', transform: [{ translateX: -160 }], width: 320,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 12,
          }}
        >
          <Text className="text-xs text-violet-500 font-semibold px-3 pt-2">
            New child of "{nodeMap.get(newChildParentId)
              ? stripMarkdown(nodeMap.get(newChildParentId)!.content).slice(0, 28)
              : '…'}"
          </Text>
          <TextInput
            ref={newChildInputRef}
            value={newChildText}
            onChangeText={setNewChildText}
            placeholder="Task name…"
            placeholderTextColor="#9ca3af"
            className="px-3 py-2 text-sm text-gray-800"
            autoFocus
            onSubmitEditing={submitNewChild}
            onKeyPress={(e) => {
              if (e.nativeEvent.key === 'Escape') { setNewChildParentId(null); setNewChildText('') }
            }}
            blurOnSubmit={false}
          />
          <View className="flex-row justify-end gap-2 px-3 pb-2">
            <Pressable onPress={() => { setNewChildParentId(null); setNewChildText('') }}>
              <Text className="text-xs text-gray-400 py-1">Esc to cancel</Text>
            </Pressable>
            <Pressable onPress={submitNewChild} className="px-3 py-1 bg-violet-500 rounded-lg active:bg-violet-600">
              <Text className="text-xs text-white font-medium">Add ↵</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  )

  return content
}
