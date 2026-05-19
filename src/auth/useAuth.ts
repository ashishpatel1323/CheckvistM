import { Platform } from 'react-native'
import { create } from 'zustand'
import {
  getToken,
  getTokenAsync,
  setToken as storeToken,
  setTokenAsync,
  clearToken,
  clearTokenAsync,
} from './tokenStore'
import { login as apiLogin } from '@/api/endpoints'
import { router } from 'expo-router'

interface User {
  email: string
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (email: string, remoteKey: string) => Promise<void>
  logout: () => void
  initFromStorage: () => void
}

export const useAuth = create<AuthState>()((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  initFromStorage: () => {
    if (Platform.OS === 'web') {
      const token = getToken()
      if (token) set({ token, isAuthenticated: true })
    } else {
      // Native: async init
      getTokenAsync().then((token) => {
        if (token) set({ token, isAuthenticated: true })
      })
    }
  },

  login: async (email: string, remoteKey: string) => {
    set({ isLoading: true, error: null })
    try {
      const { token } = await apiLogin(email, remoteKey)
      if (Platform.OS === 'web') {
        storeToken(token)
      } else {
        await setTokenAsync(token)
      }
      set({ token, user: { email }, isAuthenticated: true, isLoading: false, error: null })
      router.replace('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Check your credentials.'
      set({ isLoading: false, error: message, isAuthenticated: false })
      throw err
    }
  },

  logout: () => {
    if (Platform.OS === 'web') {
      clearToken()
    } else {
      clearTokenAsync()
    }
    set({ token: null, user: null, isAuthenticated: false, error: null })
    router.replace('/login')
  },
}))
