import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useChecklists } from '@/features/checklists/useChecklists'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'
import { Spinner } from '@/components/Spinner'
import { Pressable } from 'react-native'

export default function SelectListRoute() {
  const router = useRouter()
  const { data: checklists, isLoading } = useChecklists()
  const { setActiveChecklistId } = useActiveChecklist()

  if (isLoading) return <Spinner />

  return (
    <View className="flex-1 bg-white p-6 pt-16">
      <Text className="text-2xl font-bold text-gray-900 mb-6">Select a list</Text>
      {(checklists ?? []).map((cl) => (
        <Pressable
          key={cl.id}
          className="py-4 border-b border-gray-100 active:bg-gray-50"
          onPress={() => {
            setActiveChecklistId(cl.id)
            router.replace(`/${cl.id}`)
          }}
        >
          <Text className="text-base text-gray-800">{cl.name}</Text>
          <Text className="text-sm text-gray-400">{cl.task_count} tasks</Text>
        </Pressable>
      ))}
    </View>
  )
}
