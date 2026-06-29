import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type TaskView = 'date' | 'kanban' | 'list' | 'mindmap' | 'search' | 'raw' | 'execute' | 'log' | 'routines' | 'routines2' | 'matrix' | 'progress' | 'settings'

interface TaskViewStore {
  view: TaskView
  focusedTaskId: number | null
  setView: (view: TaskView, taskId?: number | null) => void
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useTaskView = create<TaskViewStore>()(
  persist(
    (set) => ({
      view: 'execute',
      focusedTaskId: null,
      setView: (view, taskId = null) => set({ view, focusedTaskId: taskId }),
    }),
    {
      name: 'task-view',
      storage,
      version: 2,
      migrate: (persisted) => {
        const state = persisted as { view: string; focusedTaskId: number | null } | undefined
        if (!state) return state
        // Old 'execute2' renamed to 'execute'; old 'date' (List) tab removed — land on Execute.
        if (state.view === 'execute2' || state.view === 'date') return { ...state, view: 'execute' as TaskView }
        return state
      },
    }
  )
)
