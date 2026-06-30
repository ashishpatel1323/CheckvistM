import { useEffect, useRef, type ReactNode } from 'react'
import { View, Platform, Text } from 'react-native'
import type { CheckvistTask } from '@/api/types'
import { classifyPriority, type PriorityBucket } from '@/features/tasks/shared/PriorityPicker'
import { Zap, Flag, CheckSquare, HelpCircle } from 'lucide-react-native'

export interface QuadrantConfig {
  bucket: PriorityBucket
  label: string
  sublabel: string
  color: string
  bg: string
  border: string
  targetPriority: number
  Icon: typeof Zap
}

export const QUADRANTS: [QuadrantConfig, QuadrantConfig, QuadrantConfig, QuadrantConfig] = [
  {
    bucket: 'high',
    label: 'Must Do',
    sublabel: 'Urgent & Important',
    color: '#b91c1c',
    bg: '#FEF2F2',
    border: '#FECACA',
    targetPriority: 1,
    Icon: Zap,
  },
  {
    bucket: 'medium',
    label: 'Nice to Have',
    sublabel: 'Important, Not Urgent',
    color: '#b45309',
    bg: '#FFFBEB',
    border: '#FDE68A',
    targetPriority: 4,
    Icon: Flag,
  },
  {
    bucket: 'low',
    label: 'Quick Wins',
    sublabel: 'Urgent, Delegate',
    color: '#15803d',
    bg: '#F0FDF4',
    border: '#BBF7D0',
    targetPriority: 7,
    Icon: CheckSquare,
  },
  {
    bucket: 'tbd',
    label: 'TBD / Blocked',
    sublabel: 'Not Urgent, Not Important',
    color: '#7c3aed',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    targetPriority: 9,
    Icon: HelpCircle,
  },
]

export function computePriorityDrop(task: CheckvistTask, targetBucket: PriorityBucket): number | null {
  if (classifyPriority(task.priority) === targetBucket) return null
  const config = QUADRANTS.find((q) => q.bucket === targetBucket)!
  return config.targetPriority
}

// Module-level touch-drag state (only one drag at a time)
let _tdGhost: HTMLElement | null = null
let _tdTimer: ReturnType<typeof setTimeout> | null = null
let _tdActive = false

export function _tdCleanup() {
  clearTimeout(_tdTimer ?? undefined)
  _tdTimer = null
  _tdGhost?.remove()
  _tdGhost = null
  _tdActive = false
  document.querySelectorAll('[data-matrix-bucket]').forEach((el) => {
    (el as HTMLElement).style.outline = ''
  })
}

export function _tdFindBucket(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const b = (el as HTMLElement).dataset?.matrixBucket
    if (b) return b
  }
  return null
}

