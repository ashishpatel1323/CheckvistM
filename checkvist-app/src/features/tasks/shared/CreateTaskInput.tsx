import { useRef, useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
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
  const inputRef = useRef<HTMLInputElement>(null)
  const { mutate: create, isPending } = useCreateTask(checklistId)
  const toast = useToast()

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  // Global keyboard shortcut: N to focus
  useEffect(() => {
    if (parentId !== null) return // only for top-level input
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === 'n' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
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
        onError: () => {
          toast.error('Failed to create task')
        },
      }
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
      <button
        onClick={submit}
        disabled={isPending || !value.trim()}
        className="w-6 h-6 rounded-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 flex items-center justify-center shrink-0 transition-colors"
        aria-label="Create task"
      >
        <Plus className="w-3.5 h-3.5 text-white" />
      </button>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') {
            setValue('')
            inputRef.current?.blur()
          }
        }}
        placeholder={placeholder}
        disabled={isPending}
        className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent"
      />
    </div>
  )
}
