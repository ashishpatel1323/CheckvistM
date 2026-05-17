import { useEffect, useRef, useState } from 'react'
import { Tag, Calendar } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { PriorityPicker } from './PriorityPicker'
import { QuickDatePicker } from './QuickDatePicker'

interface ContextMenuProps {
  taskId: number
  priority: number
  open: boolean
  position: { x: number; y: number } | null
  onClose: () => void
  onPriorityChange: (priority: number) => void
  onDateChange: (date: string | null) => void
  isMobile: boolean
}

type SubMenu = 'priority' | 'date' | null

export function ContextMenu({
  taskId,
  priority,
  open,
  position,
  onClose,
  onPriorityChange,
  onDateChange,
  isMobile,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [subMenu, setSubMenu] = useState<SubMenu>(null)

  // Close sub-menus when context menu closes
  useEffect(() => {
    if (!open) setSubMenu(null)
  }, [open])

  // Close on outside click (desktop)
  useEffect(() => {
    if (!open || isMobile) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, isMobile, onClose])

  if (!open) return null

  const menuContent = (
    <div className="w-52">
      {subMenu === null && (
        <ul className="py-1">
          <li>
            <button
              onClick={() => setSubMenu('priority')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Tag className="w-4 h-4 text-gray-400" />
              Set priority
            </button>
          </li>
          <li>
            <button
              onClick={() => setSubMenu('date')}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Calendar className="w-4 h-4 text-gray-400" />
              Change due date
            </button>
          </li>
        </ul>
      )}
      {subMenu === 'priority' && (
        <div className="py-2">
          <p className="px-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Priority
          </p>
          <PriorityPicker
            value={priority}
            onChange={(p) => {
              onPriorityChange(p)
              onClose()
            }}
          />
        </div>
      )}
      {subMenu === 'date' && (
        <div className="py-2">
          <QuickDatePicker
            taskId={taskId}
            onSelect={(date) => {
              onDateChange(date)
              onClose()
            }}
            onClose={onClose}
          />
        </div>
      )}
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        title={subMenu === 'priority' ? 'Set Priority' : subMenu === 'date' ? 'Due Date' : 'Task Actions'}
      >
        {menuContent}
      </BottomSheet>
    )
  }

  // Desktop: positioned popover
  const style: React.CSSProperties = position
    ? {
        position: 'fixed',
        top: position.y,
        left: position.x,
        zIndex: 50,
      }
    : { display: 'none' }

  return (
    <div ref={menuRef} style={style} className="bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
      {menuContent}
    </div>
  )
}
