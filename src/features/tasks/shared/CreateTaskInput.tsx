import { useRef, useState, useEffect } from 'react'
import { View, TextInput, Pressable, Platform } from 'react-native'
import { Plus } from 'lucide-react-native'
import { useCreateTask } from '@/features/tasks/list/useTasksQuery'
import { useToast } from '@/components/Toast'

interface CreateTaskInputProps {
  checklistId: number
  parentId?: number | null
  placeholder?: string
  onCreated?: () => void
  autoFocus?: boolean
}

export function CreateTaskInput({
  checklistId,
  parentId = null,
  placeholder = '+ New task',
  onCreated,
  autoFocus = false,
}: CreateTaskInputProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<TextInput>(null)
  const { mutate: create, isPending } = useCreateTask(checklistId)
  const toast = useToast()

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // Web-only: 'N' key shortcut to focus top-level input
  useEffect(() => {
    if (Platform.OS !== 'web' || parentId !== null) return
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        !(document.activeElement as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [parentId])

  const submit = () => {
    const content = value.trim()
    if (!content) return
    create(
      { content, parent_id: parentId },
      {
        onSuccess: () => {
          setValue('')
          toast.success('Task created')
          onCreated?.()
        },
        onError: () => toast.error('Failed to create task'),
      }
    )
  }

  return (
    <View className="flex-row items-center gap-2 px-3 py-2 border-b border-gray-100">
      <Pressable
        onPress={submit}
        disabled={isPending || !value.trim()}
        className="w-6 h-6 rounded-full bg-orange-500 active:bg-orange-600 items-center justify-center"
        style={({ pressed }) => [{ opacity: isPending || !value.trim() ? 0.4 : pressed ? 0.8 : 1 }]}
      >
        <Plus size={14} color="white" />
      </Pressable>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        editable={!isPending}
        returnKeyType="done"
        className="flex-1 text-sm text-gray-700"
        style={{ fontSize: 14 }}
      />
    </View>
  )
}
