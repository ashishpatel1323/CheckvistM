import { create } from 'zustand'
import { getToken, setToken as storeToken, clearToken } from './tokenStore'
import { login as apiLogin } from '@/api/endpoints'

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
    const token = getToken()
    if (token) {
      set({ token, isAuthenticated: true })
    }
  },

  login: async (email: string, remoteKey: string) => {
    set({ isLoading: true, error: null })
    try {
      const { token } = await apiLogin(email, remoteKey)
      storeToken(token)
      set({
        token,
        user: { email },
        isAuthenticated: true,
        isLoading: false,
        error: null,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Check your credentials.'
      set({ isLoading: false, error: message, isAuthenticated: false })
      throw err
    }
  },

  logout: () => {
    clearToken()
    set({ token: null, user: null, isAuthenticated: false, error: null })
  },
}))
