import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useProgressSystem } from './useProgressSystem'
import type { TrackerMeta } from '../types'

export function useTrackers() {
  const { loadTrackers } = useProgressSystem()
  return useQuery({
    queryKey: ['progress-trackers'],
    queryFn: loadTrackers,
    staleTime: 0,
    refetchOnMount: true,
  })
}

export function useTrackerEntries(trackerId: number | null) {
  const { loadEntries } = useProgressSystem()
  return useQuery({
    queryKey: ['progress-entries', trackerId],
    queryFn: () => loadEntries(trackerId!),
    enabled: trackerId !== null,
    staleTime: 0,
    refetchOnMount: true,
  })
}

export function useCreateTracker() {
  const qc = useQueryClient()
  const { createTracker } = useProgressSystem()
  return useMutation({
    mutationFn: ({ name, meta }: { name: string; meta: TrackerMeta }) =>
      createTracker(name, meta),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress-trackers'] }),
  })
}

export function useUpdateTracker() {
  const qc = useQueryClient()
  const { updateTracker } = useProgressSystem()
  return useMutation({
    mutationFn: ({ taskId, name, meta }: { taskId: number; name: string; meta: TrackerMeta }) =>
      updateTracker(taskId, name, meta),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress-trackers'] }),
  })
}

export function useDeleteTracker() {
  const qc = useQueryClient()
  const { deleteTracker } = useProgressSystem()
  return useMutation({
    mutationFn: (taskId: number) => deleteTracker(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress-trackers'] }),
  })
}
