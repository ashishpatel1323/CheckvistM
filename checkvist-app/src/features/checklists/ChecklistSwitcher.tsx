import { useEffect, useRef, useState } from 'react'
import { ChevronDown, List } from 'lucide-react'
import { useChecklists } from './useChecklists'
import { useActiveChecklist } from './useActiveChecklist'
import { Spinner } from '@/components/Spinner'

export function ChecklistSwitcher() {
  const { data: checklists, isLoading } = useChecklists()
  const { activeChecklistId, setActiveChecklistId } = useActiveChecklist()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const active = checklists?.find((c) => c.id === activeChecklistId)

  // Auto-select first checklist if none selected
  useEffect(() => {
    if (!activeChecklistId && checklists && checklists.length > 0) {
      setActiveChecklistId(checklists[0].id)
    }
  }, [checklists, activeChecklistId, setActiveChecklistId])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-white text-sm font-medium"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {isLoading ? (
          <Spinner size="sm" />
        ) : (
          <List className="w-4 h-4 opacity-70" />
        )}
        <span className="max-w-48 truncate">
          {active?.name ?? (isLoading ? 'Loading…' : 'Select list')}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && checklists && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-30">
          {checklists.map((checklist) => (
            <button
              key={checklist.id}
              onClick={() => {
                setActiveChecklistId(checklist.id)
                setOpen(false)
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-left ${
                checklist.id === activeChecklistId
                  ? 'text-orange-600 font-medium'
                  : 'text-gray-700'
              }`}
              role="option"
              aria-selected={checklist.id === activeChecklistId}
            >
              <span className="truncate">{checklist.name}</span>
              <span className="text-xs text-gray-400 ml-2 shrink-0">{checklist.task_count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
