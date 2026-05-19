import { useEffect, useState } from 'react'
import { View, Text, Pressable, Modal } from 'react-native'
import { ChevronDown, List } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useChecklists } from './useChecklists'
import { useActiveChecklist } from './useActiveChecklist'

export function ChecklistSwitcher() {
  const { data: checklists, isLoading } = useChecklists()
  const { activeChecklistId, setActiveChecklistId } = useActiveChecklist()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const active = checklists?.find((c) => c.id === activeChecklistId)

  // Auto-select first checklist
  useEffect(() => {
    if (!activeChecklistId && checklists && checklists.length > 0) {
      setActiveChecklistId(checklists[0].id)
      router.replace(`/${checklists[0].id}`)
    }
  }, [checklists, activeChecklistId, setActiveChecklistId, router])

  return (
    <>
      <Pressable
        className="flex-row items-center gap-2 px-3 py-1.5 rounded-lg active:bg-white/10"
        onPress={() => setOpen(true)}
      >
        <List size={16} color="white" style={{ opacity: 0.7 }} />
        <Text className="text-white text-sm font-medium" numberOfLines={1} style={{ maxWidth: 192 }}>
          {active?.name ?? (isLoading ? 'Loading…' : 'Select list')}
        </Text>
        <ChevronDown size={14} color="white" style={{ opacity: 0.7 }} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/30" onPress={() => setOpen(false)}>
          <View className="mt-20 mx-4 bg-white rounded-xl border border-gray-100 py-1"
            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 }}
          >
            {(checklists ?? []).map((checklist) => (
              <Pressable
                key={checklist.id}
                className={`flex-row items-center justify-between px-3 py-2.5 active:bg-gray-50 ${
                  checklist.id === activeChecklistId ? 'bg-orange-50' : ''
                }`}
                onPress={() => {
                  setActiveChecklistId(checklist.id)
                  setOpen(false)
                  router.replace(`/${checklist.id}`)
                }}
              >
                <Text className={`text-sm flex-1 ${checklist.id === activeChecklistId ? 'text-orange-600 font-medium' : 'text-gray-700'}`}
                  numberOfLines={1}
                >
                  {checklist.name}
                </Text>
                <Text className="text-xs text-gray-400 ml-2">{checklist.task_count}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}
