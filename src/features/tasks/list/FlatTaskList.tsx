import { useMemo, useEffect, useCallback, useRef } from 'react'
import { ScrollView, Platform, View } from 'react-native'
import { useRouter } from 'expo-router'
import type { CheckvistTask } from '@/api/types'
import type { TaskNode } from '@/lib/taskTree'
import { buildTaskTree } from '@/lib/taskTree'
import { OutlineRow } from './OutlineRow'
import { useExpandedIds } from './useExpandedIds'
import { DragProvider, useDragContext } from './DragContext'
import { DragGhost } from './DragGhost'

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

function buildNodeMap(roots: TaskNode[]): Map<number, TaskNode> {
  const map = new Map<number, TaskNode>()
  function add(task: TaskNode) { map.set(task.id, task); task.children.forEach(add) }
  roots.forEach(add)
  return map
}

function scrollToTask(id: number) {
  setTimeout(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).querySelector(`[data-task-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, 30)
}

interface InnerProps extends FlatTaskListProps {
  roots: TaskNode[]
  allNodes: TaskNode[]
}

function FlatTaskListInner({ roots, allNodes, checklistId, isMobile, focusedId, setFocusedId }: InnerProps) {
  const router = useRouter()
  const { draggingId, containerScreenY } = useDragContext()
  const seed = useExpandedIds((s) => s.seed)
  const expand = useExpandedIds((s) => s.expand)
  const collapse = useExpandedIds((s) => s.collapse)
  const containerRef = useRef<View>(null)

  useEffect(() => {
    seed(allNodes.map((n) => n.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Measure container screen Y for ghost positioning
  const measureContainer = useCallback(() => {
    containerRef.current?.measureInWindow((x, y) => {
      containerScreenY.current = y
    })
  }, [containerScreenY])

  const handleKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

    const { expanded } = useExpandedIds.getState()
    const nodeMap = buildNodeMap(roots)
    const ordered = flattenVisible(roots, expanded)

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
    } else if (e.key === 'Enter' && focusedId != null) {
      e.preventDefault()
      router.push(`/${checklistId}/tasks/${focusedId}`)
    }
  }, [roots, focusedId, setFocusedId, expand, collapse, router, checklistId])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [handleKey])

  return (
    <View ref={containerRef} style={{ flex: 1 }} onLayout={measureContainer}>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: '#F5F5F5' }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, paddingHorizontal: 12 }}
        scrollEnabled={draggingId === null}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          {roots.map((task, i) => (
            <View key={task.id}>
              {i > 0 && <View style={{ height: 1, backgroundColor: '#F5F5F5', marginLeft: 48 }} />}
              <OutlineRow
                task={task}
                checklistId={checklistId}
                isMobile={isMobile}
                depth={0}
                focusedId={focusedId}
              />
            </View>
          ))}
        </View>
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