export function useCardDragRef(
  task: CheckvistTask,
  onDragStart: () => void,
  onTouchDropAtPoint?: (x: number, y: number) => void,
) {
  const ref = useRef<View>(null)
  const cbsRef = useRef({ onDragStart, onTouchDropAtPoint, task })
  cbsRef.current = { onDragStart, onTouchDropAtPoint, task }
  const startRef = useRef({ x: 0, y: 0, moved: false })

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const el = ref.current as unknown as HTMLElement | null
    if (!el) return

    el.setAttribute('draggable', 'true')
    el.style.cursor = 'grab'
    const onDragStartEvt = (e: DragEvent) => {
      e.dataTransfer?.setData('text/plain', 'matrix-drag')
      el.style.opacity = '0.5'
      cbsRef.current.onDragStart()
    }
    const onDragEnd = () => { el.style.opacity = '1' }
    el.addEventListener('dragstart', onDragStartEvt)
    el.addEventListener('dragend', onDragEnd)

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      startRef.current = { x: t.clientX, y: t.clientY, moved: false }

      _tdTimer = setTimeout(() => {
        if (startRef.current.moved) return
        _tdActive = true
        cbsRef.current.onDragStart()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(navigator as any).vibrate?.(40)
        el.style.opacity = '0.4'

        const ghost = document.createElement('div')
        // eslint-disable-next-line react-native/no-inline-styles
        ghost.style.cssText = [
          'position:fixed', 'z-index:9999', 'pointer-events:none',
          'background:white', 'border-radius:8px', 'padding:6px 10px',
          'box-shadow:0 6px 24px rgba(0,0,0,0.22)', 'font-size:12px',
          'max-width:150px', 'white-space:nowrap', 'overflow:hidden',
          'text-overflow:ellipsis', 'opacity:0.93',
          `left:${startRef.current.x - 75}px`, `top:${startRef.current.y - 24}px`,
          'border-left:3px solid #4772FA', 'transform:rotate(-2deg)',
        ].join(';')
        ghost.textContent = cbsRef.current.task.content.replace(/[*_`#]/g, '').slice(0, 38)
        document.body.appendChild(ghost)
        _tdGhost = ghost
      }, 420)
    }

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!_tdActive) {
        const dx = Math.abs(t.clientX - startRef.current.x)
        const dy = Math.abs(t.clientY - startRef.current.y)
        if (dx > 8 || dy > 8) {
          startRef.current.moved = true
          clearTimeout(_tdTimer ?? undefined)
          _tdTimer = null
        }
        return
      }
      e.preventDefault()
      if (_tdGhost) {
        _tdGhost.style.left = `${t.clientX - 75}px`
        _tdGhost.style.top = `${t.clientY - 24}px`
      }
      const bucket = _tdFindBucket(t.clientX, t.clientY)
      document.querySelectorAll('[data-matrix-bucket]').forEach((bel) => {
        ;(bel as HTMLElement).style.outline =
          (bel as HTMLElement).dataset.matrixBucket === bucket ? '2px solid #4772FA' : ''
      })
    }

    const onTouchEnd = (e: TouchEvent) => {
      el.style.opacity = '1'
      if (_tdActive) {
        const t = e.changedTouches[0]
        cbsRef.current.onTouchDropAtPoint?.(t.clientX, t.clientY)
      }
      _tdCleanup()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    return () => {
      el.removeEventListener('dragstart', onDragStartEvt)
      el.removeEventListener('dragend', onDragEnd)
      clearTimeout(_tdTimer ?? undefined)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  return ref
}

interface QuadrantShellProps {
  config: QuadrantConfig
  isDropTarget: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: () => void
  count: number
  children: ReactNode
}

export function QuadrantShell({
  config,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  count,
  children,
}: QuadrantShellProps) {
  const { Icon } = config

  const inner = (
    <View
      style={{
        flex: 1,
        backgroundColor: isDropTarget ? config.bg : 'white',
        borderRadius: 12,
        borderWidth: isDropTarget ? 2 : 1,
        borderColor: isDropTarget ? config.color : config.border,
        overflow: 'hidden',
        minHeight: 120,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 8,
          backgroundColor: config.bg,
          borderBottomWidth: 1,
          borderBottomColor: config.border,
        }}
      >
        <Icon size={14} color={config.color} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: config.color }}>{config.label}</Text>
          <Text style={{ fontSize: 10, color: config.color, opacity: 0.7 }}>{config.sublabel}</Text>
        </View>
        <View
          style={{
            backgroundColor: config.color,
            borderRadius: 10,
            minWidth: 20,
            height: 20,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 5,
          }}
        >
          <Text style={{ fontSize: 11, color: 'white', fontWeight: '700' }}>{count}</Text>
        </View>
      </View>

      {children}
    </View>
  )

  if (Platform.OS !== 'web') return inner

  return (
    // eslint-disable-next-line react-native/no-inline-styles
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 120 }}
      data-matrix-bucket={config.bucket}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeave() }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
    >
      {inner}
    </div>
  )
}
