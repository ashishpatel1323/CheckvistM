import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type TaskView = 'date' | 'list' | 'mindmap' | 'search'

interface TaskViewStore {
  view: TaskView
  setView: (view: TaskView) => void
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useTaskView = create<TaskViewStore>()(
  persist(
    (set) => ({
      view: 'date',
      setView: (view) => set({ view }),
    }),
    { name: 'task-view', storage }
  )
)
