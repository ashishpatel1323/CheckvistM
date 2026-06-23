import React from 'react'
import type { CheckvistTask } from '@/api/types'
import { MindElixirView } from '@/features/tasks/mindmap/MindElixirView'
import { useChecklists } from '@/features/checklists/useChecklists'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'

interface MindMapViewProps {
  tasks: CheckvistTask[]
  checklistId: number
  focusedId: number | null
  setFocusedId: (id: number | null) => void
  initialFocusId?: number | null
  /** If set, mindmap is rooted at this task's subtree (used by right-side panel). */
  rootTaskId?: number | null
  timerBar?: React.ReactNode
}

export function MindMapView({
  tasks, checklistId, focusedId, setFocusedId, initialFocusId, rootTaskId, timerBar,
}: MindMapViewProps) {
  const { activeChecklistId } = useActiveChecklist()
  const { data: checklists } = useChecklists()
  const checklistName = checklists?.find((c) => c.id === activeChecklistId)?.name ?? 'Tasks'

  return (
    <MindElixirView
      tasks={tasks}
      checklistId={checklistId}
      rootTaskId={rootTaskId ?? null}
      rootLabel={checklistName}
      focusedId={focusedId ?? initialFocusId ?? null}
      setFocusedId={setFocusedId}
      timerBar={timerBar}
    />
  )
}
