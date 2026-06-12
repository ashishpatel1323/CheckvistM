import { useMemo, useEffect, useCallback, useRef, useState } from 'react'
import { ScrollView, Platform, View, Text, Pressable } from 'react-native'
import type { CheckvistTask } from '@/api/types'
import type { TaskNode } from '@/lib/taskTree'
import { buildTaskTree } from '@/lib/taskTree'
import { OutlineRow } from './OutlineRow'
import { useExpandedIds } from './useExpandedIds'
import { DragProvider, useDragContext } from './DragContext'
import { DragGhost } from './DragGhost'
import { ChevronRight } from 'lucide-react-native'

interface FlatTaskListProps {
  tasks: CheckvistTask[]
  checklistId: number
  isMobile: boolean
  focusedId: number | null
  setFocusedId: (id: number | null) => void
}

function flattenVisible(roots: TaskNode[], expanded: Set<number>): number[] {
  const ids: number[] = []
  function traverse(task: TaskNode) {
    ids.push(task.id)
    if (expanded.has(task.id)) task.children.forEach(traverse)
  }
  roots.forEach(traverse)
  return ids
}

function buildNodeMap(nodes: TaskNode[]): Map<number, TaskNode> {
  const map = new Map<number, TaskNode>()
  function add(task: TaskNode) { map.set(task.id, task); task.children.forEach(add) }
  nodes.forEach(add)
  return map
}

function scrollToTask(id: number) {
  setTimeout(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).querySelector(`[data-task-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, 30)
}

interface BreadcrumbItem {
  id: number | null // null = root
  label: string
  children: TaskNode[]
}

interface InnerProps extends FlatTaskListProps {
  roots: TaskNode[]
  allNodes: TaskNode[]
}

const BLUE = '#4772FA'

function FlatTaskListInner({ roots, allNodes, checklistId, isMobile, focusedId, setFocusedId }: InnerProps) {
  const { draggingId, containerScreenY } = useDragContext()
  const seed = useExpandedIds((s) => s.seed)
  const expand = useExpandedIds((s) => s.expand)
  const collapse = useExpandedIds((s) => s.collapse)
  const containerRef = useRef<View>(null)

  // Breadcrumb stack: each entry is the "zoom level"
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  // Current roots to display
  const currentRoots = breadcrumbs.length > 0
    ? breadcrumbs[breadcrumbs.length - 1].children
    : roots

  useEffect(() => {
    seed(allNodes.map((n) => n.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const measureContainer = useCallback(() => {
    containerRef.current?.measureInWindow((x, y) => {
      containerScreenY.current = y
    })
  }, [containerScreenY])

  const nodeMap = useMemo(() => buildNodeMap(roots), [roots])

  const handleZoomIn = useCallback((task: TaskNode) => {
    if (!task.children.length) return
    setBreadcrumbs((prev) => [...prev, { id: task.id, label: task.content, children: task.children }])
    setFocusedId(null)
  }, [setFocusedId])

  const handleBreadcrumbNav = useCallback((index: number) => {
    // index -1 means go to root
    setBreadcrumbs((prev) => index < 0 ? [] : prev.slice(0, index + 1))
    setFocusedId(null)
  }, [setFocusedId])

  const handleKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

    const { expanded } = useExpandedIds.getState()
    const ordered = flattenVisible(currentRoots, expanded)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = focusedId != null ? ordered.indexOf(focusedId) : -1
      const next = ordered[idx + 1]
      if (next != null) { setFocusedId(next); scrollToTask(next) }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = focusedId != null ? ordered.indexOf(focusedId) : ordered.length
      const next = ordered[idx - 1]
      if (next != null) { setFocusedId(next); scrollToTask(next) }
    } else if (e.key === 'ArrowRight' && focusedId != null) {
      const node = nodeMap.get(focusedId)
      if (node?.children.length && !expanded.has(focusedId)) {
        e.preventDefault()
        expand(focusedId)
      }
    } else if (e.key === 'ArrowLeft' && focusedId != null) {
      if (expanded.has(focusedId)) {
        e.preventDefault()
        collapse(focusedId)
      } else {
        const node = nodeMap.get(focusedId)
        const parentId = node?.parent_id
        if (parentId) { e.preventDefault(); setFocusedId(parentId); scrollToTask(parentId) }
      }
    } else if (e.key === 'Escape' && breadcrumbs.length > 0) {
      e.preventDefault()
      handleBreadcrumbNav(breadcrumbs.length - 2)
    }
  }, [currentRoots, focusedId, setFocusedId, expand, collapse, nodeMap, breadcrumbs, handleBreadcrumbNav])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [handleKey])

  return (
    <View ref={containerRef} style={{ flex: 1, backgroundColor: '#FFFFFF' }} onLayout={measureContainer}>

      {/* Breadcrumb bar — shown when zoomed in */}
      {breadcrumbs.length > 0 && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: '#EFEFEF',
          gap: 2,
        }}>
          <Pressable onPress={() => handleBreadcrumbNav(-1)} hitSlop={8}>
            <Text style={{ fontSize: 13, color: '#6B7280' }}>
              Root
            </Text>
          </Pressable>
          {breadcrumbs.map((crumb, i) => (
            <View key={crumb.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <ChevronRight size={13} color="#C4C4C8" />
              <Pressable
                onPress={() => handleBreadcrumbNav(i)}
                hitSlop={8}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: i === breadcrumbs.length - 1 ? '#1C1C1E' : '#6B7280',
                    fontWeight: i === breadcrumbs.length - 1 ? '600' : '400',
                  }}
                  numberOfLines={1}
                >
                  {crumb.label}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Zoomed-in header — large title of current zoom root */}
      {breadcrumbs.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: '#1C1C1E', lineHeight: 28 }} numberOfLines={2}>
            {breadcrumbs[breadcrumbs.length - 1].label}
          </Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
        scrollEnabled={draggingId === null}
      >
        {currentRoots.map((task) => (
          <OutlineRow
            key={task.id}
            task={task}
            checklistId={checklistId}
            isMobile={isMobile}
            depth={0}
            focusedId={focusedId}
            onZoomIn={handleZoomIn}
          />
        ))}
      </ScrollView>
      <DragGhost />
    </View>
  )
}

export function FlatTaskList({ tasks, checklistId, isMobile, focusedId, setFocusedId }: FlatTaskListProps) {
  const { roots, allNodes } = useMemo(() => buildTaskTree(tasks), [tasks])

  return (
    <DragProvider>
      <FlatTaskListInner
        tasks={tasks}
        roots={roots}
        allNodes={allNodes}
        checklistId={checklistId}
        isMobile={isMobile}
        focusedId={focusedId}
        setFocusedId={setFocusedId}
      />
    </DragProvider>
  )
}
