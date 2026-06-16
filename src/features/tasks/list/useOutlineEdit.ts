import { create } from 'zustand'

interface State {
  activeId: number | null
  setActiveId: (id: number | null) => void
}

export const useOutlineEdit = create<State>()((set) => ({
  activeId: null,
  setActiveId: (id) => set({ activeId: id }),
}))
