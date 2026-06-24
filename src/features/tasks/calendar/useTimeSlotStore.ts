import { Platform } from 'react-native'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Local-only time-of-day placement for the Execute calendar (time-blocking) sub-tab.
 *
 * Checkvist's API stores only a due *date* — never sent here. The day-level due date keeps
 * syncing through the normal updateTask mutation; this store holds the time-of-day +
 * duration purely on-device, persisted across refreshes.
 */
export interface TimeSlot {
  /** "yyyy/MM/dd" — mirrors the synced due date for this task. */
  date: string
  /** Start time, minutes from midnight. */
  startMinutes: number
  durationMinutes: number
  /** 'nlp' = auto-placed from a detected time hint; 'manual' = user dragged/resized. */
  source: 'manual' | 'nlp'
}

interface TimeSlotStore {
  slots: Record<number, TimeSlot>
  setSlot: (taskId: number, slot: TimeSlot) => void
  removeSlot: (taskId: number) => void
}

const storage = Platform.OS === 'web'
  ? createJSONStorage(() => localStorage)
  : createJSONStorage(() => AsyncStorage)

export const useTimeSlotStore = create<TimeSlotStore>()(
  persist(
    (set) => ({
      slots: {},
      setSlot: (taskId, slot) =>
        set((s) => ({ slots: { ...s.slots, [taskId]: slot } })),
      removeSlot: (taskId) =>
        set((s) => {
          const next = { ...s.slots }
          delete next[taskId]
          return { slots: next }
        }),
    }),
    { name: 'calendar-slots', storage }
  )
)
