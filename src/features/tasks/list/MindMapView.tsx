import { useMemo, useState, useCallback, useEffect } from 'react'
import { View, Text, Pressable, ScrollView, useWindowDimensions, Platform } from 'react-native'
import Svg, { Path, Rect, Text as SvgText, G } from 'react-native-svg'
import { useRouter } from 'expo-router'
import type { CheckvistTask } from '@/api/types'
import type { TaskNode } from '@/lib/taskTree'
import { buildTaskTree } from '@/lib/taskTree'
import { stripMarkdown } from '@/components/InlineMarkdown'
import { useChecklists } from '@/features/checklists/useChecklists'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'

// ─── Layout constants ────────────────────────────────────────────────────────
const RW = 220
const RH = 60
const NW = 180
const NH = 36
const HG = 72
const VG = 12
const RG = 28
const PAD = 48
const TOGGLE_R = 10

// On Android, SVG renders to a bitmap of width×height — large scale = OOM. Cap at 100%.
const ZOOM_PRESETS = Platform.OS === 'web'
  ? [500, 400, 300, 200, 150, 120, 100, 80, 50, 20, 10]
  : [100, 80, 50, 20, 10]
const ORANGE = '#E8632A'

// ─── Types ───────────────────────────────────────────────────────────────────
interface PlacedNode {
  task: TaskNode | null
  id: number
  label: string
  x: number; y: number; w: number; h: number
  depth: number
  hasRealChildren: boolean
}
interface PlacedEdge { x1: number; y1: number; x2: number; y2: number }

// ─── Layout ──────────────────────────────────────────────────────────────────
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
    const hasRealChildren = task.children.length > 0

    if (hasRealChildren && !isCollapsed) {
      const childMids: number[] = []
      for (const child of task.children) childMids.push(place(child, depth + 1))
      const myMid = (childMids[0] + childMids[childMids.length - 1]) / 2
      const y = myMid - NH / 2
      nodes.push({ task, id: task.id, label: stripMarkdown(task.content), x, y, w: NW, h: NH, depth, hasRealChildren })
      for (const child of task.children) {
        const cn = nodes.find((n) => n.id === child.id)!
        edges.push({ x1: x + NW, y1: myMid, x2: cn.x, y2: cn.y + NH / 2 })
      }
      return myMid
    } else {
      const y = nextLeafY
      nextLeafY += NH + VG
      nodes.push({ task, id: task.id, label: stripMarkdown(task.content), x, y, w: NW, h: NH, depth, hasRealChildren })
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
  const vrX = PAD
  const vrY = centerY - RH / 2
  nodes.push({ task: null, id: -1, label: rootLabel, x: vrX, y: vrY, w: RW, h: RH, depth: 0, hasRealChildren: visibleRoots.length > 0 })

  for (const root of visibleRoots) {
    const rn = nodes.find((n) => n.id === root.id)!
    edges.push({ x1: vrX + RW, y1: centerY, x2: rn.x, y2: rn.y + NH / 2 })
  }

  const canvasW = nodes.length > 0 ? Math.max(...nodes.map((n) => n.x + n.w)) + PAD : PAD * 2
  const canvasH = nodes.length > 0 ? Math.max(...nodes.map((n) => n.y + n.h)) + PAD : PAD * 2
  return { nodes, edges, canvasW, canvasH }
}

