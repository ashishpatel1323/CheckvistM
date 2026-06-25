// Shared IPC contract between the Electron main process and the renderer windows.
// Kept dependency-free so it can be imported from both main (Node) and preload.

/** The live timer snapshot shape — mirrors `TimerSnapshot` in src/services/menuBarSync.ts.
 *  Re-declared here (not imported) so the Electron build stays decoupled from the RN source. */
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

/** Actions a non-executor window (the floating window) sends to the main app window. */
export type DesktopAction =
  | { type: 'play' } // resume whatever was last running (execute or routine)
  | { type: 'pause' }
  | { type: 'skip' } // advance routine step / mark execute task complete
  | { type: 'extend'; minutes: number } // +/- estimate or routine duration
  | { type: 'tasksChanged' } // floating created a task; main should invalidate queries

/** Which role a given BrowserWindow plays. Injected by preload as `window.cvDesktop.role`. */
export type DesktopRole = 'main' | 'floating' | 'break'

export const IPC = {
  /** renderer(main) -> main process: latest computed snapshot */
  publishSnapshot: 'cv:publishSnapshot',
  /** main process -> all renderers: snapshot changed */
  snapshot: 'cv:snapshot',
  /** renderer(floating) -> main process: user action */
  dispatch: 'cv:dispatch',
  /** main process -> main renderer: execute this action against the stores */
  action: 'cv:action',
  /** renderer -> main process: open/close the Pomodoro break overlay window */
  setBreak: 'cv:setBreak',
  /** renderer -> main process: hide its own window (re-openable from the tray) */
  hideWindow: 'cv:hideWindow',
} as const
