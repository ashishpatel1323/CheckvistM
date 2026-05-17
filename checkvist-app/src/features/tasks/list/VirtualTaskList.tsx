import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { GroupedTasks } from '@/lib/dateSort'
import { TaskGroup } from './TaskGroup'

interface VirtualTaskListProps {
  groups: GroupedTasks[]
  checklistId: number
  isMobile: boolean
}

export function VirtualTaskList({ groups, checklistId, isMobile }: VirtualTaskListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // Estimate: header (~36px) + tasks (~40px each)
      const group = groups[index]
      return 36 + group.tasks.length * 40
    },
    overscan: 3,
  })

  return (
    <div ref={parentRef} className="overflow-y-auto flex-1">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const group = groups[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <TaskGroup
                group={group}
                checklistId={checklistId}
                isMobile={isMobile}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
