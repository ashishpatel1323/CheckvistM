import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { GroupedTasks } from '@/lib/dateSort'
import { TaskRow } from './TaskRow'

interface TaskGroupProps {
  group: GroupedTasks
  checklistId: number
  isMobile: boolean
}

const groupColorClass: Record<string, string> = {
  overdue: 'text-red-600 bg-red-50',
  today: 'text-orange-600 bg-orange-50',
  tomorrow: 'text-yellow-600 bg-yellow-50',
  thisWeek: 'text-blue-600 bg-blue-50',
  later: 'text-indigo-600 bg-indigo-50',
  noDueDate: 'text-gray-500 bg-gray-50',
}

export function TaskGroup({ group, checklistId, isMobile }: TaskGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const colorClass = groupColorClass[group.group] ?? 'text-gray-500 bg-gray-50'

  return (
    <div className="mb-2">
      {/* Group header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1 ${colorClass} hover:opacity-90 transition-opacity`}
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        />
        <span className="text-xs font-semibold uppercase tracking-wider">{group.label}</span>
        <span className="ml-auto text-xs opacity-60">{group.tasks.length}</span>
      </button>

      {/* Tasks */}
      {!collapsed && (
        <div>
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              checklistId={checklistId}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}
    </div>
  )
}
