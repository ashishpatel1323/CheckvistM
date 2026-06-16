import { createContext, useContext } from 'react'
import type { TaskNode } from '@/lib/taskTree'

export interface OutlineOps {
  createSiblingAfter: (task: TaskNode) => void
  indentIn: (task: TaskNode) => void
  indentOut: (task: TaskNode) => void
  moveUp: (task: TaskNode) => void
  moveDown: (task: TaskNode) => void
  openDatePicker: (taskId: number) => void
}

const noop = () => {}

export const OutlineOpsContext = createContext<OutlineOps>({
  createSiblingAfter: noop,
  indentIn: noop,
  indentOut: noop,
  moveUp: noop,
  moveDown: noop,
  openDatePicker: noop,
})

export function useOutlineOps() {
  return useContext(OutlineOpsContext)
}
