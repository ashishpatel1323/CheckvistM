import '../src/global.css'
import { useEffect } from 'react'
import { Linking, View } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/queryClient'
import { useAuth } from '@/auth/useAuth'
import { ToastProvider } from '@/components/Toast'
import { useRoutineStore } from '@/features/tasks/routines/useRoutineStore'
import { initAutoSync, stopAutoSync } from '@/lib/sync/autoSync'
import { registerTaskHandlers } from '@/lib/sync/taskSyncHandlers'
import { initClientIdentity } from '@/platform/clientIdentity'
import { desktopRole, isDesktop } from '@/platform/desktopBridge'
import { FloatingApp } from '@/features/pomodoro/FloatingApp'

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
        const { routines, toggleStep } = useRoutineStore.getState()
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

  return (
    <GestureHandlerRootView className="flex-1">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppInitializer />
          <WidgetDeepLinkHandler />
          <StatusBar style="light" />
          {mainDragStrip && (
            <View {...{ dataSet: { cvDrag: 'true' } }} style={{ height: 28, paddingLeft: 72 }} />
          )}
          <Stack screenOptions={{ headerShown: false }} />
        </ToastProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout
