import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export interface TaskSettingsState {
  /** When true, task lists render in hierarchy mode (parents → children). When false, flat list. */
  hierarchyMode: boolean
  setHierarchyMode: (v: boolean) => void
  /** When true, capture screenshot on task completion. */
  screenshotEnabled: boolean
  setScreenshotEnabled: (v: boolean) => void
}

export const useTaskSettings = create<TaskSettingsState>()(
  persist(
    (set) => ({
      hierarchyMode: false, // default: flat (switcher = off)
      screenshotEnabled: false, // default: off

      setHierarchyMode: (v) => set({ hierarchyMode: v }),
      setScreenshotEnabled: (v) => set({ screenshotEnabled: v }),
    }),
    {
      name: 'app-task-settings',
      storage,
      partialize: (s) => ({ hierarchyMode: s.hierarchyMode, screenshotEnabled: s.screenshotEnabled }),
    }
  )
)