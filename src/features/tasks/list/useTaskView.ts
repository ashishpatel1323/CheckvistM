import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TaskView = 'date' | 'list' | 'mindmap'

interface TaskViewStore {
  view: TaskView
  setView: (view: TaskView) => void
}

export const useTaskView = create<TaskViewStore>()(
  persist(
    (set) => ({
      view: 'date',
      setView: (view) => set({ view }),
    }),
    { name: 'task-view' }
  )
)
