import '../src/global.css'
import { useEffect, useRef } from 'react'
import { AppState, Linking, Platform, View, useColorScheme } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/queryClient'
import { useAuth } from '@/auth/useAuth'
import { ToastProvider } from '@/components/Toast'
import { useRoutine2Store } from '@/features/tasks/routines2/useRoutine2Store'
import { initAutoSync, stopAutoSync } from '@/lib/sync/autoSync'
import { registerTaskHandlers } from '@/lib/sync/taskSyncHandlers'
import { initClientIdentity } from '@/platform/clientIdentity'
import { desktopRole, isDesktop } from '@/platform/desktopBridge'
import { FloatingApp } from '@/features/pomodoro/FloatingApp'
import { useTheme } from '@/features/settings/useTheme'

// TEXTNODE-DEBUG: temporary interceptor to surface the React component stack for the
// "Unexpected text node" warning. Remove once the offending file:line is found.
if (typeof window !== 'undefined') {
  const orig = console.error
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Unexpected text node')) {
      orig('TEXTNODE-DEBUG', ...args, new Error().stack)
    }
    orig(...args)
  }
}

// MacOSElectronApp floating window: load only the token from storage, no sync/router/menu-bar.
function FloatingAuthInit() {
  const initFromStorage = useAuth((s) => s.initFromStorage)
  useEffect(() => { initFromStorage() }, [initFromStorage])
  return null
}

function AppInitializer() {
  const initFromStorage = useAuth((s) => s.initFromStorage)

  useEffect(() => {
    initFromStorage()
    initClientIdentity().catch(console.warn)
  }, [initFromStorage])

  // Initialize offline-first sync system
  useEffect(() => {
    registerTaskHandlers()
    initAutoSync().catch(console.warn)
    return () => stopAutoSync()
  }, [])

  return null
}

/** Handles deep links fired by Android widgets (e.g. mark-step-done from Habits widget) */
function WidgetDeepLinkHandler() {
  useEffect(() => {
    function handle(url: string) {
      const parsed = new URL(url)
      if (parsed.hostname === 'mark-step-done') {
        const routineTaskId = Number(parsed.searchParams.get('routineTaskId'))
        const stepId = parsed.searchParams.get('stepId') ?? ''
        if (!routineTaskId || !stepId) return
        const { routines, toggleStep } = useRoutine2Store.getState()
        const routine = routines.find((r) => r.taskId === routineTaskId)
        if (routine) {
          toggleStep(routine, stepId).catch(console.warn)
        }
      }
    }

    // Handle cold-start URL
    Linking.getInitialURL().then((url) => { if (url) handle(url) })

    // Handle URL while app is running
    const sub = Linking.addEventListener('url', ({ url }) => handle(url))
    return () => sub.remove()
  }, [])
  return null
}

/** Wraps the app tree, applies the `dark` class on root for web, and keeps the effective
 *  theme in sync with OS changes when mode is 'system'. */
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const resolved = useTheme((s) => s.resolved)
  const syncSystem = useTheme((s) => s.syncSystem)
  const systemScheme = useColorScheme()
  const initialized = useRef(false)

  // Apply dark class on the web document root + the wrapper View gets className="dark"
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (resolved === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
    initialized.current = true
  }, [resolved])

  // Listen for OS color scheme changes (system mode) — native AppState
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncSystem(systemScheme ?? 'light')
    })
    return () => sub.remove()
  }, [syncSystem, systemScheme])

  // Also sync whenever systemScheme changes (react-native hook)
  useEffect(() => {
    if (initialized.current) syncSystem(systemScheme ?? 'light')
  }, [systemScheme, syncSystem])

  return (
    <View className={`flex-1 ${resolved === 'dark' ? 'dark' : ''}`} style={{ backgroundColor: 'hsl(var(--background))' }}>
      {children}
    </View>
  )
}

function RootLayout() {
  // In the Electron floating window, render the compact timer/Pomodoro UI instead of the
  // full app + router. Providers still wrap it so auth/createTask work.
  if (desktopRole() === 'floating') {
    return (
      <GestureHandlerRootView className="flex-1">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <FloatingAuthInit />
            <StatusBar style="dark" />
            <FloatingApp />
          </ToastProvider>
        </QueryClientProvider>
      </GestureHandlerRootView>
    )
  }

  // In the Electron main window, frameless content has no draggable region. Add a thin top
  // strip (data-cv-drag) clearing the traffic-light buttons so the window can be dragged.
  // Electron-only — web/iOS/Android never set the desktop role, so this renders nowhere else.
  const mainDragStrip = isDesktop() && desktopRole() === 'main'

  const resolved = useTheme((s) => s.resolved)
  const sbStyle = resolved === 'dark' ? 'light' : 'dark'

  return (
    <GestureHandlerRootView className="flex-1">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ThemeProvider>
            <AppInitializer />
            <WidgetDeepLinkHandler />
            <StatusBar style={sbStyle} />
            {mainDragStrip && (
              <View {...{ dataSet: { cvDrag: 'true' } }} style={{ height: 28, paddingLeft: 72 }} />
            )}
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </ToastProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout
