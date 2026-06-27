import { Platform } from 'react-native'

/**
 * Haptic feedback utilities for mobile-first UX
 * Only vibrates on Android/iOS, gracefully skips on web
 */

async function getHaptics() {
  if (Platform.OS === 'web') return null
  try {
    const mod = await import('expo-haptics') as any
    return mod.Haptics
  } catch (e) {
    return null
  }
}

async function getHapticsTypes() {
  try {
    const mod = await import('expo-haptics') as any
    return mod
  } catch (e) {
    return null
  }
}

export async function hapticSelection() {
  if (Platform.OS === 'web') return
  const H = await getHaptics()
  try { H?.selectionAsync() } catch (e) { /* silent */ }
}

export async function hapticSuccess() {
  if (Platform.OS === 'web') return
  const [H, T] = await Promise.all([getHaptics(), getHapticsTypes()])
  try { H?.notificationAsync(T?.HapticsNotificationFeedbackType?.Success ?? 0) } catch (e) { /* silent */ }
}

export async function hapticWarning() {
  if (Platform.OS === 'web') return
  const [H, T] = await Promise.all([getHaptics(), getHapticsTypes()])
  try { H?.notificationAsync(T?.HapticsNotificationFeedbackType?.Warning ?? 1) } catch (e) { /* silent */ }
}

export async function hapticError() {
  if (Platform.OS === 'web') return
  const [H, T] = await Promise.all([getHaptics(), getHapticsTypes()])
  try { H?.notificationAsync(T?.HapticsNotificationFeedbackType?.Error ?? 2) } catch (e) { /* silent */ }
}

export async function hapticLight() {
  if (Platform.OS === 'web') return
  const [H, T] = await Promise.all([getHaptics(), getHapticsTypes()])
  try { H?.impactAsync(T?.HapticsImpactFeedbackStyle?.Light ?? 0) } catch (e) { /* silent */ }
}

export async function hapticMedium() {
  if (Platform.OS === 'web') return
  const [H, T] = await Promise.all([getHaptics(), getHapticsTypes()])
  try { H?.impactAsync(T?.HapticsImpactFeedbackStyle?.Medium ?? 1) } catch (e) { /* silent */ }
}

export async function hapticHeavy() {
  if (Platform.OS === 'web') return
  const [H, T] = await Promise.all([getHaptics(), getHapticsTypes()])
  try { H?.impactAsync(T?.HapticsImpactFeedbackStyle?.Heavy ?? 2) } catch (e) { /* silent */ }
}