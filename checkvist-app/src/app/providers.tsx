import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuth } from '@/auth/useAuth'
import type { CheckvistTask, CheckvistChecklist } from '@/api/types'
import { cacheTasks, cacheLists, getCachedLists } from '@/lib/taskCache'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initFromStorage = useAuth((s) => s.initFromStorage)

  useEffect(() => {
    initFromStorage()
  }, [initFromStorage])

  return <>{children}</>
}

// Subscribes to React Query cache events and writes successful fetches to IndexedDB.
// Also pre-populates checklists from IndexedDB on mount so they appear instantly.
function CacheSync({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    getCachedLists()
      .then((lists) => {
        if (lists.length > 0 && !queryClient.getQueryData(['checklists'])) {
          queryClient.setQueryData(['checklists'], lists, { updatedAt: 0 })
        }
      })
      .catch(() => {})

    // Returns the unsubscribe function as the effect cleanup.
    // React StrictMode double-invokes effects, so the cleanup/re-subscribe cycle is intentional.
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated') return
      const { state, queryKey } = event.query
      if (state.status !== 'success') return

      if (queryKey[0] === 'tasks' && typeof queryKey[1] === 'number') {
        void cacheTasks(state.data as CheckvistTask[])
      } else if (queryKey[0] === 'checklists') {
        void cacheLists(state.data as CheckvistChecklist[])
      }
    })
  }, [])

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <CacheSync>
        <AuthInitializer>{children}</AuthInitializer>
      </CacheSync>
    </QueryClientProvider>
  )
}
