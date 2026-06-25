// Renderer-side access to the MacOSElectronApp IPC bridge (window.cvDesktop, injected by the
// Electron preload). Everything here is a safe no-op on web / iOS / Android, so the same source
// runs unchanged on every platform — only inside the Electron windows does it light up.

export interface DesktopSnapshot {
  mode: 'execute' | 'routine' | 'idle'
  label: string
  sublabel?: string
  baseSec: number
  startedAtMs: number
  targetSec: number
  isPaused: boolean
  isOverrun: boolean
  updatedAt: number
}

export type DesktopAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'skip' }
  | { type: 'extend'; minutes: number }
  | { type: 'tasksChanged' }

export type DesktopRole = 'main' | 'floating' | 'break'

interface CvDesktop {
  role: DesktopRole
  publishSnapshot(s: DesktopSnapshot): void
  onSnapshot(cb: (s: DesktopSnapshot) => void): () => void
  getSnapshot(): Promise<DesktopSnapshot | null>
  dispatch(a: DesktopAction): void
  onAction(cb: (a: DesktopAction) => void): () => void
  setBreak(open: boolean): void
  closeSelf(): void
}

function get(): CvDesktop | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { cvDesktop?: CvDesktop }).cvDesktop ?? null
}

/** True when running inside any MacOSElectronApp window. */
export function isDesktop(): boolean {
  return get() != null
}

/** Which Electron window this renderer is. 'main' when not in Electron at all. */
export function desktopRole(): DesktopRole {
  return get()?.role ?? 'main'
}

export function publishSnapshot(s: DesktopSnapshot): void {
  get()?.publishSnapshot(s)
}

export function onDesktopSnapshot(cb: (s: DesktopSnapshot) => void): () => void {
  return get()?.onSnapshot(cb) ?? (() => {})
}

export function getDesktopSnapshot(): Promise<DesktopSnapshot | null> {
  return get()?.getSnapshot() ?? Promise.resolve(null)
}

export function dispatchDesktop(a: DesktopAction): void {
  get()?.dispatch(a)
}

export function onDesktopAction(cb: (a: DesktopAction) => void): () => void {
  return get()?.onAction(cb) ?? (() => {})
}

export function setBreakWindow(open: boolean): void {
  get()?.setBreak(open)
}

export function closeSelfWindow(): void {
  get()?.closeSelf()
}
