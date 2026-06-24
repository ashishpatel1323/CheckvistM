import { useState, useMemo } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, Platform } from 'react-native'
import { Search, X, Circle, CheckCircle, ChevronRight } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTasksQuery } from '@/features/tasks/list/useTasksQuery'
import { useChecklists } from '@/features/checklists/useChecklists'
import { buildTaskTree } from '@/lib/taskTree'
import { humanizeDueDate, dueDateColorClass } from '@/lib/dateUtils'
import { priorityBadgeClass, priorityDisplay } from '@/features/tasks/shared/PriorityPicker'
import { useCloseTask } from '@/features/tasks/list/useTasksQuery'
import { useToast } from '@/components/Toast'
import type { TaskNode } from '@/lib/taskTree'

const ORANGE = '#E8632A'

interface SearchViewProps {
  checklistId: number
}

function highlight(text: string, query: string): { part: string; match: boolean }[] {
  if (!query.trim()) return [{ part: text, match: false }]
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return [{ part: text, match: false }]
  return [
    { part: text.slice(0, idx), match: false },
    { part: text.slice(idx, idx + query.length), match: true },
    { part: text.slice(idx + query.length), match: false },
  ]
}

interface ResultRowProps {
  task: TaskNode
  checklistId: number
  query: string
  checklistName: string
}

function ResultRow({ task, checklistId, query, checklistName }: ResultRowProps) {
  const router = useRouter()
  const { mutate: closeTask } = useCloseTask(checklistId)
  const toast = useToast()
  const parts = highlight(task.content, query)
  const dateColorClass = task.due ? dueDateColorClass(task.due) : ''

  const handleCheck = () => {
    closeTask(task.id, {
      onSuccess: () => toast.success('Task completed'),
      onError: () => toast.error('Failed to close task'),
    })
  }

  return (
    <Pressable
      onPress={() => router.push(`/${checklistId}/tasks/${task.id}`)}
      className="flex-row items-center gap-3 px-4 py-3 bg-white active:bg-muted"
      style={{ borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
    >
      <Pressable onPress={handleCheck} hitSlop={8}>
        {task.status === 1
          ? <CheckCircle size={18} color="#22c55e" />
          : <Circle size={18} color="#d1d5db" />
        }
      </Pressable>

      <View className="flex-1 gap-0.5">
        <Text className="text-sm text-foreground" numberOfLines={2}>
          {parts.map((p, i) =>
            p.match
              ? <Text key={i} style={{ backgroundColor: '#fde68a', color: '#78350f', fontWeight: '600' }}>{p.part}</Text>
              : <Text key={i}>{p.part}</Text>
          )}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-muted-foreground">{checklistName}</Text>
          {task.due && (
            <Text className={`text-xs font-medium ${dateColorClass}`}>{humanizeDueDate(task.due)}</Text>
          )}
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        {task.priority > 0 && (
          <View className={`px-1.5 py-0.5 rounded ${priorityBadgeClass(task.priority)}`}>
            <Text className={`text-xs font-bold ${priorityBadgeClass(task.priority)}`}>
              {priorityDisplay(task.priority)}
            </Text>
          </View>
        )}
        {task.children.length > 0 && (
          <View className="flex-row items-center gap-0.5">
            <ChevronRight size={12} color="#9ca3af" />
            <Text className="text-xs text-muted-foreground">{task.children.length}</Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}

export function SearchView({ checklistId }: SearchViewProps) {
  const [query, setQuery] = useState('')
  const { data: tasks } = useTasksQuery(checklistId)
  const { data: checklists } = useChecklists()
  const checklistName = checklists?.find((c) => c.id === checklistId)?.name ?? 'Tasks'

  const allNodes = useMemo(() => {
    if (!tasks) return []
    const { allNodes } = buildTaskTree(tasks)
    return allNodes
  }, [tasks])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allNodes.filter((t) => t.content.toLowerCase().includes(q))
  }, [allNodes, query])

  const inputStyle = Platform.OS === 'web'
    ? { outline: 'none' } as never
    : undefined

  return (
    <View className="flex-1 bg-muted">
      {/* Search bar */}
      <View
        className="flex-row items-center gap-3 mx-4 mt-4 mb-3 px-4 py-3 bg-white rounded-2xl"
        style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}
      >
        <Search size={18} color={query ? ORANGE : '#9ca3af'} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search tasks…"
          placeholderTextColor="#9ca3af"
          className="flex-1 text-sm text-foreground"
          style={[{ fontSize: 15 }, inputStyle]}
          autoFocus={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <View className="w-5 h-5 rounded-full bg-muted items-center justify-center">
              <X size={12} color="#6b7280" />
            </View>
          </Pressable>
        )}
      </View>

      {/* Empty / prompt state */}
      {!query.trim() && (
        <View className="flex-1 items-center justify-center gap-3 pb-20">
          <View className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: '#fff7ed' }}>
            <Search size={28} color={ORANGE} />
          </View>
          <Text className="text-base font-semibold text-foreground">Search your tasks</Text>
          <Text className="text-sm text-muted-foreground text-center px-8">
            Type to find tasks by name across{'\n'}
            <Text className="font-medium" style={{ color: ORANGE }}>{checklistName}</Text>
          </Text>
        </View>
      )}

      {/* No results */}
      {query.trim().length > 0 && results.length === 0 && (
        <View className="flex-1 items-center justify-center gap-3 pb-20">
          <View className="w-16 h-16 rounded-full items-center justify-center bg-muted">
            <Search size={28} color="#9ca3af" />
          </View>
          <Text className="text-base font-semibold text-muted-foreground">No results</Text>
          <Text className="text-sm text-muted-foreground">No tasks match "{query}"</Text>
        </View>
      )}

      {/* Results */}
      {results.length > 0 && (
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Results header */}
          <View className="flex-row items-center px-4 pb-2">
            <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tasks
            </Text>
            <View className="ml-2 px-1.5 py-0.5 rounded-full bg-muted">
              <Text className="text-xs font-medium text-muted-foreground">{results.length}</Text>
            </View>
          </View>

          <View
            className="mx-4 rounded-2xl overflow-hidden"
            style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 }}
          >
            {results.map((task) => (
              <ResultRow
                key={task.id}
                task={task}
                checklistId={checklistId}
                query={query}
                checklistName={checklistName}
              />
            ))}
          </View>
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  )
}
