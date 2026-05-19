import '../src/global.css'
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/queryClient'
import { useAuth } from '@/auth/useAuth'
import { ToastProvider } from '@/components/Toast'

function AuthInitializer() {
  const initFromStorage = useAuth((s) => s.initFromStorage)
  useEffect(() => { initFromStorage() }, [initFromStorage])
  return null
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView className="flex-1">
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthInitializer />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </ToastProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}
