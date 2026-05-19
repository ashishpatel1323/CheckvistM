import { useMemo, useEffect, useCallback } from 'react'
import { ScrollView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import type { CheckvistTask } from '@/api/types'
import type { TaskNode } from '@/lib/taskTree'
import { buildTaskTree } from '@/lib/taskTree'
import { OutlineRow } from './OutlineRow'
import { useExpandedIds } from './useExpandedIds'

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

export function FlatTaskList({ tasks, checklistId, isMobile, focusedId, setFocusedId }: FlatTaskListProps) {
  const router = useRouter()
  const { roots, allNodes } = useMemo(() => buildTaskTree(tasks), [tasks])
  const seed = useExpandedIds((s) => s.seed)
  const expand = useExpandedIds((s) => s.expand)
  const collapse = useExpandedIds((s) => s.collapse)

  useEffect(() => {
    seed(allNodes.map((n) => n.id))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  return (
    <ScrollView className="flex-1" contentContainerClassName="px-3 py-3">
      {roots.map((task) => (
        <OutlineRow
          key={task.id}
          task={task}
          checklistId={checklistId}
          isMobile={isMobile}
          depth={0}
          focusedId={focusedId}
        />
      ))}
    </ScrollView>
  )
}
