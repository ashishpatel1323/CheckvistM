import { useEffect, useCallback } from 'react'
import { ScrollView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import type { GroupedTasks } from '@/lib/dateSort'
import type { TaskNode } from '@/lib/taskTree'
import { TaskGroup } from './TaskGroup'
import { useExpandedIds } from './useExpandedIds'
import { useUpdateTask } from './useTasksQuery'

interface VirtualTaskListProps {
  groups: GroupedTasks[]
  checklistId: number
  isMobile: boolean
  focusedId: number | null
  setFocusedId: (id: number | null) => void
}

function flattenVisible(groups: GroupedTasks[], expanded: Set<number>): number[] {
  const ids: number[] = []
  function add(task: TaskNode) {
    ids.push(task.id)
    if (expanded.has(task.id)) task.children.forEach(add)
  }
  for (const group of groups) group.tasks.forEach(add)
  return ids
}

function buildNodeMap(groups: GroupedTasks[]): Map<number, TaskNode> {
  const map = new Map<number, TaskNode>()
  function add(task: TaskNode) { map.set(task.id, task); task.children.forEach(add) }
  groups.forEach((g) => g.tasks.forEach(add))
  return map
}

// Ordered sibling ids (by Checkvist `position`) sharing the focused task's parent —
// used to swap-reorder with Cmd/Ctrl+Arrow, mirroring the Execute tab's reorder model.
function siblingIds(nodeMap: Map<number, TaskNode>, groups: GroupedTasks[], taskId: number): number[] {
  const node = nodeMap.get(taskId)
  if (!node) return []
  const parentId = node.parent_id
  let pool: TaskNode[]
  if (parentId != null && nodeMap.has(parentId)) {
    pool = nodeMap.get(parentId)!.children
  } else {
    pool = groups.flatMap((g) => g.tasks).filter((t) => t.parent_id == null || !nodeMap.has(t.parent_id))
  }
  return [...pool].sort((a, b) => a.position - b.position).map((t) => t.id)
}

function scrollToTask(id: number) {
  setTimeout(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).querySelector(`[data-task-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, 30)
}

export function VirtualTaskList({ groups, checklistId, isMobile, focusedId, setFocusedId }: VirtualTaskListProps) {
  const router = useRouter()
  const seed = useExpandedIds((s) => s.seed)
  const expand = useExpandedIds((s) => s.expand)
  const collapse = useExpandedIds((s) => s.collapse)
  const { mutate: updateTask } = useUpdateTask(checklistId)

  // Seed expansion state from localStorage on mount
  useEffect(() => {
    const ids: number[] = []
    function collect(task: TaskNode) { ids.push(task.id); task.children.forEach(collect) }
    groups.forEach((g) => g.tasks.forEach(collect))
    seed(ids)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleKey = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

    const { expanded } = useExpandedIds.getState()
    const nodeMap = buildNodeMap(groups)
    const ordered = flattenVisible(groups, expanded)

    if (e.key === 'Escape') {
      setFocusedId(null)
      return
    }

    // Cmd/Ctrl+Up/Down: swap the focused task with its adjacent sibling and
    // persist the new order — mirrors the Execute tab's reorder shortcut.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && focusedId != null) {
      e.preventDefault()
      const sibs = siblingIds(nodeMap, groups, focusedId)
      const idx = sibs.indexOf(focusedId)
      const delta = e.key === 'ArrowUp' ? -1 : 1
      const otherIdx = idx + delta
      if (idx < 0 || otherIdx < 0 || otherIdx >= sibs.length) return
      const taskA = nodeMap.get(sibs[idx])
      const taskB = nodeMap.get(sibs[otherIdx])
      if (!taskA || !taskB) return
      const posA = taskA.position
      const posB = taskB.position
      updateTask({ taskId: taskA.id, payload: { position: posB } })
      updateTask({ taskId: taskB.id, payload: { position: posA } })
      return
    }

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
  }, [groups, focusedId, setFocusedId, expand, collapse, router, checklistId, updateTask])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [handleKey])

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}>
      {groups.map((group) => (
        <TaskGroup
          key={group.group}
          group={group}
          checklistId={checklistId}
          isMobile={isMobile}
          focusedId={focusedId}
        />
      ))}
    </ScrollView>
  )
}
