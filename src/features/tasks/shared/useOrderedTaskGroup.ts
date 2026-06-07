import { useEffect, useMemo, useState } from 'react'
import type { CheckvistTask } from '@/api/types'
import { useUpdateTask } from '@/features/tasks/list/useTasksQuery'
import { useListKeyboardNav } from './useListKeyboardNav'

// Wraps a sub-list of tasks (e.g. one date group or one matrix quadrant) with a
// locally-persisted manual order plus the Execute-tab keyboard navigation model
// (↑/↓ to move the highlight, Cmd/Ctrl+↑/↓ or selection+↑/↓ to reorder, Esc to
// clear selection). Reordering is persisted back to Checkvist via the `position`
// field, scoped to this sub-list only.
export function useOrderedTaskGroup(tasks: CheckvistTask[], checklistId: number) {
  const { mutate: updateTask } = useUpdateTask(checklistId)

  const sortedByPosition = useMemo(
    () => [...tasks].sort((a, b) => a.position - b.position),
    [tasks]
  )

  const [orderedIds, setOrderedIds] = useState<number[]>([])
  useEffect(() => {
    setOrderedIds((prev) => {
      const newIds = sortedByPosition.map((t) => t.id)
      const kept = prev.filter((id) => newIds.includes(id))
      const added = newIds.filter((id) => !prev.includes(id))
      return [...kept, ...added]
    })
  }, [sortedByPosition])

  const orderedTasks = useMemo(
    () => orderedIds.map((id) => sortedByPosition.find((t) => t.id === id)).filter(Boolean) as CheckvistTask[],
    [orderedIds, sortedByPosition]
  )

  const [currentIndex, setCurrentIndex] = useState(0)
  useEffect(() => {
    setCurrentIndex((ci) => (ci >= orderedTasks.length ? Math.max(0, orderedTasks.length - 1) : ci))
  }, [orderedTasks.length])

  function persistOrder(newIds: number[]) {
    const sortedPositions = sortedByPosition.map((t) => t.position).sort((a, b) => a - b)
    newIds.forEach((id, idx) => {
      const task = sortedByPosition.find((t) => t.id === id)
      const newPos = sortedPositions[idx]
      if (task && task.position !== newPos) {
        updateTask({ taskId: id, payload: { position: newPos } })
      }
    })
  }

  const nav = useListKeyboardNav({
    ids: orderedIds,
    setIds: setOrderedIds,
    persist: persistOrder,
    currentIndex,
    setCurrentIndex,
  })

  return { orderedTasks, orderedIds, currentIndex, setCurrentIndex, ...nav }
}
