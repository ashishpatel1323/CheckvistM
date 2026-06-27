import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  mode: ThemeMode
  /** The effective resolved theme (never 'system' — computed). */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
  /** Called by ThemeProvider whenever the OS color scheme changes — passes in the system value. */
  syncSystem: (system: 'light' | 'dark') => void
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'system',
      resolved: 'light',

      setMode: (mode) => {
        // If on web, read system preference without using the hook (safe at call time)
        const system = getSystemScheme()
        const resolved = mode === 'system' ? system : mode
        set({ mode, resolved })
        applyThemeClass(resolved)
      },

      syncSystem: (system) => {
        const { mode } = get()
        if (mode === 'system') {
          set({ resolved: system })
          applyThemeClass(system)
        }
      },
    }),
    {
      name: 'app-theme',
      storage,
      partialize: (s) => ({ mode: s.mode }),
      // onRehydrateStorage is called after the persisted state is loaded.
      // It must return a function (post-hydration callback) for zustand v4.
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const system = getSystemScheme()
        const resolved = state.mode === 'system' ? system : state.mode
        state.resolved = resolved
        applyThemeClass(resolved)
      },
    }
  )
)

/** Safe system preference check — not a hook, works outside React. */
function getSystemScheme(): 'light' | 'dark' {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

/** Apply/remove the `dark` class on the root element. */
function applyThemeClass(resolved: 'light' | 'dark') {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }
  // On native, the ThemeProvider wrapper View applies the class via className
}