export function TaskSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2 animate-pulse">
          <div className="w-4 h-4 rounded-full bg-gray-200 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div
              className="h-3.5 bg-gray-200 rounded"
              style={{ width: `${60 + (i % 3) * 15}%` }}
            />
            {i % 2 === 0 && <div className="h-3 bg-gray-100 rounded w-1/3" />}
          </div>
          {i % 3 === 0 && <div className="w-12 h-4 bg-gray-100 rounded-full" />}
        </div>
      ))}
    </div>
  )
}
