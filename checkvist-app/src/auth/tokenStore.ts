const TOKEN_KEY = 'cv_token'
const EXPIRES_KEY = 'cv_expires_at'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 1 day
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getExpiresAt(): string | null {
  return localStorage.getItem(EXPIRES_KEY)
}

export function setToken(token: string): void {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EXPIRES_KEY, expiresAt)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EXPIRES_KEY)
}

export function isTokenExpired(): boolean {
  const expiresAt = getExpiresAt()
  if (!expiresAt) return true
  return new Date(expiresAt) < new Date()
}

export function isRefreshable(): boolean {
  // We can refresh up to 90 days from when the token was last set.
  // We approximate by checking if the stored expires_at minus 1 day plus 90 days
  // is still in the future. Since we store expires_at = now + 1 day at setToken time,
  // we add REFRESH_TTL_MS - TOKEN_TTL_MS to get the 90-day window start.
  const expiresAt = getExpiresAt()
  if (!expiresAt) return false
  const tokenSetAt = new Date(expiresAt).getTime() - TOKEN_TTL_MS
  const refreshDeadline = tokenSetAt + REFRESH_TTL_MS
  return Date.now() < refreshDeadline
}

export function getTaskTime(taskId: number): string | null {
  return localStorage.getItem(`tasktime_${taskId}`)
}

export function setTaskTime(taskId: number, time: string): void {
  localStorage.setItem(`tasktime_${taskId}`, time)
}

export function clearTaskTime(taskId: number): void {
  localStorage.removeItem(`tasktime_${taskId}`)
}

export function getExpandedState(taskId: number): boolean {
  return localStorage.getItem(`cv_expanded_${taskId}`) === 'true'
}

export function setExpandedState(taskId: number, expanded: boolean): void {
  localStorage.setItem(`cv_expanded_${taskId}`, expanded ? 'true' : 'false')
}
