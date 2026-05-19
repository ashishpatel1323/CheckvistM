import { create } from 'zustand'
import { storageGetSync, storageSetSync, storageRemoveSync } from '@/platform/storage'

interface ActiveChecklistState {
  activeChecklistId: number | null
  setActiveChecklistId: (id: number | null) => void
}

const STORAGE_KEY = 'cv_active_checklist'

function loadFromStorage(): number | null {
  const stored = storageGetSync(STORAGE_KEY)
  if (stored) {
    const parsed = parseInt(stored, 10)
    return isNaN(parsed) ? null : parsed
  }
  return null
}

export const useActiveChecklist = create<ActiveChecklistState>()((set) => ({
  activeChecklistId: loadFromStorage(),

  setActiveChecklistId: (id) => {
    if (id !== null) {
      storageSetSync(STORAGE_KEY, String(id))
    } else {
      storageRemoveSync(STORAGE_KEY)
    }
    set({ activeChecklistId: id })
  },
}))
