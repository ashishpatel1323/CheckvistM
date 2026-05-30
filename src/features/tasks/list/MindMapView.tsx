import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { View, Text, Pressable, ScrollView, TextInput, useWindowDimensions, Platform, Modal } from 'react-native'
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg'
import type { CheckvistTask } from '@/api/types'
import type { TaskNode } from '@/lib/taskTree'
import { buildTaskTree } from '@/lib/taskTree'
import { stripMarkdown } from '@/components/InlineMarkdown'
import { useChecklists } from '@/features/checklists/useChecklists'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'
import { useCreateTask } from '@/features/tasks/list/useTasksQuery'
import { Maximize2, Minimize2, ChevronRight, ChevronLeft, ZoomIn, ZoomOut } from 'lucide-react-native'

// ─── Layout ──────────────────────────────────────────────────────────────────
const RW = 200   // virtual root width
const RH = 56    // virtual root height
const NW = 190   // node width
const NH = 40    // node height
const HG = 60    // horizontal gap between levels
const VG = 10    // vertical gap between siblings
const RG = 20    // extra gap between root groups
const PAD = 32
const INDICATOR_W = 24 // width of the >/< indicator tab

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

    if (isExpanded) {
      const childMids: number[] = []
      for (const child of task.children) childMids.push(place(child, depth + 1))
      const myMid = (childMids[0] + childMids[childMids.length - 1]) / 2
      const y = myMid - NH / 2
      nodes.push({ task, id: task.id, label: stripMarkdown(task.content), x, y, w: NW, h: NH, depth, hasChildren, isExpanded })
      for (const child of task.children) {
        const cn = nodes.find((n) => n.id === child.id)!
        edges.push({ x1: x + NW, y1: myMid, x2: cn.x, y2: cn.y + NH / 2, depth })
      }
      return myMid
    } else {
      const y = nextLeafY
      nextLeafY += NH + VG
      nodes.push({ task, id: task.id, label: stripMarkdown(task.content), x, y, w: NW, h: NH, depth, hasChildren, isExpanded })
      return y + NH / 2
    }
  }

  const rootMids: number[] = []
  for (let i = 0; i < visibleRoots.length; i++) {
    rootMids.push(place(visibleRoots[i], 1))
    if (i < visibleRoots.length - 1) nextLeafY += RG
  }

  const centerY = rootMids.length > 0
    ? (rootMids[0] + rootMids[rootMids.length - 1]) / 2
    : PAD + RH / 2
  nodes.push({
    task: null, id: -1, label: rootLabel,
    x: PAD, y: centerY - RH / 2, w: RW, h: RH,
    depth: 0, hasChildren: visibleRoots.length > 0, isExpanded: true,
  })
  for (const root of visibleRoots) {
    const rn = nodes.find((n) => n.id === root.id)!
    edges.push({ x1: PAD + RW, y1: centerY, x2: rn.x, y2: rn.y + NH / 2, depth: 0 })
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

  const submitNewChild = useCallback(async () => {
    if (!newChildParentId || !newChildText.trim()) { setNewChildParentId(null); return }
    setCollapsed((prev) => { const n = new Set(prev); n.delete(newChildParentId); return n })
    await createTask({ content: newChildText.trim(), parent_id: newChildParentId })
    setFocusedId(newChildParentId)
    setNewChildParentId(null)
    setNewChildText('')
  }, [newChildParentId, newChildText, createTask, setFocusedId])

  // ─── Keyboard navigation (web only) ──────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: KeyboardEvent) => {
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
        if (fullScreen) setFullScreen(false)
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [nodes, focusedId, setFocusedId, collapsed, nodeMap, drillIn, drillOut, newChildInputRef, fullScreen])

  const zoomPct = Math.round(scale * 100)
  const scaledW = canvasW * scale
  const scaledH = canvasH * scale

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
      <ScrollView
        horizontal
        scrollEventThrottle={16}
        contentContainerStyle={{ width: scaledW + 80, height: scaledH + 80 }}
        className="flex-1"
        style={{ backgroundColor: '#f8fafc' }}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
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
            const col = depthColor(node.depth)
            const rx = isVirtualRoot ? 14 : 10
            const indicatorX = node.x + node.w
            const indicatorMidY = node.y + node.h / 2

            return (
              <React.Fragment key={node.id}>
                {/* Main node rect */}
                <Rect
                  x={node.x} y={node.y} width={node.w} height={node.h} rx={rx}
                  fill={col.bg}
                  stroke={isFocused ? '#7c3aed' : col.stroke}
                  strokeWidth={isFocused ? 2.5 : 1}
                  onPress={() => { if (!isVirtualRoot) setFocusedId(node.id) }}
                />
                {/* Focus ring */}
                {isFocused && (
                  <Rect
                    x={node.x - 2} y={node.y - 2} width={node.w + 4} height={node.h + 4} rx={rx + 2}
                    fill="none" stroke="#7c3aed" strokeWidth={1} opacity={0.4}
                  />
                )}
                {/* Label */}
                <SvgText
                  x={node.x + (node.hasChildren && !isVirtualRoot ? (node.w - INDICATOR_W) / 2 : node.w / 2)}
                  y={node.y + node.h / 2 + 5}
                  textAnchor="middle"
                  fontSize={isVirtualRoot ? 13 : 11}
                  fontWeight={isVirtualRoot ? 'bold' : isFocused ? 'bold' : 'normal'}
                  fill={col.text}
                  onPress={() => { if (!isVirtualRoot) setFocusedId(node.id) }}
                >
                  {node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label}
                </SvgText>

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
        </Svg>
      </ScrollView>

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

