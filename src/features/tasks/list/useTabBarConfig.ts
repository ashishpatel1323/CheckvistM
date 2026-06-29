import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TaskView } from './useTaskView'

export const DEFAULT_TAB_ORDER: TaskView[] = [
  'execute', 'progress', 'routines', 'routines2', 'kanban', 'matrix', 'log', 'list', 'mindmap', 'search', 'raw',
]

// Tabs removed from the app — stripped from any persisted order on load.
const REMOVED_TABS: TaskView[] = ['date']

export const PINNED_TAB_COUNT = 4

interface TabBarConfigStore {
  order: TaskView[]
  /** Desktop: hide the inline tab strip, showing a breadcrumb instead. Persisted. */
  tabsCollapsed: boolean
  toggleTabsCollapsed: () => void
  moveTab: (key: TaskView, direction: 'up' | 'down') => void
  reorderTab: (from: number, to: number) => void
  resetOrder: () => void
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useTabBarConfig = create<TabBarConfigStore>()(
  persist(
    (set) => ({
      order: DEFAULT_TAB_ORDER,
      tabsCollapsed: false,
      toggleTabsCollapsed: () => set((state) => ({ tabsCollapsed: !state.tabsCollapsed })),
      moveTab: (key, direction) => set((state) => {
        const order = [...state.order]
        const idx = order.indexOf(key)
        const swapWith = direction === 'up' ? idx - 1 : idx + 1
        if (idx === -1 || swapWith < 0 || swapWith >= order.length) return state
        ;[order[idx], order[swapWith]] = [order[swapWith], order[idx]]
        return { order }
      }),
      reorderTab: (from, to) => set((state) => {
        if (from === to) return state
        const order = [...state.order]
        const [item] = order.splice(from, 1)
        order.splice(to, 0, item)
        return { order }
      }),
      resetOrder: () => set({ order: DEFAULT_TAB_ORDER }),
    }),
    {
      name: 'tab-bar-config',
      storage,
      version: 3,
      migrate: (persisted) => {
        const state = persisted as TabBarConfigStore | undefined
        if (!state) return state
        // Old 'execute2' tab was renamed to 'execute'; the old 'date' (List) tab was removed.
        const mapped = state.order
          .map((k) => ((k as string) === 'execute2' ? 'execute' : k))
          .filter((k) => !REMOVED_TABS.includes(k))
        let order = Array.from(new Set(mapped)) as TaskView[]
        if (!order.includes('execute')) order = ['execute', ...order]
        // v3: surface the new per-habit 'routines2' tab in any persisted order.
        if (!order.includes('routines2')) {
          const rIdx = order.indexOf('routines')
          if (rIdx === -1) order = [...order, 'routines2']
          else order = [...order.slice(0, rIdx + 1), 'routines2', ...order.slice(rIdx + 1)]
        }
        return { ...state, order }
      },
    }
  )
)
