import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, useWindowDimensions, Platform, Modal } from 'react-native'
import Svg, { Path, Rect, Text as SvgText, TSpan } from 'react-native-svg'
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

// ─── Markdown SVG spans ───────────────────────────────────────────────────────
// Parse a single line of markdown into styled TSpan segments
type MdSpan = { text: string; bold?: boolean; italic?: boolean; strike?: boolean }

function parseMdLine(line: string): MdSpan[] {
  const spans: MdSpan[] = []
  // Regex: bold (**), italic (*), strikethrough (~~)
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|~~(.+?)~~|([^*~]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m[2] != null)      spans.push({ text: m[2], bold: true })
    else if (m[3] != null) spans.push({ text: m[3], italic: true })
    else if (m[4] != null) spans.push({ text: m[4], strike: true })
    else if (m[5] != null) spans.push({ text: m[5] })
  }
  return spans.length ? spans : [{ text: line }]
}

// Render a single SVG text line with inline markdown styling
function MdSvgLine({ line, x, y, fontSize, baseFill }: {
  line: string; x: number; y: number; fontSize: number; baseFill: string
}) {
  const spans = parseMdLine(line)
  if (spans.length === 1 && !spans[0].bold && !spans[0].italic && !spans[0].strike) {
    return (
      <SvgText x={x} y={y} textAnchor="middle" fontSize={fontSize} fill={baseFill}>
        {spans[0].text}
      </SvgText>
    )
  }
  return (
    <SvgText x={x} y={y} textAnchor="middle" fontSize={fontSize} fill={baseFill}>
      {spans.map((s, i) => (
        <TSpan
          key={i}
          fontWeight={s.bold ? 'bold' : 'normal'}
          fontStyle={s.italic ? 'italic' : 'normal'}
          textDecoration={s.strike ? 'line-through' : 'none'}
        >{s.text}</TSpan>
      ))}
    </SvgText>
  )
}

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

// Tapered filled polygon: thick at origin, thin at target
function taperedPath({ x1, y1, x2, y2 }: PlacedEdge, thickW = 4.5, thinW = 1): string {
  const mx = (x1 + x2) / 2
  const hw1 = thickW / 2
  const hw2 = thinW / 2
  const top = `M ${x1} ${y1 - hw1} C ${mx} ${y1 - hw1} ${mx} ${y2 - hw2} ${x2} ${y2 - hw2}`
  const bot = `L ${x2} ${y2 + hw2} C ${mx} ${y2 + hw2} ${mx} ${y1 + hw1} ${x1} ${y1 + hw1} Z`
  return top + ' ' + bot
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
  initialFocusId?: number | null
}

