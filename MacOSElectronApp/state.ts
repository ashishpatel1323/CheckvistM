// Main-process timer-state hub. The canonical Zustand stores still live in the MAIN app
// renderer (single source of truth); this hub only (a) caches the latest snapshot so a
// late-joining window — e.g. the floating window reopened mid-timer — can hydrate immediately,
// and (b) relays actions from the floating window to the main renderer for execution.

import { BrowserWindow, ipcMain } from 'electron'
import { IPC, type DesktopAction, type DesktopSnapshot } from './ipc'

let latest: DesktopSnapshot | null = null

/** Register IPC handlers. Call once after the main window exists. */
export function initStateHub(getMainWindow: () => BrowserWindow | null): void {
  // Main renderer publishes its computed snapshot ~1/s. Cache + fan out to every window.
  ipcMain.on(IPC.publishSnapshot, (_evt, snapshot: DesktopSnapshot) => {
    latest = snapshot
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.snapshot, snapshot)
    }
  })

  // Floating window dispatches a control action; forward it to the main renderer to execute.
  ipcMain.on(IPC.dispatch, (_evt, action: DesktopAction) => {
    const main = getMainWindow()
    if (main && !main.isDestroyed()) main.webContents.send(IPC.action, action)
  })

  // Any renderer can ask for the cached snapshot synchronously on mount.
  ipcMain.handle('cv:getSnapshot', () => latest)
}

export function getLatestSnapshot(): DesktopSnapshot | null {
  return latest
}
