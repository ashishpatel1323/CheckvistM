import '../src/global.css'
import { useEffect } from 'react'
import { Linking } from 'react-native'
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

function AppInitializer() {
  const initFromStorage = useAuth((s) => s.initFromStorage)

  useEffect(() => {
    initFromStorage()
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
  return (
    <GestureHandlerRootView className="flex-1">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppInitializer />
          <WidgetDeepLinkHandler />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </ToastProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default RootLayout
