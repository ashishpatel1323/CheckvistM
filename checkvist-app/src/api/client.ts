import axios from 'axios'
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { getToken, setToken, clearToken } from '@/auth/tokenStore'

const AUTH_SKIP_PATHS = ['/auth/login.json', '/auth/refresh_token.json']

export const apiClient = axios.create({
  baseURL: 'https://checkvist.com',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor: append token query param
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const url = config.url ?? ''
  const skip = AUTH_SKIP_PATHS.some((path) => url.includes(path))
  if (!skip) {
    const token = getToken()
    if (token) {
      config.params = { ...config.params, token }
    }
  }
  return config
})

let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token))
  refreshSubscribers = []
}

// Response interceptor: handle 401 with token refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !originalRequest._retry) {
      const currentToken = getToken()
      if (!currentToken) {
        clearToken()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken: string) => {
            if (originalRequest.params) {
              originalRequest.params.token = newToken
            } else {
              originalRequest.params = { token: newToken }
            }
            resolve(apiClient(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const params = new URLSearchParams()
        params.append('version', '2')
        params.append('token', currentToken)

        const response = await axios.post<{ token: string }>(
          'https://checkvist.com/auth/refresh_token.json?version=2',
          params,
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        )

        const newToken = response.data.token
        setToken(newToken)
        isRefreshing = false
        onRefreshed(newToken)

        if (originalRequest.params) {
          originalRequest.params.token = newToken
        } else {
          originalRequest.params = { token: newToken }
        }

        return apiClient(originalRequest)
      } catch {
        isRefreshing = false
        refreshSubscribers = []
        clearToken()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)
