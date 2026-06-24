import { useEffect, useState } from 'react'
import { View, Pressable, Modal } from 'react-native'
import { ChevronDown, List } from 'lucide-react-native'
import { Text } from '@/components/ui/text'
import { useRouter } from 'expo-router'
import { useChecklists } from './useChecklists'
import { useActiveChecklist } from './useActiveChecklist'

// git log -1 --format=%ci gives "2026-06-10 11:42:03 +0530" — format to "Jun 10, 11:42"
function fmtBuildDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

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
        className="flex-row items-center gap-1.5 active:opacity-70"
        style={{ flexShrink: 1, minWidth: 0 }}
        onPress={() => setOpen(true)}
      >
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
            {active?.name ?? (isLoading ? 'Loading…' : 'Select list')}
          </Text>
          <Text className="text-muted-foreground" style={{ fontSize: 10, lineHeight: 12 }}>
            {process.env.EXPO_PUBLIC_GIT_COMMIT
              ? `${process.env.EXPO_PUBLIC_GIT_COMMIT} · ${fmtBuildDate(process.env.EXPO_PUBLIC_GIT_DATE)}`
              : 'dev'}
          </Text>
        </View>
        <ChevronDown size={16} color="hsl(220 9% 63%)" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-black/30" onPress={() => setOpen(false)}>
          <View className="mt-20 mx-4 bg-popover rounded-2xl py-1"
            style={{ shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, elevation: 12 }}
          >
            {(checklists ?? []).map((checklist) => {
              const selected = checklist.id === activeChecklistId
              return (
              <Pressable
                key={checklist.id}
                className={`flex-row items-center justify-between px-4 py-3 active:bg-muted ${
                  selected ? 'bg-secondary/10' : ''
                }`}
                onPress={() => {
                  setActiveChecklistId(checklist.id)
                  setOpen(false)
                  router.replace(`/${checklist.id}`)
                }}
              >
                <Text
                  className={selected ? 'text-secondary font-semibold' : 'text-foreground'}
                  style={{ fontSize: 15, flex: 1 }}
                  numberOfLines={1}
                >
                  {checklist.name}
                </Text>
                <Text className="text-muted-foreground" style={{ fontSize: 12, marginLeft: 8 }}>{checklist.task_count}</Text>
              </Pressable>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}
