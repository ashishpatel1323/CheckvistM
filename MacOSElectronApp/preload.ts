// Bridges the renderer to the Electron main process over a tiny, typed surface.
// Exposed as window.cvDesktop. No nodeIntegration in the renderer.

import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type DesktopAction, type DesktopRole, type DesktopSnapshot } from './ipc'

function readRole(): DesktopRole {
  // Role is passed as ?cvwindow=main|floating|break on the loaded URL.
  try {
    const role = new URLSearchParams(window.location.search).get('cvwindow')
    if (role === 'floating' || role === 'break') return role
  } catch { /* ignore */ }
  return 'main'
}

const api = {
  role: readRole(),

  /** main renderer: push the latest computed snapshot to the hub. */
  publishSnapshot(snapshot: DesktopSnapshot): void {
    ipcRenderer.send(IPC.publishSnapshot, snapshot)
  },

  /** any renderer: subscribe to snapshot broadcasts. Returns an unsubscribe fn. */
  onSnapshot(cb: (s: DesktopSnapshot) => void): () => void {
    const handler = (_e: unknown, s: DesktopSnapshot) => cb(s)
    ipcRenderer.on(IPC.snapshot, handler)
    return () => ipcRenderer.removeListener(IPC.snapshot, handler)
  },

  /** any renderer: fetch the cached snapshot once (for hydrate-on-mount). */
  getSnapshot(): Promise<DesktopSnapshot | null> {
    return ipcRenderer.invoke('cv:getSnapshot')
  },

  /** floating renderer: dispatch a control action to the main renderer. */
  dispatch(action: DesktopAction): void {
    ipcRenderer.send(IPC.dispatch, action)
  },

  /** main renderer: receive actions to execute against the stores. */
  onAction(cb: (a: DesktopAction) => void): () => void {
    const handler = (_e: unknown, a: DesktopAction) => cb(a)
    ipcRenderer.on(IPC.action, handler)
    return () => ipcRenderer.removeListener(IPC.action, handler)
  },

  /** floating renderer: open/close the fullscreen Pomodoro break overlay window. */
  setBreak(open: boolean): void {
    ipcRenderer.send(IPC.setBreak, open)
  },

  /** any renderer: hide its own window (re-openable from the menu-bar tray). */
  closeSelf(): void {
    ipcRenderer.send(IPC.hideWindow)
  },
}

export type CvDesktop = typeof api

contextBridge.exposeInMainWorld('cvDesktop', api)
