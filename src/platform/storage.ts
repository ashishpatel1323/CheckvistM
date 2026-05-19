import { Platform } from 'react-native'

// On web: localStorage. On native: expo-secure-store (encrypted).
// SecureStore values max 2048 bytes; large values (task cache) fall back to AsyncStorage on native.

let SecureStore: typeof import('expo-secure-store') | null = null
if (Platform.OS !== 'web') {
  // Lazy import to avoid loading native modules on web
  SecureStore = require('expo-secure-store')
}

export async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key)
  }
  return SecureStore!.getItemAsync(key)
}

export async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value)
    return
  }
  await SecureStore!.setItemAsync(key, value)
}

export async function storageRemove(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key)
    return
  }
  await SecureStore!.deleteItemAsync(key)
}

// Synchronous get for web only (auth init needs this on web)
export function storageGetSync(key: string): string | null {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key)
  }
  // Native: no sync access — callers must use storageGet
  return null
}

export function storageSetSync(key: string, value: string): void {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value)
  }
}

export function storageRemoveSync(key: string): void {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key)
  }
}
