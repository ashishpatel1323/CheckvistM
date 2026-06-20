/**
 * clientIdentity — a stable, human-friendly identity for the current install.
 *
 * The same user can be logged in from several clients at once (two browsers + the
 * mobile app), and every Execution Log session syncs to one shared Checkvist list.
 * To tell sessions apart by origin we stamp each one with this install's id + label.
 *
 * Session encoding is synchronous but native storage is async, so the identity is
 * loaded once at startup into a module-level cache and then read synchronously via
 * clientId() / clientLabel().
 */

import { Platform } from 'react-native'
import { storageGet, storageSet } from './storage'

const STORAGE_KEY = 'cv-client-identity'

interface ClientIdentity {
  id: string
  label: string
}

let cached: ClientIdentity | null = null

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through to manual id
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Best-effort friendly label for the current client. */
function deriveLabel(): string {
  if (Platform.OS === 'ios') return 'iOS app'
  if (Platform.OS === 'android') return 'Android app'

  // Web — parse the user agent for browser + OS.
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (!ua) return 'Web'

  let browser = ''
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\//.test(ua) || /Opera/.test(ua)) browser = 'Opera'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os = ''
  if (/iPhone/.test(ua)) os = 'iPhone'
  else if (/iPad/.test(ua)) os = 'iPad'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Linux/.test(ua)) os = 'Linux'

  if (browser && os) return `${browser} · ${os}`
  if (browser) return browser
  if (os) return os
  return 'Web'
}

/** Deterministic HSL color from an id, so the same device renders the same color everywhere. */
export function clientColor(id?: string): string {
  if (!id) return '#9CA3AF' // gray for unknown
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 55%)`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Load (or create + persist) this install's identity. Call once at app startup. */
export async function initClientIdentity(): Promise<void> {
  if (cached) return
  try {
    const raw = await storageGet(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClientIdentity>
      if (parsed && parsed.id) {
        // Refresh the label in case the platform/browser changed since first run.
        cached = { id: parsed.id, label: deriveLabel() }
        if (cached.label !== parsed.label) {
          await storageSet(STORAGE_KEY, JSON.stringify(cached)).catch(() => {})
        }
        return
      }
    }
  } catch {
    // ignore and create fresh below
  }

  cached = { id: randomId(), label: deriveLabel() }
  await storageSet(STORAGE_KEY, JSON.stringify(cached)).catch(() => {})
}

/** Synchronous id getter. Returns 'unknown' if init hasn't completed yet. */
export function clientId(): string {
  return cached?.id ?? 'unknown'
}

/** Synchronous label getter. Falls back to a derived label, then 'Unknown'. */
export function clientLabel(): string {
  return cached?.label ?? deriveLabel() ?? 'Unknown'
}
