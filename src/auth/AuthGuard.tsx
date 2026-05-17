import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, initFromStorage } = useAuth()

  useEffect(() => {
    initFromStorage()
  }, [initFromStorage])

  // After trying to load from storage
  const token = useAuth((s) => s.token)
  const storedToken = localStorage.getItem('cv_token')

  if (!isAuthenticated && !storedToken && token === null) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
