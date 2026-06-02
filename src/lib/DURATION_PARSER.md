# Duration Parser Documentation

This library parses duration tags from task metadata and adds a `duration` property to each task.

## Supported Duration Formats

The parser supports multiple common time notation formats:

- **Hours + Minutes**: `1h 30m`, `2h 15m`, `1h and 30m`
- **Hours only**: `1h`, `2h`, `1hour`, `2hours`
- **Minutes only**: `30m`, `45min`, `60mins`
- **Decimal hours**: `1.5h`, `2.75h` (automatically converted to hours + minutes)

All formats are case-insensitive and handle whitespace variations.

## Usage

### In Components

Since the `duration` property is automatically added to all tasks via the API endpoints, you can access it directly:

```tsx
import type { CheckvistTask } from '@/api/types'

function TaskRow({ task }: { task: CheckvistTask }) {
  return (
    <View>
      <Text>{task.content}</Text>
      {task.duration && (
        <Text className="text-sm text-gray-500">
          ⏱ {task.duration.formatted}
        </Text>
      )}
    </View>
  )
}
```

### Direct Parser Usage

If you need to parse duration tags manually:

```tsx
import {
  parseDurationTag,
  extractDurationFromTags,
  isDurationTag,
} from '@/lib/durationParser'

// Parse a single tag
const result = parseDurationTag('1h 30m')
// { minutes: 90, formatted: '1h 30m' }

// Extract duration from comma-separated tags
const duration = extractDurationFromTags('bug,1h,urgent')
// { minutes: 60, formatted: '1h' }

// Check if a tag is a duration
if (isDurationTag(tag)) {
  // tag looks like a duration
}
```

### Task Enrichment

The `enrichTask` and `enrichTasks` functions add duration properties:

```tsx
import { enrichTask, enrichTasks } from '@/lib/taskEnrichment'

// Enrich a single task
const enriched = enrichTask(rawTask)
console.log(enriched.duration) // { minutes: 60, formatted: '1h' } or null

// Enrich multiple tasks
const enrichedList = enrichTasks(rawTasks)
```

## How It Works

1. **Automatic Enrichment**: All API endpoints (`fetchTasks`, `fetchTask`, `createTask`, `updateTask`, `closeTask`) automatically enrich tasks with duration data
2. **Tag Parsing**: The first tag that matches a duration pattern is extracted
3. **Null Fallback**: If no duration tag is found, `duration` is set to `null` or `undefined`

## Examples

### Task with duration tag
```
Content: "Design homepage"
Tags: "design,2h,ui"
Result: task.duration = { minutes: 120, formatted: '2h' }
```

### Task without duration
```
Content: "Fix bug"
Tags: "bug,urgent"
Result: task.duration = null
```

### Complex tags
```
Content: "API integration"
Tags: "backend,1h 45m,critical"
Result: task.duration = { minutes: 105, formatted: '1h 45m' }
```

## Future Enhancements

- Support for relative durations (e.g., "until:next-friday")
- Time range tags (e.g., "30m-1h")
- Filtered duration display in task lists
- Total duration calculation for subtask hierarchies
- Duration-based task sorting/filtering
