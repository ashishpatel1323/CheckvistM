import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type TaskView = 'date' | 'kanban' | 'list' | 'mindmap' | 'search' | 'raw' | 'execute' | 'log' | 'routines' | 'matrix' | 'progress'

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
      view: 'date',
      focusedTaskId: null,
      setView: (view, taskId = null) => set({ view, focusedTaskId: taskId }),
    }),
    { name: 'task-view', storage }
  )
)
