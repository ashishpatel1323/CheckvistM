import { useRef, useState } from 'react'
import { Platform } from 'react-native'

// Shared keyboard navigation/selection/reorder behavior for orderable task lists.
// Mirrors the Execute tab's left-panel interaction model:
//   ↑/↓            move the "current" task highlight
//   Shift/Cmd+click multi-select a range/set of items
//   ↑/↓ (with selection) reorder the selected block by one slot
//   Cmd/Ctrl+↑/↓   swap the current item with its neighbor (no selection)
//   Escape         clear selection
export interface ListKeyboardNavOptions {
  ids: number[]
  setIds: (ids: number[]) => void
  persist: (ids: number[]) => void
  currentIndex: number
  setCurrentIndex: (updater: number | ((ci: number) => number)) => void
}

function moveSelectionUp(ids: number[], sel: Set<number>): number[] {
  const sorted = [...sel].sort((a, b) => a - b)
  if (sorted[0] === 0) return ids
  const result = [...ids]
  const displaced = result.splice(sorted[0] - 1, 1)[0]
  result.splice(sorted[sorted.length - 1], 0, displaced)
  return result
}

function moveSelectionDown(ids: number[], sel: Set<number>): number[] {
  const sorted = [...sel].sort((a, b) => a - b)
  if (sorted[sorted.length - 1] === ids.length - 1) return ids
  const result = [...ids]
  const displaced = result.splice(sorted[sorted.length - 1] + 1, 1)[0]
  result.splice(sorted[0], 0, displaced)
  return result
}

export function useListKeyboardNav({ ids, setIds, persist, currentIndex, setCurrentIndex }: ListKeyboardNavOptions) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const lastClickedIdx = useRef<number | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const focusPanel = () => {
    if (Platform.OS === 'web') panelRef.current?.focus()
  }

  function onItemMouseDown(e: React.MouseEvent, index: number) {
    focusPanel()
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault()
      setSelectedIndices((prev) => {
        const next = new Set(prev)
        if (next.has(index)) next.delete(index)
        else next.add(index)
        return next
      })
      lastClickedIdx.current = index
    } else if (e.shiftKey && lastClickedIdx.current !== null) {
      e.preventDefault()
      const from = Math.min(lastClickedIdx.current, index)
      const to = Math.max(lastClickedIdx.current, index)
      setSelectedIndices(new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i)))
    } else {
      setSelectedIndices(new Set())
      lastClickedIdx.current = index
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

    if (e.key === 'Escape') { setSelectedIndices(new Set()); return }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()

    if (selectedIndices.size > 0) {
      const sorted = [...selectedIndices].sort((a, b) => a - b)
      if (e.key === 'ArrowUp') {
        if (sorted[0] === 0) return
        const newIds = moveSelectionUp(ids, selectedIndices)
        setIds(newIds)
        persist(newIds)
        setSelectedIndices(new Set([...selectedIndices].map((i) => i - 1)))
        setCurrentIndex((ci) => (selectedIndices.has(ci) ? ci - 1 : ci))
      } else {
        if (sorted[sorted.length - 1] === ids.length - 1) return
        const newIds = moveSelectionDown(ids, selectedIndices)
        setIds(newIds)
        persist(newIds)
        setSelectedIndices(new Set([...selectedIndices].map((i) => i + 1)))
        setCurrentIndex((ci) => (selectedIndices.has(ci) ? ci + 1 : ci))
      }
    } else if (e.metaKey || e.ctrlKey) {
      const delta = e.key === 'ArrowUp' ? -1 : 1
      const next = currentIndex + delta
      if (next < 0 || next >= ids.length) return
      const newIds = [...ids]
      ;[newIds[currentIndex], newIds[next]] = [newIds[next], newIds[currentIndex]]
      setIds(newIds)
      persist(newIds)
      setCurrentIndex(next)
    } else {
      setCurrentIndex((ci) => {
        const delta = e.key === 'ArrowUp' ? -1 : 1
        const next = ci + delta
        return next < 0 || next >= ids.length ? ci : next
      })
    }
  }

  return { selectedIndices, setSelectedIndices, onItemMouseDown, onKeyDown, panelRef, focusPanel }
}
