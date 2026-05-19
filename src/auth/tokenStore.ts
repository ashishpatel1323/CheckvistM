import {
  storageGetSync,
  storageSetSync,
  storageRemoveSync,
  storageGet,
  storageSet,
  storageRemove,
} from '@/platform/storage'

const TOKEN_KEY = 'cv_token'
const EXPIRES_KEY = 'cv_expires_at'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000

// Synchronous accessors (web only; native callers must use async variants)
export function getToken(): string | null {
  return storageGetSync(TOKEN_KEY)
}

export function getExpiresAt(): string | null {
  return storageGetSync(EXPIRES_KEY)
}

export function setToken(token: string): void {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  storageSetSync(TOKEN_KEY, token)
  storageSetSync(EXPIRES_KEY, expiresAt)
}

export function clearToken(): void {
  storageRemoveSync(TOKEN_KEY)
  storageRemoveSync(EXPIRES_KEY)
}

// Async variants for native
export async function getTokenAsync(): Promise<string | null> {
  return storageGet(TOKEN_KEY)
}

export async function setTokenAsync(token: string): Promise<void> {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  await storageSet(TOKEN_KEY, token)
  await storageSet(EXPIRES_KEY, expiresAt)
}

export async function clearTokenAsync(): Promise<void> {
  await storageRemove(TOKEN_KEY)
  await storageRemove(EXPIRES_KEY)
}

export function isTokenExpired(): boolean {
  const expiresAt = getExpiresAt()
  if (!expiresAt) return true
  return new Date(expiresAt) < new Date()
}

export function isRefreshable(): boolean {
  const expiresAt = getExpiresAt()
  if (!expiresAt) return false
  const tokenSetAt = new Date(expiresAt).getTime() - TOKEN_TTL_MS
  const refreshDeadline = tokenSetAt + REFRESH_TTL_MS
  return Date.now() < refreshDeadline
}

export function getTaskTime(taskId: number): string | null {
  return storageGetSync(`tasktime_${taskId}`)
}

export function setTaskTime(taskId: number, time: string): void {
  storageSetSync(`tasktime_${taskId}`, time)
}

export function clearTaskTime(taskId: number): void {
  storageRemoveSync(`tasktime_${taskId}`)
}

export function getExpandedState(taskId: number): boolean {
  return storageGetSync(`cv_expanded_${taskId}`) === 'true'
}

export function setExpandedState(taskId: number, expanded: boolean): void {
  storageSetSync(`cv_expanded_${taskId}`, expanded ? 'true' : 'false')
}