export function MindMapView({ tasks, checklistId, focusedId, setFocusedId, initialFocusId }: MindMapViewProps) {
  const { width: screenW, height: screenH } = useWindowDimensions()
  const { activeChecklistId } = useActiveChecklist()
  const { data: checklists } = useChecklists()
  const checklistName = checklists?.find((c) => c.id === activeChecklistId)?.name ?? 'Tasks'

  const [scale, setScale] = useState(1)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const [drillPath, setDrillPath] = useState<number[]>([])

  const [showShortcuts, setShowShortcuts] = useState(false)

  const [newChildParentId, setNewChildParentId] = useState<number | null>(null)
  const [newChildText, setNewChildText] = useState('')
  const newChildInputRef = useRef<TextInput>(null)

  // Inline editing on double-click
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState('')
  const editInputRef = useRef<TextInput>(null)
  const lastPressTimes = useRef<Map<number, number>>(new Map())
  const { mutateAsync: createTask } = useCreateTask(checklistId)
  const createTaskRef = useRef(createTask)
  useEffect(() => { createTaskRef.current = createTask }, [createTask])
  const { mutateAsync: deleteTask } = useDeleteTask(checklistId)
  const deleteTaskRef = useRef(deleteTask)
  useEffect(() => { deleteTaskRef.current = deleteTask }, [deleteTask])
  const { mutate: updateTaskMutate } = useUpdateTask(checklistId)
  const updateTaskRef = useRef(updateTaskMutate)
  useEffect(() => { updateTaskRef.current = updateTaskMutate }, [updateTaskMutate])

  const toast = useToast()
  const toastRef = useRef(toast)
  useEffect(() => { toastRef.current = toast }, [toast])

  // Cut/copy/paste clipboard (stores a subtree snapshot)
  interface ClipboardNode { id: number; content: string; children: ClipboardNode[] }
  const [clipboard, setClipboard] = useState<{ nodes: ClipboardNode[]; isCut: boolean } | null>(null)
  const clipboardRef = useRef(clipboard)
  useEffect(() => { clipboardRef.current = clipboard }, [clipboard])

  function snapshotSubtree(nodeId: number): ClipboardNode | null {
    const n = nodeMap.get(nodeId)
    if (!n) return null
    return { id: n.id, content: n.content, children: n.children.map((c) => snapshotSubtree(c.id)!).filter(Boolean) }
  }

  async function pasteSubtree(node: ClipboardNode, parentId: number | null): Promise<void> {
    const created = await createTaskRef.current({ content: node.content, ...(parentId != null ? { parent_id: parentId } : {}) })
    for (const child of node.children) {
      await pasteSubtree(child, created.id)
    }
  }

  // Drag state for leaf-node reparenting (web only)
  interface RenderDrag { nodeId: number; label: string; screenX: number; screenY: number; dropTargetId: number | null }
  const [renderDrag, setRenderDrag] = useState<RenderDrag | null>(null)
  const dragRef = useRef<{ nodeId: number; label: string; startX: number; startY: number; active: boolean; dropTargetId: number | null } | null>(null)

  // ─── Context menu ─────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number; nodeId: number } | null>(null)
  const contextMenuRef = useRef(contextMenu)
  useEffect(() => { contextMenuRef.current = contextMenu }, [contextMenu])
  const hideContextMenu = useCallback(() => setContextMenu(null), [])

  // ─── Gesture state (web) ─────────────────────────────────────────────────
  const scrollViewRef = useRef<ScrollView>(null)
  const scrollPos = useRef({ x: 0, y: 0 })
  // pan: right-click drag or space+left-drag
  const panRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  // pending right-click: decides between context menu (no drag) and pan (drag)
  const rightClickRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number; nodeId: number | null } | null>(null)
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

  // On mount, drill into the parent of initialFocusId so the task is visible and focused
  const didInitialFocus = useRef(false)
  useEffect(() => {
    if (didInitialFocus.current || !initialFocusId || nodeMap.size === 0) return
    didInitialFocus.current = true

    // Build ancestor chain: walk up via parentId
    const ancestorPath: number[] = []
    let cur = nodeMap.get(initialFocusId)
    while (cur?.parent_id != null) {
      ancestorPath.unshift(cur.parent_id)
      cur = nodeMap.get(cur.parent_id)
    }

    // Drill into the direct parent so the task appears as a top-level node in the drilled view
    if (ancestorPath.length > 0) {
      setDrillPath(ancestorPath)
      // Uncollapse every node along the ancestor path
      setCollapsed((prev) => {
        const next = new Set(prev)
        ancestorPath.forEach((id) => next.delete(id))
        return next
      })
    }
    setFocusedId(initialFocusId)
  }, [initialFocusId, nodeMap, setFocusedId])

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
    if (newChildParentId == null || !newChildText.trim()) { setNewChildParentId(null); return }
    if (newChildParentId === -1) {
      // Root-level task (Add Parent shortcut)
      await createTask({ content: newChildText.trim() })
    } else {
      setCollapsed((prev) => { const n = new Set(prev); n.delete(newChildParentId); return n })
      await createTask({ content: newChildText.trim(), parent_id: newChildParentId })
      setFocusedId(newChildParentId)
    }
    setNewChildParentId(null)
    setNewChildText('')
  }, [newChildParentId, newChildText, createTask, setFocusedId])

  // Virtual root press: single-click drills out (if drilled in)
  const handleRootPress = useCallback(() => {
    if (drillPath.length > 0) drillOut()
  }, [drillPath.length, drillOut])

  const submitEdit = useCallback(async () => {
    if (editingNodeId == null) return
    const text = editingText.trim()
    setEditingNodeId(null)
    if (text && text !== nodeMap.get(editingNodeId)?.content) {
      updateTaskRef.current({ taskId: editingNodeId, payload: { content: text } })
    }
  }, [editingNodeId, editingText, nodeMap])

  // Node press: single-click focuses, double-click opens inline edit, Ctrl+click multi-selects
  const handleNodePress = useCallback((id: number) => {
    if (ctrlHeld.current) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
      return
    }
    const now = Date.now()
    const last = lastPressTimes.current.get(id) ?? 0
    lastPressTimes.current.set(id, now)
    if (now - last < 400) {
      // double-click: open inline edit
      const node = nodeMap.get(id)
      if (node) { setEditingText(node.content); setEditingNodeId(id) }
      return
    }
    setFocusedId(id)
  }, [setFocusedId, nodeMap])

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

      // Pre-order DFS traversal so parent always precedes children and siblings are consecutive
      const nodeIdSet = new Set(nodes.filter((n) => n.id !== -1).map((n) => n.id))
      const orderedIds: number[] = []
      function preOrder(tasks: typeof visibleRoots) {
        for (const t of tasks) {
          if (!nodeIdSet.has(t.id)) continue
          orderedIds.push(t.id)
          if (!collapsed.has(t.id) && t.children.length > 0) preOrder(t.children)
        }
      }
      preOrder(visibleRoots)
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
        if (editingNodeId != null) { setEditingNodeId(null); return }
        if (showShortcuts) { setShowShortcuts(false) }
        else if (selectedIds.size > 0) setSelectedIds(new Set())
        else if (fullScreen) setFullScreen(false)
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setSelectedIds(new Set(nodes.filter((n) => n.id !== -1).map((n) => n.id)))
      } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setShowShortcuts((v) => !v)
      } else if (e.key === 'c' && (e.metaKey || e.ctrlKey) && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        const snap = snapshotSubtree(focusedId)
        if (snap) { setClipboard({ nodes: [snap], isCut: false }); toastRef.current.success('Copied') }
      } else if (e.key === 'x' && (e.metaKey || e.ctrlKey) && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        const snap = snapshotSubtree(focusedId)
        if (snap) {
          setClipboard({ nodes: [snap], isCut: true })
          setFocusedIdRef.current(null)
          deleteTaskRef.current(focusedId)
          toastRef.current.success('Cut')
        }
      } else if (e.key === 'v' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); e.stopPropagation()
        const cb = clipboardRef.current
        if (!cb) return
        const pasteParentId = focusedIdRef.current
        ;(async () => {
          try {
            for (const node of cb.nodes) await pasteSubtree(node, pasteParentId)
            if (pasteParentId != null) {
              setCollapsed((prev) => { const n = new Set(prev); n.delete(pasteParentId); return n })
            }
            toastRef.current.success('Pasted')
            if (cb.isCut) setClipboard(null)
          } catch {
            toastRef.current.error('Paste failed')
          }
        })()
      } else if (e.key === 'Delete' && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        const idToDelete = focusedId
        setFocusedIdRef.current(null)
        deleteTaskRef.current(idToDelete)
      } else if (e.key === 'F2' && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        const node = nodeMap.get(focusedId)
        if (node) { setEditingText(node.content); setEditingNodeId(focusedId) }
        setTimeout(() => editInputRef.current?.focus(), 50)
      } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        // Add sibling: create task under same parent
        const node = nodeMap.get(focusedId)
        const parentId = node?.parent_id ?? null
        setNewChildParentId(parentId ?? focusedId)
        setNewChildText('')
        setTimeout(() => newChildInputRef.current?.focus(), 50)
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        // Add parent task (create new root-level task, focus it)
        setNewChildParentId(-1) // sentinel: root-level
        setNewChildText('')
        setTimeout(() => newChildInputRef.current?.focus(), 50)
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
  }, [nodes, focusedId, setFocusedId, collapsed, nodeMap, drillIn, drillOut, newChildInputRef, fullScreen, selectedIds, showShortcuts])

  // ─── Web DOM gesture events ───────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const el = canvasContainerRef.current as unknown as HTMLElement
    if (!el) return
    // Make `el` (canvasContainerRef's DOM div) the scroll container for both axes.
    // Setting inline style directly on the DOM element beats any RN-applied styles.
    el.style.overflow = 'scroll'
    el.style.backgroundColor = '#f8fafc'
    const syncScroll = () => { scrollPos.current = { x: el.scrollLeft, y: el.scrollTop } }
    el.addEventListener('scroll', syncScroll, { passive: true })
    const getSvEl = (): HTMLElement | null => el

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
        // Find hit node at click position
        const rect = el.getBoundingClientRect()
        const cx = (e.clientX - rect.left + scrollPos.current.x - 40) / scaleRef.current
        const cy = (e.clientY - rect.top + scrollPos.current.y - 40) / scaleRef.current
        const hit = nodesRef.current.find(
          (n) => n.id !== -1 && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h
        )
        // Record pending — mousemove decides pan vs menu
        rightClickRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          scrollX: scrollPos.current.x,
          scrollY: scrollPos.current.y,
          nodeId: hit?.id ?? null,
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
        const cx = (e.clientX - rect.left + scrollPos.current.x - 40) / scaleRef.current
        const cy = (e.clientY - rect.top + scrollPos.current.y - 40) / scaleRef.current
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
        const cx = (e.clientX - rect.left + scrollPos.current.x - 40) / scaleRef.current
        const cy = (e.clientY - rect.top + scrollPos.current.y - 40) / scaleRef.current
        marqueeStartRef.current = { x: cx, y: cy }
        setMarquee({ x: cx, y: cy, w: 0, h: 0 })
        if (!e.ctrlKey && !e.metaKey) setSelectedIds(new Set())
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      // Pending right-click: promote to pan if moved > 5px
      if (rightClickRef.current && !panRef.current) {
        const dx = e.clientX - rightClickRef.current.startX
        const dy = e.clientY - rightClickRef.current.startY
        if (Math.sqrt(dx * dx + dy * dy) > 5) {
          panRef.current = {
            startX: rightClickRef.current.startX,
            startY: rightClickRef.current.startY,
            scrollX: rightClickRef.current.scrollX,
            scrollY: rightClickRef.current.scrollY,
          }
          rightClickRef.current = null
          setIsPanning(true)
        }
      }

      // Handle leaf drag
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX
        const dy = e.clientY - dragRef.current.startY
        if (!dragRef.current.active && Math.sqrt(dx * dx + dy * dy) > 5) {
          dragRef.current.active = true
        }
        if (dragRef.current.active) {
          const rect = el.getBoundingClientRect()
          const cx = (e.clientX - rect.left + scrollPos.current.x - 40) / scaleRef.current
          const cy = (e.clientY - rect.top + scrollPos.current.y - 40) / scaleRef.current
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
          scrollPos.current = { x: sv.scrollLeft, y: sv.scrollTop }
        }
        return
      }
      if (marqueeStartRef.current) {
        const rect = el.getBoundingClientRect()
        const cx = (e.clientX - rect.left + scrollPos.current.x - 40) / scaleRef.current
        const cy = (e.clientY - rect.top + scrollPos.current.y - 40) / scaleRef.current
        setMarquee({
          x: Math.min(marqueeStartRef.current.x, cx),
          y: Math.min(marqueeStartRef.current.y, cy),
          w: Math.abs(cx - marqueeStartRef.current.x),
          h: Math.abs(cy - marqueeStartRef.current.y),
        })
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
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

      // Right-click released without dragging → show context menu
      if (rightClickRef.current) {
        const { nodeId } = rightClickRef.current
        rightClickRef.current = null
        if (nodeId !== null) {
          // Right-clicked a node: focus it and show node menu
          setFocusedIdRef.current(nodeId)
          setContextMenu({ screenX: e.clientX, screenY: e.clientY, nodeId })
        } else {
          // Right-clicked blank canvas: show global menu (nodeId = -1 sentinel)
          setContextMenu({ screenX: e.clientX, screenY: e.clientY, nodeId: -1 })
        }
        return
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
      el.removeEventListener('scroll', syncScroll)
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

        {/* Shortcuts help */}
        <Pressable onPress={() => setShowShortcuts(true)} className="p-1.5 rounded-lg bg-gray-100 active:bg-gray-200">
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', width: 14, textAlign: 'center' }}>?</Text>
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
        {/* SVG canvas — rendered once, shared between web div and native ScrollView */}
        {(() => {
          const svgCanvas = (
            <Svg width={scaledW} height={scaledH} viewBox={`0 0 ${canvasW} ${canvasH}`} style={{ margin: 40 }}>
              {edges.map((edge, i) => {
                const c = depthColor(edge.depth)
                return <Path key={i} d={taperedPath(edge)} fill={c.stroke} stroke="none" opacity={0.45} />
              })}
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
                    {isSelected && (
                      <Rect x={node.x - 3} y={node.y - 3} width={node.w + 6} height={node.h + 6} rx={rx + 3}
                        fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.7} />
                    )}
                    {isDropTarget && (
                      <Rect x={node.x - 4} y={node.y - 4} width={node.w + 8} height={node.h + 8} rx={rx + 4}
                        fill="#7c3aed" fillOpacity={0.15} stroke="#7c3aed" strokeWidth={2.5} />
                    )}
                    <Rect
                      x={node.x} y={node.y} width={node.w} height={node.h} rx={rx}
                      fill={isDropTarget ? '#ede9fe' : col.bg}
                      stroke={isDropTarget ? '#7c3aed' : isFocused ? '#7c3aed' : isSelected ? '#3b82f6' : col.stroke}
                      strokeWidth={isDropTarget ? 2.5 : isFocused ? 2.5 : isSelected ? 2 : 1}
                      opacity={isDraggingNode ? 0.35 : 1}
                      onPress={() => { if (isVirtualRoot) { handleRootPress(); return } handleNodePress(node.id) }}
                    />
                    {isFocused && (
                      <Rect x={node.x - 2} y={node.y - 2} width={node.w + 4} height={node.h + 4} rx={rx + 2}
                        fill="none" stroke="#7c3aed" strokeWidth={1} opacity={0.4} />
                    )}
                    {node.lines.map((line, li) => (
                      <MdSvgLine
                        key={li}
                        line={line}
                        x={node.x + (node.hasChildren && !isVirtualRoot ? (node.w - INDICATOR_W) / 2 : node.w / 2)}
                        y={node.y + NODE_PAD_V + (li + 0.82) * LINE_H}
                        fontSize={isVirtualRoot ? ROOT_FONT : NODE_FONT}
                        baseFill={col.text}
                      />
                    ))}
                    {node.hasChildren && !isVirtualRoot && (
                      <>
                        <Rect
                          x={indicatorX - INDICATOR_W / 2} y={indicatorMidY - 12}
                          width={INDICATOR_W} height={24} rx={6}
                          fill={node.isExpanded ? col.stroke : '#fff'} stroke={col.stroke} strokeWidth={1}
                          onPress={() => toggleCollapse(node.id)}
                        />
                        <SvgText
                          x={indicatorX} y={indicatorMidY + 5}
                          textAnchor="middle" fontSize={10} fontWeight="bold"
                          fill={node.isExpanded ? '#fff' : col.stroke}
                          onPress={() => toggleCollapse(node.id)}
                        >{node.isExpanded ? '<' : '>'}</SvgText>
                      </>
                    )}
                  </React.Fragment>
                )
              })}
              {marquee && marquee.w > 4 && marquee.h > 4 && (
                <Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                  fill="#3b82f6" fillOpacity={0.08} stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" />
              )}
            </Svg>
          )

          if (Platform.OS === 'web') {
            // canvasContainerRef (el) is made scrollable via el.style.overflow='scroll' in useEffect.
            // Just render a sized content div so el has something to scroll against.
            return (
              <View style={{ width: scaledW + 80, height: scaledH + 80 }}>
                {svgCanvas}
              </View>
            )
          }
          return (
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
            >
              {svgCanvas}
            </ScrollView>
          )
        })()}
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
        const isGlobal = contextMenu.nodeId === -1
        const cmNode = isGlobal ? null : nodeMap.get(contextMenu.nodeId)
        const hasChildren = (cmNode?.children.length ?? 0) > 0

        type MenuItem = { label: string; icon: string; action: () => void; danger?: boolean; disabled?: boolean }
        const menuItems: MenuItem[] = isGlobal
          ? [
              {
                label: 'Fold All',
                icon: '▸',
                action: () => { setCollapsed(new Set(allParentIds)); hideContextMenu() },
              },
              {
                label: 'Unfold All',
                icon: '▾',
                action: () => { setCollapsed(new Set()); hideContextMenu() },
              },
              {
                label: 'Fit Screen',
                icon: '⊡',
                action: () => {
                  const el2 = canvasContainerRef.current as unknown as HTMLElement | null
                  if (el2) {
                    const { width, height } = el2.getBoundingClientRect()
                    const fitScale = Math.min(width / (canvasW + 80), height / (canvasH + 80), 1)
                    setScale(Math.max(0.2, fitScale))
                  }
                  hideContextMenu()
                },
              },
            ]
          : [
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
                label: 'Edit',
                icon: '✎',
                action: () => {
                  const n = nodeMap.get(contextMenu.nodeId)
                  if (n) { setEditingText(n.content); setEditingNodeId(contextMenu.nodeId) }
                  hideContextMenu()
                  setTimeout(() => editInputRef.current?.focus(), 50)
                },
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
                label: 'Copy',
                icon: '⎘',
                action: () => {
                  const snap = snapshotSubtree(contextMenu.nodeId)
                  if (snap) { setClipboard({ nodes: [snap], isCut: false }); toast.success('Copied') }
                  hideContextMenu()
                },
              },
              {
                label: 'Cut',
                icon: '✂',
                action: async () => {
                  const snap = snapshotSubtree(contextMenu.nodeId)
                  if (snap) {
                    setClipboard({ nodes: [snap], isCut: true })
                    hideContextMenu()
                    await deleteTask(contextMenu.nodeId)
                    setFocusedId(null)
                    toast.success('Cut')
                  } else { hideContextMenu() }
                },
              },
              {
                label: 'Paste',
                icon: '⎙',
                disabled: clipboard == null,
                action: async () => {
                  hideContextMenu()
                  if (!clipboard) return
                  try {
                    for (const node of clipboard.nodes) await pasteSubtree(node, contextMenu.nodeId)
                    setCollapsed((prev) => { const n = new Set(prev); n.delete(contextMenu.nodeId); return n })
                    toast.success('Pasted')
                    if (clipboard.isCut) setClipboard(null)
                  } catch { toast.error('Paste failed') }
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

        // Clamp menu to viewport, appear at cursor position
        const menuW = 180
        const menuH = menuItems.length * 40 + 8
        const winW = typeof window !== 'undefined' ? window.innerWidth : 800
        const winH = typeof window !== 'undefined' ? window.innerHeight : 600
        let x = Math.min(Math.max(contextMenu.screenX, 8), winW - menuW - 8)
        let y = contextMenu.screenY
        if (y + menuH > winH - 8) y = contextMenu.screenY - menuH - 4

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

      {/* ── Shortcuts dialog ────────────────────────────────────────── */}
      {showShortcuts && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowShortcuts(false)}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => setShowShortcuts(false)}
          >
            <Pressable onPress={(e) => e.stopPropagation()} style={{
              backgroundColor: '#1a1a2e',
              borderRadius: 16,
              width: 460,
              maxWidth: '90%',
              paddingHorizontal: 28,
              paddingVertical: 24,
            }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#ffffff' }}>Shortcuts</Text>
                <Pressable onPress={() => setShowShortcuts(false)} style={{
                  width: 32, height: 32, borderRadius: 8, backgroundColor: '#2d2d44',
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <Text style={{ color: '#9ca3af', fontSize: 16, fontWeight: '600' }}>✕</Text>
                </Pressable>
              </View>

              {/* Subtitle */}
              <Text style={{ fontSize: 13, color: '#f59e0b', textAlign: 'center', marginBottom: 20, fontWeight: '500' }}>
                Press Shift + / to show this dialog again
              </Text>

              {/* Divider */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#2d2d44', paddingBottom: 8, marginBottom: 4 }}>
                <Text style={{ flex: 1, color: '#6b7280', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Action</Text>
                <Text style={{ color: '#6b7280', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>Shortcut</Text>
              </View>

              {/* Rows */}
              {[
                { action: 'Edit Node', keys: ['F2'] },
                { action: 'Copy', keys: ['⌘', '+', 'C'] },
                { action: 'Cut', keys: ['⌘', '+', 'X'] },
                { action: 'Paste', keys: ['⌘', '+', 'V'] },
                { action: 'Add Child', keys: ['Tab'] },
                { action: 'Add Parent', keys: ['⌘', '+', 'Enter'] },
                { action: 'Add Sibling', keys: ['Enter'] },
                { action: 'Remove', keys: ['Delete'] },
                { action: 'Drill In', keys: ['F5'] },
                { action: 'Drill Out', keys: ['F6'] },
                { action: 'Navigate', keys: ['↑', '↓', '←', '→'] },
                { action: 'Zoom', keys: ['+', '−'] },
                { action: 'Select All', keys: ['⌘', '+', 'A'] },
                { action: 'Pan', keys: ['Space', '+', 'drag'] },
              ].map(({ action, keys }, i) => (
                <View key={action} style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: i < 9 ? 1 : 0,
                  borderColor: '#2d2d44',
                  backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                }}>
                  <Text style={{ color: '#e5e7eb', fontSize: 14, fontWeight: '500' }}>{action}</Text>
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                    {keys.map((k, ki) =>
                      k === '+' || k === '−' && keys.length > 1 && ki > 0 && ki < keys.length - 1
                        ? <Text key={ki} style={{ color: '#6b7280', fontSize: 12, marginHorizontal: 2 }}>{k}</Text>
                        : <View key={ki} style={{
                            backgroundColor: '#2d2d44', borderRadius: 6,
                            paddingHorizontal: 10, paddingVertical: 4,
                            borderWidth: 1, borderColor: '#3d3d5c',
                          }}>
                            <Text style={{ color: '#e5e7eb', fontSize: 12, fontWeight: '600', fontFamily: 'monospace' }}>{k}</Text>
                          </View>
                    )}
                  </View>
                </View>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Inline new-child node (Tab / Insert Child) ── */}
      {newChildParentId != null && (() => {
        const parentNode = newChildParentId === -1 ? null : nodes.find((n) => n.id === newChildParentId)
        const scrollEl = canvasContainerRef.current as unknown as HTMLElement | null
        const containerRect = scrollEl?.getBoundingClientRect()

        // Position: to the right of the parent (child level), vertically centred on parent
        const childDepth = parentNode ? parentNode.depth + 1 : 1
        const nodeCanvasX = PAD + RW + HG + (childDepth - 1) * (NW + HG)
        const nodeCanvasY = parentNode
          ? parentNode.y + parentNode.h / 2 - (NODE_PAD_V * 2 + LINE_H) / 2
          : PAD
        const nodeCanvasH = NODE_PAD_V * 2 + LINE_H
        const nodeCanvasW = NW

        const screenX = containerRect
          ? nodeCanvasX * scale - (scrollEl?.scrollLeft ?? 0) + containerRect.left + 40 // +40 for the SVG margin
          : nodeCanvasX * scale
        const screenY = containerRect
          ? nodeCanvasY * scale - (scrollEl?.scrollTop ?? 0) + containerRect.top + 40
          : nodeCanvasY * scale

        // Use depth colour for the new node
        const col = depthColor(childDepth)
        const nodeW = nodeCanvasW * scale
        const nodeH = Math.max(nodeCanvasH * scale, 34)

        const vpW = typeof window !== 'undefined' ? window.innerWidth : 800
        const vpH = typeof window !== 'undefined' ? window.innerHeight : 600
        const clampedX = Math.min(Math.max(screenX, 8), vpW - nodeW - 8)
        const clampedY = Math.min(Math.max(screenY, 8), vpH - nodeH - 8)

        return (
          <View
            style={{
              position: 'fixed' as never,
              left: clampedX, top: clampedY,
              width: nodeW, height: nodeH,
              backgroundColor: col.bg,
              borderRadius: 10, borderWidth: 2.5, borderColor: col.stroke,
              shadowColor: col.stroke, shadowOpacity: 0.35, shadowRadius: 10, elevation: 12,
              zIndex: 9998,
              justifyContent: 'center',
            }}
          >
            <TextInput
              ref={newChildInputRef}
              value={newChildText}
              onChangeText={setNewChildText}
              placeholder="New node…"
              placeholderTextColor={col.stroke + '88'}
              autoFocus
              onSubmitEditing={submitNewChild}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Escape') { setNewChildParentId(null); setNewChildText('') }
              }}
              blurOnSubmit
              style={{
                fontSize: NODE_FONT * scale,
                color: col.text,
                paddingHorizontal: NODE_PAD_H * scale,
                paddingVertical: 0,
                textAlign: 'center',
              }}
            />
          </View>
        )
      })()}

      {/* ── Inline edit overlay (double-click / F2) — overlays the node itself ── */}
      {editingNodeId != null && Platform.OS === 'web' && (() => {
        const editNode = nodes.find((n) => n.id === editingNodeId)
        if (!editNode) return null
        const scrollEl = canvasContainerRef.current as unknown as HTMLElement | null
        const containerRect = scrollEl?.getBoundingClientRect()
        const screenX = containerRect
          ? editNode.x * scale - (scrollEl?.scrollLeft ?? 0) + containerRect.left + 40
          : editNode.x * scale
        const screenY = containerRect
          ? editNode.y * scale - (scrollEl?.scrollTop ?? 0) + containerRect.top + 40
          : editNode.y * scale
        const nodeW = editNode.w * scale
        const nodeH = editNode.h * scale
        const col = depthColor(editNode.depth)
        return (
          <View style={{
            position: 'fixed' as never,
            left: screenX, top: screenY,
            width: nodeW, height: nodeH,
            backgroundColor: col.bg,
            borderRadius: 10, borderWidth: 2.5, borderColor: col.stroke,
            shadowColor: col.stroke, shadowOpacity: 0.4, shadowRadius: 12, elevation: 14,
            zIndex: 9999,
            justifyContent: 'center',
          }}>
            <TextInput
              ref={editInputRef}
              value={editingText}
              onChangeText={setEditingText}
              placeholder="Task name…"
              placeholderTextColor={col.stroke + '88'}
              autoFocus
              style={{
                fontSize: NODE_FONT * scale,
                color: col.text,
                paddingHorizontal: NODE_PAD_H * scale,
                paddingVertical: 0,
                textAlign: 'center',
              }}
              onSubmitEditing={submitEdit}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Escape') { setEditingNodeId(null) }
              }}
              blurOnSubmit
            />
          </View>
        )
      })()}
    </View>
  )

  return content
}
