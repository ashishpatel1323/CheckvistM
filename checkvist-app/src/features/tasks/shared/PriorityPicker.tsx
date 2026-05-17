interface PriorityPickerProps {
  value: number
  onChange: (priority: number) => void
}

function priorityLabel(p: number): string {
  if (p === 1) return 'P1'
  if (p <= 3) return `P${p}`
  if (p <= 6) return `P${p}`
  return `P${p}`
}

function priorityColor(p: number): string {
  if (p <= 3) return 'bg-red-100 text-red-700 ring-red-300'
  if (p <= 6) return 'bg-amber-100 text-amber-700 ring-amber-300'
  return 'bg-green-100 text-green-700 ring-green-300'
}

export function priorityBadgeClass(priority: number): string {
  if (priority <= 0) return 'text-gray-400 bg-gray-100'
  if (priority <= 3) return 'text-red-600 bg-red-100'
  if (priority <= 6) return 'text-amber-600 bg-amber-100'
  return 'text-green-600 bg-green-100'
}

/** Returns the display label: P1–P10 for set priorities, P11 for none (priority 0). */
export function priorityDisplay(priority: number): string {
  return priority > 0 ? `P${priority}` : 'P11'
}

export function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5 p-2">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${priorityColor(p)} ${
            value === p ? 'ring-2 scale-110' : 'hover:scale-105'
          }`}
          aria-label={`Priority ${p}`}
          aria-pressed={value === p}
        >
          {priorityLabel(p)}
        </button>
      ))}
    </div>
  )
}
