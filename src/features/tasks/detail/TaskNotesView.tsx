import { View, Text, Pressable, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft, MessageSquare } from 'lucide-react-native'
import { Spinner } from '@/components/Spinner'
import { MarkdownRenderer } from './MarkdownRenderer'
import { timeAgo } from '@/lib/dateUtils'
import { useTaskNotesQuery } from './useTaskNotesQuery'

interface TaskNotesViewProps {
  checklistId: number
  taskId: number
}

export function TaskNotesView({ checklistId, taskId }: TaskNotesViewProps) {
  const router = useRouter()
  const { data: notes, isLoading } = useTaskNotesQuery(checklistId, taskId)

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View className="flex-row items-center gap-2 px-4 py-3 border-b border-border" style={{ paddingTop: 52 }}>
        <Pressable onPress={() => router.back()} hitSlop={8} className="p-1.5 rounded-lg active:bg-muted">
          <ArrowLeft size={20} color="#6b7280" />
        </Pressable>
        <Text className="text-base font-semibold text-foreground">Notes</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><Spinner size="lg" /></View>
      ) : !notes || notes.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-2">
          <MessageSquare size={32} color="#d1d5db" />
          <Text className="text-muted-foreground text-sm">No notes yet</Text>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="p-4 gap-3">
          {notes.map((note) => (
            <View key={note.id} className="rounded-xl border border-border bg-muted p-3">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-xs font-semibold text-muted-foreground">{note.username}</Text>
                <Text className="text-xs text-muted-foreground">{timeAgo(note.updated_at)}</Text>
              </View>
              <MarkdownRenderer content={note.comment} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
