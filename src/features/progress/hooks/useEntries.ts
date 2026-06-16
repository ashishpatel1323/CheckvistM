import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useProgressSystem } from './useProgressSystem'
import type { EntryMode } from '../types'

export function useCreateEntry() {
  const qc = useQueryClient()
  const { createEntry } = useProgressSystem()
  return useMutation({
    mutationFn: ({ trackerId, mode, value, note, date }: {
      trackerId: number; mode: EntryMode; value: number; note: string; date: Date
    }) => createEntry(trackerId, { mode, value, note }, date),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['progress-trackers'] })
      qc.invalidateQueries({ queryKey: ['progress-entries', vars.trackerId] })
    },
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  const { updateEntry } = useProgressSystem()
  return useMutation({
    mutationFn: ({ taskId, trackerId, mode, value, note, date }: {
      taskId: number; trackerId: number; mode: EntryMode; value: number; note: string; date: Date
    }) => updateEntry(taskId, trackerId, { mode, value, note }, date),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['progress-trackers'] })
      qc.invalidateQueries({ queryKey: ['progress-entries', vars.trackerId] })
    },
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  const { deleteEntry } = useProgressSystem()
  return useMutation({
    mutationFn: ({ taskId, trackerId }: { taskId: number; trackerId: number }) =>
      deleteEntry(taskId),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['progress-trackers'] })
      qc.invalidateQueries({ queryKey: ['progress-entries', vars.trackerId] })
    },
  })
}
