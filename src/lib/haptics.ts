import { Haptics, HapticsSelectionTypes } from 'expo-haptics'
import { Platform } from 'react-native'

/**
 * Haptic feedback utilities for mobile-first UX
 * Only vibrates on Android/iOS, gracefully skips on web
 */

export async function hapticSelection() {
  if (Platform.OS === 'web') return
  try {
    await Haptics.selectionAsync()
  } catch (e) {
    // Silently fail if haptics not available
  }
}

export async function hapticSuccess() {
  if (Platform.OS === 'web') return
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  } catch (e) {
    // Silently fail
  }
}

export async function hapticWarning() {
  if (Platform.OS === 'web') return
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  } catch (e) {
    // Silently fail
  }
}

export async function hapticError() {
  if (Platform.OS === 'web') return
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  } catch (e) {
    // Silently fail
  }
}

export async function hapticLight() {
  if (Platform.OS === 'web') return
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  } catch (e) {
    // Silently fail
  }
}

export async function hapticMedium() {
  if (Platform.OS === 'web') return
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  } catch (e) {
    // Silently fail
  }
}

export async function hapticHeavy() {
  if (Platform.OS === 'web') return
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
  } catch (e) {
    // Silently fail
  }
}
