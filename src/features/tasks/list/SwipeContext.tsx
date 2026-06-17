import { createContext, useContext, useState, useCallback } from 'react'

interface SwipeContextType {
  openSwipeId: number | null
  setOpenSwipeId: (id: number | null) => void
  closeOtherSwipes: (id: number) => void
}

const SwipeContext = createContext<SwipeContextType | undefined>(undefined)

export function SwipeProvider({ children }: { children: React.ReactNode }) {
  const [openSwipeId, setOpenSwipeId] = useState<number | null>(null)

  const closeOtherSwipes = useCallback((id: number) => {
    setOpenSwipeId((current) => (current === id ? id : null))
  }, [])

  return (
    <SwipeContext.Provider value={{ openSwipeId, setOpenSwipeId, closeOtherSwipes }}>
      {children}
    </SwipeContext.Provider>
  )
}

export function useSwipeContext() {
  const context = useContext(SwipeContext)
  if (!context) {
    throw new Error('useSwipeContext must be used within SwipeProvider')
  }
  return context
}