function bezierPath({ x1, y1, x2, y2 }: PlacedEdge): string {
  const mx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`
}

function nodeFill(node: PlacedNode): string {
  if (!node.task) return ORANGE
  const p = node.task.priority
  if (p <= 0) return '#f8fafc'
  if (p <= 3) return '#fef2f2'
  if (p <= 6) return '#fffbeb'
  return '#f0fdf4'
}

function nodeStroke(node: PlacedNode): string {
  if (!node.task) return ORANGE
  const p = node.task.priority
  if (p <= 0) return '#e2e8f0'
  if (p <= 3) return '#fca5a5'
  if (p <= 6) return '#fcd34d'
  return '#86efac'
}

// ─── Component ───────────────────────────────────────────────────────────────
interface MindMapViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  focusedId: number | null
  setFocusedId: (id: number | null) => void
}

export function MindMapView({ tasks, checklistId, focusedId, setFocusedId }: MindMapViewProps) {
  const router = useRouter()
  const { width: screenW, height: screenH } = useWindowDimensions()

  const { activeChecklistId } = useActiveChecklist()
  const { data: checklists } = useChecklists()
  const checklistName = checklists?.find((c) => c.id === activeChecklistId)?.name ?? 'Tasks'

  const [scale, setScale] = useState(1)
  const [showZoomMenu, setShowZoomMenu] = useState(false)

  // drillPath: stack of node IDs we've drilled into (F5 pushes, F6 pops)
  const [drillPath, setDrillPath] = useState<number[]>([])

  const { allNodes, roots } = useMemo(() => buildTaskTree(tasks), [tasks])

  // Build a flat id→node map for O(1) lookup
  const nodeMap = useMemo(() => {
    const m = new Map<number, TaskNode>()
    allNodes.forEach((n) => m.set(n.id, n))
    return m
  }, [allNodes])

  // Start all parents collapsed to keep initial SVG bitmap small (avoids Android OOM)
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    const tree = buildTaskTree(tasks)
    return new Set(tree.allNodes.filter((n) => n.children.length > 0).map((n) => n.id))
  })

  // Resolve visible roots based on drill stack
  const { visibleRoots, rootLabel } = useMemo(() => {
    if (drillPath.length === 0) return { visibleRoots: roots, rootLabel: checklistName }
    const drillId = drillPath[drillPath.length - 1]
    const drillNode = nodeMap.get(drillId)
    if (!drillNode) return { visibleRoots: roots, rootLabel: checklistName }
    return {
      visibleRoots: drillNode.children,
      rootLabel: stripMarkdown(drillNode.content),
    }
  }, [drillPath, roots, nodeMap, checklistName])

  const { nodes, edges, canvasW, canvasH } = useMemo(
    () => computeLayout(visibleRoots, collapsed, rootLabel),
    [visibleRoots, collapsed, rootLabel]
  )

  const allParentIds = useMemo(
    () => new Set(allNodes.filter((n) => n.children.length > 0).map((n) => n.id)),
    [allNodes]
  )
  const allFolded = allParentIds.size > 0 && collapsed.size === allParentIds.size

  const toggleFoldAll = useCallback(() => {
    setCollapsed((prev) => prev.size === allParentIds.size ? new Set() : new Set(allParentIds))
  }, [allParentIds])

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
    // Ensure the node is expanded so its children are visible after drill
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setDrillPath((p) => [...p, id])
    setFocusedId(null)
  }, [nodeMap, setFocusedId])

  const drillOut = useCallback(() => {
    setDrillPath((p) => {
      if (p.length === 0) return p
      const newPath = p.slice(0, -1)
      // Restore focus to the node we just drilled out of
      setFocusedId(p[p.length - 1])
      return newPath
    })
  }, [setFocusedId])

  // ─── Keyboard navigation (web only) ─────────────────────────────────────────
  // ArrowUp/Down  — move focus among visible nodes (by vertical position)
  // ArrowRight    — expand collapsed node, or focus first child
  // ArrowLeft     — collapse expanded node, or focus parent
  // F5            — drill into focused node (XMind classic behaviour)
  // F6            — drill out one level
  // Enter         — open task detail
  // +/-           — zoom in/out
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
          // Expand collapsed node
          setCollapsed((prev) => { const n = new Set(prev); n.delete(focusedId); return n })
        } else if (node.children.length > 0) {
          // Already expanded — move focus to first child if visible
          const firstChild = orderedIds.find((id) => node.children.some((c) => c.id === id))
          if (firstChild != null) setFocusedId(firstChild)
        }

      } else if (e.key === 'ArrowLeft' && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        const node = nodeMap.get(focusedId)
        if (!node) return
        if (node.children.length > 0 && !collapsed.has(focusedId)) {
          // Collapse expanded node
          setCollapsed((prev) => new Set(prev).add(focusedId))
        } else if (node.parent_id != null) {
          // Move focus to parent
          const parentNode = nodeMap.get(node.parent_id)
          if (parentNode) setFocusedId(parentNode.id)
        }

      } else if (e.key === 'F5') {
        e.preventDefault(); e.stopPropagation()
        if (focusedId != null) drillIn(focusedId)

      } else if (e.key === 'F6') {
        e.preventDefault(); e.stopPropagation()
        drillOut()

      } else if (e.key === 'Enter' && focusedId != null) {
        e.preventDefault(); e.stopPropagation()
        router.push(`/${checklistId}/tasks/${focusedId}`)

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
      }
    }

    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [nodes, focusedId, setFocusedId, collapsed, nodeMap, drillIn, drillOut, checklistId, router])

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

  return (
    <View className="flex-1">
      {/* Toolbar */}
      <View className="flex-row items-center gap-2 px-3 py-1.5 border-b border-gray-100 bg-white">
        {/* Drill breadcrumb / fold all */}
        {drillPath.length > 0 ? (
          <Pressable
            onPress={drillOut}
            className="flex-row items-center gap-1.5 px-3 py-1.5 bg-orange-50 active:bg-orange-100 rounded-lg border border-orange-200"
          >
            <Text className="text-sm text-orange-700 font-medium">← Drill Out</Text>
            {drillPath.length > 1 && (
              <Text className="text-xs text-orange-400">({drillPath.length} levels)</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={toggleFoldAll}
            className="flex-row items-center gap-1.5 px-3 py-1.5 bg-gray-100 active:bg-gray-200 rounded-lg"
          >
            <Text className="text-sm text-gray-700 font-medium">
              {allFolded ? 'Unfold All' : 'Fold All'}
            </Text>
          </Pressable>
        )}

        <View className="flex-1" />

        {/* Keyboard hint (web only) */}
        {Platform.OS === 'web' && (
          <Text className="text-xs text-gray-400 hidden md:flex">
            F5 drill in · F6 drill out · ↑↓ navigate · ←→ expand/collapse
          </Text>
        )}

        {/* Zoom */}
        <View className="relative">
          <Pressable
            onPress={() => setShowZoomMenu((v) => !v)}
            className="flex-row items-center gap-1 px-3 py-1.5 bg-gray-100 active:bg-gray-200 rounded-lg"
          >
            <Text className="text-sm text-gray-700 font-medium">{zoomPct}%</Text>
          </Pressable>
          {showZoomMenu && (
            <View className="absolute right-0 top-8 bg-white border border-gray-100 rounded-xl py-1 z-50"
              style={{ shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 8, minWidth: 80 }}
            >
              {ZOOM_PRESETS.map((pct) => (
                <Pressable
                  key={pct}
                  onPress={() => { setScale(pct / 100); setShowZoomMenu(false) }}
                  className="px-4 py-2 active:bg-gray-50"
                >
                  <Text className={`text-sm ${pct === zoomPct ? 'text-orange-600 font-medium' : 'text-gray-700'}`}>
                    {pct}%
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Scrollable canvas */}
      <ScrollView
        horizontal
        scrollEventThrottle={16}
        contentContainerStyle={{ width: scaledW + 80, height: scaledH + 80 }}
        className="flex-1 bg-gray-50"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <Svg
          width={scaledW}
          height={scaledH}
          viewBox={`0 0 ${canvasW} ${canvasH}`}
          style={{ margin: 40 }}
        >
          {/* Edges */}
          {edges.map((edge, i) => (
            <Path key={i} d={bezierPath(edge)} stroke="#cbd5e1" strokeWidth={1.5} fill="none" />
          ))}

          {/* Nodes */}
          {nodes.map((node) => {
            const isVirtualRoot = node.id === -1
            const isCollapsed = node.id !== -1 && collapsed.has(node.id)
            const isDrillRoot = drillPath.length > 0 && isVirtualRoot
            const rx = isVirtualRoot ? 12 : 8
            const isNodeFocused = !isVirtualRoot && focusedId === node.id

            return (
              <G key={node.id}>
                <Rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  rx={rx}
                  fill={isNodeFocused ? '#fff7ed' : nodeFill(node)}
                  stroke={isNodeFocused ? ORANGE : isDrillRoot ? '#f97316' : nodeStroke(node)}
                  strokeWidth={isVirtualRoot ? (isDrillRoot ? 2 : 0) : isNodeFocused ? 2 : 1}
                  onPress={() => {
                    if (isVirtualRoot) return
                    setFocusedId(node.id)
                    router.push(`/${checklistId}/tasks/${node.id}`)
                  }}
                />

                {/* Label */}
                <SvgText
                  x={node.x + node.w / 2}
                  y={node.y + node.h / 2 + 5}
                  textAnchor="middle"
                  fontSize={isVirtualRoot ? 14 : 12}
                  fontWeight={isVirtualRoot ? 'bold' : 'normal'}
                  fill={isVirtualRoot ? 'white' : '#1f2937'}
                  onPress={() => {
                    if (isVirtualRoot) return
                    setFocusedId(node.id)
                    router.push(`/${checklistId}/tasks/${node.id}`)
                  }}
                >
                  {node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label}
                </SvgText>

                {/* Collapse toggle */}
                {node.hasRealChildren && !isVirtualRoot && (
                  <G>
                    <Rect
                      x={node.x + node.w - TOGGLE_R * 2}
                      y={node.y + node.h / 2 - TOGGLE_R}
                      width={TOGGLE_R * 2}
                      height={TOGGLE_R * 2}
                      rx={TOGGLE_R}
                      fill={isCollapsed ? ORANGE : '#e2e8f0'}
                      onPress={() => toggleCollapse(node.id)}
                    />
                    <SvgText
                      x={node.x + node.w - TOGGLE_R}
                      y={node.y + node.h / 2 + 5}
                      textAnchor="middle"
                      fontSize={12}
                      fontWeight="bold"
                      fill={isCollapsed ? 'white' : '#64748b'}
                      onPress={() => toggleCollapse(node.id)}
                    >
                      {isCollapsed ? '+' : '−'}
                    </SvgText>
                  </G>
                )}
              </G>
            )
          })}
        </Svg>
      </ScrollView>
    </View>
  )
}
