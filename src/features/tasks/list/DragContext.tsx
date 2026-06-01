import React, { createContext, useContext, useRef, useState, useCallback } from 'react'
import { useSharedValue } from 'react-native-reanimated'

export interface RowInfo {
  screenY: number
  height: number
  parentId: number | null
  position: number
}

interface IDragContext {
  rowLayouts: React.MutableRefObject<Map<number, RowInfo>>
  measureFns: React.MutableRefObject<Map<number, () => void>>
  containerScreenY: React.MutableRefObject<number>
  draggingId: number | null
  draggingContent: string
  dropTargetId: number | null
  dropZone: 'before' | 'onto' | 'after' | null
  ghostScreenY: ReturnType<typeof useSharedValue<number>>
  ghostOpacity: ReturnType<typeof useSharedValue<number>>
  startDrag: (id: number, content: string, screenY: number) => void
  updateDrag: (screenY: number) => void
  endDrag: () => { targetId: number | null; zone: 'before' | 'onto' | 'after' | null }
}

const DragCtx = createContext<IDragContext | null>(null)

export function DragProvider({ children }: { children: React.ReactNode }) {
  const rowLayouts = useRef(new Map<number, RowInfo>())
  const measureFns = useRef(new Map<number, () => void>())
  const containerScreenY = useRef(0)
  const draggingIdRef = useRef<number | null>(null)
  const dropTargetIdRef = useRef<number | null>(null)
  const dropZoneRef = useRef<'before' | 'onto' | 'after' | null>(null)

  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [draggingContent, setDraggingContent] = useState('')
  const [dropTargetId, setDropTargetId] = useState<number | null>(null)
  const [dropZone, setDropZone] = useState<'before' | 'onto' | 'after' | null>(null)

  const ghostScreenY = useSharedValue(0)
  const ghostOpacity = useSharedValue(0)

  const startDrag = useCallback((id: number, content: string, screenY: number) => {
    draggingIdRef.current = id
    setDraggingId(id)
    setDraggingContent(content)
    ghostScreenY.value = screenY
    ghostOpacity.value = 1
  }, [ghostScreenY, ghostOpacity])

  const updateDrag = useCallback((screenY: number) => {
    ghostScreenY.value = screenY
    let bestId: number | null = null
    let bestZone: 'before' | 'onto' | 'after' = 'onto'
    let bestDist = Infinity

    rowLayouts.current.forEach((info, id) => {
      if (id === draggingIdRef.current) return
      const center = info.screenY + info.height / 2
      const dist = Math.abs(screenY - center)
      if (dist < bestDist) {
        bestDist = dist
        bestId = id
        const rel = screenY - info.screenY
        const third = info.height / 3
        bestZone = rel < third ? 'before' : rel > 2 * third ? 'after' : 'onto'
      }
    })

    dropTargetIdRef.current = bestId
    dropZoneRef.current = bestZone
    setDropTargetId(bestId)
    setDropZone(bestZone)
  }, [ghostScreenY])

  const endDrag = useCallback(() => {
    const targetId = dropTargetIdRef.current
    const zone = dropZoneRef.current
    draggingIdRef.current = null
    dropTargetIdRef.current = null
    dropZoneRef.current = null
    setDraggingId(null)
    setDraggingContent('')
    setDropTargetId(null)
    setDropZone(null)
    ghostOpacity.value = 0
    return { targetId, zone }
  }, [ghostOpacity])

  return (
    <DragCtx.Provider value={{
      rowLayouts, measureFns, containerScreenY,
      draggingId, draggingContent,
      dropTargetId, dropZone,
      ghostScreenY, ghostOpacity,
      startDrag, updateDrag, endDrag,
    }}>
      {children}
    </DragCtx.Provider>
  )
}

export function useDragContext() {
  const ctx = useContext(DragCtx)
  if (!ctx) throw new Error('useDragContext must be used within DragProvider')
  return ctx
}
