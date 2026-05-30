import { useEffect, useCallback } from 'react'
import { ScrollView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import type { GroupedTasks } from '@/lib/dateSort'
import type { TaskNode } from '@/lib/taskTree'
import { TaskGroup } from './TaskGroup'
import { useExpandedIds } from './useExpandedIds'

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
  }, [groups, focusedId, setFocusedId, expand, collapse, router, checklistId])

  useEffect(() => {
    if (Platform.OS !== 'web') return
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [handleKey])

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-2 py-2">
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
