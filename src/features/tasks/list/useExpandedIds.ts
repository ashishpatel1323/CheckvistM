import { create } from 'zustand'
import { getExpandedState, setExpandedState } from '@/auth/tokenStore'

interface ExpandedStore {
  expanded: Set<number>
  isExpanded: (id: number) => boolean
  toggle: (id: number) => void
  expand: (id: number) => void
  collapse: (id: number) => void
  /** Merge storage-persisted values for a set of task IDs into the store. */
  seed: (ids: number[]) => void
}

export const useExpandedIds = create<ExpandedStore>((set, get) => ({
  expanded: new Set(),
  isExpanded: (id) => get().expanded.has(id),
  seed: (ids) => {
    set((s) => {
      const next = new Set(s.expanded)
      for (const id of ids) {
        if (getExpandedState(id)) next.add(id)
      }
      return { expanded: next }
    })
  },
  toggle: (id) => {
    set((s) => {
      const next = new Set(s.expanded)
      const expanding = !next.has(id)
      expanding ? next.add(id) : next.delete(id)
      setExpandedState(id, expanding)
      return { expanded: next }
    })
  },
  expand: (id) => {
    if (get().expanded.has(id)) return
    setExpandedState(id, true)
    set((s) => ({ expanded: new Set([...s.expanded, id]) }))
  },
  collapse: (id) => {
    if (!get().expanded.has(id)) return
    setExpandedState(id, false)
    set((s) => {
      const next = new Set(s.expanded)
      next.delete(id)
      return { expanded: next }
    })
  },
}))
