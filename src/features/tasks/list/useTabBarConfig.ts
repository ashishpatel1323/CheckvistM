import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TaskView } from './useTaskView'

export const DEFAULT_TAB_ORDER: TaskView[] = [
  'date', 'matrix', 'execute', 'progress', 'log', 'routines', 'list', 'mindmap', 'search', 'raw',
]

export const PINNED_TAB_COUNT = 4

interface TabBarConfigStore {
  order: TaskView[]
  moveTab: (key: TaskView, direction: 'up' | 'down') => void
  resetOrder: () => void
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useTabBarConfig = create<TabBarConfigStore>()(
  persist(
    (set) => ({
      order: DEFAULT_TAB_ORDER,
      moveTab: (key, direction) => set((state) => {
        const order = [...state.order]
        const idx = order.indexOf(key)
        const swapWith = direction === 'up' ? idx - 1 : idx + 1
        if (idx === -1 || swapWith < 0 || swapWith >= order.length) return state
        ;[order[idx], order[swapWith]] = [order[swapWith], order[idx]]
        return { order }
      }),
      resetOrder: () => set({ order: DEFAULT_TAB_ORDER }),
    }),
    { name: 'tab-bar-config', storage }
  )
)
