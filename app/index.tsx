import { Redirect } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { useAuth } from '@/auth/useAuth'
import { useActiveChecklist } from '@/features/checklists/useActiveChecklist'

export default function Index() {
  const token = useAuth((s) => s.token)
  const isInitialized = useAuth((s) => s.isInitialized)
  const { activeChecklistId } = useActiveChecklist()

  // Wait for SecureStore to load before routing — prevents flash-to-login on cold start
  if (!isInitialized) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a2e' }}>
        <ActivityIndicator color="#E8632A" size="large" />
      </View>
    )
  }

  if (!token) return <Redirect href="/login" />
  if (activeChecklistId) return <Redirect href={`/${activeChecklistId}`} />
  return <Redirect href="/select-list" />
}
