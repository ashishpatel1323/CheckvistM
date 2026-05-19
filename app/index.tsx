import { Redirect } from 'expo-router'
import { useAuth } from '@/auth/useAuth'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'

export default function Index() {
  const token = useAuth((s) => s.token)
  const { activeChecklistId } = useActiveChecklist()

  if (!token) return <Redirect href="/login" />
  if (activeChecklistId) return <Redirect href={`/${activeChecklistId}`} />
  return <Redirect href="/select-list" />
}
