import { Platform } from 'react-native'

export async function hapticLight(): Promise<void> {
  if (Platform.OS === 'web') return
  const Haptics = await import('expo-haptics')
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
}

export async function hapticMedium(): Promise<void> {
  if (Platform.OS === 'web') return
  const Haptics = await import('expo-haptics')
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}

export async function hapticSuccess(): Promise<void> {
  if (Platform.OS === 'web') return
  const Haptics = await import('expo-haptics')
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}
