import { Platform } from 'react-native'
import * as Haptics from 'expo-haptics'

export async function hapticLight(): Promise<void> {
  if (Platform.OS === 'web') return
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
}

export async function hapticMedium(): Promise<void> {
  if (Platform.OS === 'web') return
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}

export async function hapticSuccess(): Promise<void> {
  if (Platform.OS === 'web') return
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}
