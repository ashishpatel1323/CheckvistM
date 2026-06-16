import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { useChecklists } from '@/features/checklists/useChecklists'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'
import { Spinner } from '@/components/Spinner'

export default function SelectListRoute() {
  const router = useRouter()
  const { data: checklists, isLoading } = useChecklists()
  const { setActiveChecklistId } = useActiveChecklist()

  useEffect(() => {
    if (checklists && checklists.length > 0) {
      setActiveChecklistId(checklists[0].id)
      router.replace(`/${checklists[0].id}`)
    }
  }, [checklists, setActiveChecklistId, router])

  return <Spinner />
}
