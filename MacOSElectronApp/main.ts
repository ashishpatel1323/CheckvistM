// MacOSElectronApp entry. Boots two windows that load the SAME exported web bundle:
//  - main:     the full app (route "/")
//  - floating: a compact always-on-top timer + Pomodoro (role read by the renderer)
//
// Both windows are part of one process; they share live state through the state hub in
// state.ts (in-memory IPC), so the floating window mirrors the main window with no polling
// and no Checkvist round-trip. The existing Swift menu-bar app + its relay are untouched.
//
// The Pomodoro break overlay is NOT a separate window — its state lives in the floating
// renderer, so on break we expand the floating window to fill the screen (and restore its
// compact bounds afterwards). One renderer owns the state and renders the overlay.

import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, protocol, screen, Tray, type Rectangle } from 'electron'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { IPC } from './ipc'
import { initStateHub } from './state'

// In dev, point at the running Expo web server (pnpm web → http://localhost:8081).
// In prod, serve the static export from dist/ over a custom `app://` scheme. We cannot use
// file:// because the Expo bundle references assets with absolute paths (/_expo/...), which
// only resolve under a real origin; the scheme below maps those paths onto dist/.
const DEV_URL = process.env.CV_DEV_URL || ''
const DIST_DIR = path.join(__dirname, '..', '..', 'dist')
const PRELOAD = path.join(__dirname, 'preload.js')
const APP_ORIGIN = 'app://bundle'

// Must run before app `ready`.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

let mainWindow: BrowserWindow | null = null
let floatingWindow: BrowserWindow | null = null
let floatingCompactBounds: Rectangle | null = null
let tray: Tray | null = null
// When false, closing a window only hides it (re-openable from the tray); set true on real quit.
let isQuitting = false

/** Load the bundle into a window, tagging the role via a query param the preload reads. */
function loadRole(win: BrowserWindow, role: 'main' | 'floating'): void {
  const base = DEV_URL || APP_ORIGIN
  win.loadURL(`${base}/?cvwindow=${role}`)
}

/** Serve dist/ over app://bundle/. "/" maps to index.html; everything else maps 1:1 onto dist/. */
function registerBundleProtocol(): void {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const rel = pathname === '/' || pathname === '' ? '/index.html' : pathname
    const filePath = path.join(DIST_DIR, decodeURIComponent(rel))
    return net.fetch(pathToFileURL(filePath).toString())
  })
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 480,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  loadRole(mainWindow, 'main')
  mainWindow.webContents.on('did-finish-load', () => console.log('[macos] main window loaded'))
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error('[macos] main window failed:', code, desc, url))
  hideOnClose(mainWindow)
  mainWindow.on('show', refreshTrayMenu)
  mainWindow.on('hide', refreshTrayMenu)
  mainWindow.on('closed', () => { mainWindow = null; refreshTrayMenu() })
}

/** Close button hides the window (state preserved) instead of destroying it; the tray re-opens it. */
function hideOnClose(win: BrowserWindow): void {
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })
}

function createFloatingWindow(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) { floatingWindow.show(); return }
  const display = screen.getPrimaryDisplay().workArea
  floatingWindow = new BrowserWindow({
    width: 340,
    height: 152,
    x: display.x + display.width - 360,
    y: display.y + 40,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  // Float above everything, on every Space and monitor — including other apps' full-screen
  // spaces. 'screen-saver' is the highest window level (above a full-screen app's window);
  // visibleOnFullScreen + canJoinAllSpaces (set by setVisibleOnAllWorkspaces) lets it ride
  // along into full-screen Spaces. skipTransformProcessType avoids a dock-icon flicker.
  floatingWindow.setAlwaysOnTop(true, 'screen-saver')
  floatingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  loadRole(floatingWindow, 'floating')
  floatingWindow.webContents.on('did-finish-load', () => console.log('[macos] floating window loaded'))
  floatingWindow.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error('[macos] floating window failed:', code, desc, url))
  hideOnClose(floatingWindow)
  floatingWindow.on('show', refreshTrayMenu)
  floatingWindow.on('hide', refreshTrayMenu)
  floatingWindow.on('closed', () => { floatingWindow = null; refreshTrayMenu() })
}

/** Show/focus the main window, recreating it if it was destroyed. */
function showMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus() }
  else createMainWindow()
}

/** Build the macOS menu-bar (tray) item: opens either window, or quits. */
function buildTray(): void {
  // Use a text title rather than an icon asset so there's nothing to bundle/ship.
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('⏱')
  tray.setToolTip('Checkvist')
  refreshTrayMenu()
}

/** Rebuild the tray menu so each window's checkmark reflects whether it's currently visible. */
function refreshTrayMenu(): void {
  if (!tray) return
  const visible = (w: BrowserWindow | null) => !!w && !w.isDestroyed() && w.isVisible()
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Checkvist', type: 'checkbox', checked: visible(mainWindow), click: () => showMainWindow() },
    { label: 'Show Floating Timer', type: 'checkbox', checked: visible(floatingWindow), click: () => createFloatingWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } },
  ]))
}

/** Expand the floating window to fill the screen for the Pomodoro break overlay, or restore it. */
function setFloatingExpanded(expanded: boolean): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) return
  if (expanded) {
    floatingCompactBounds = floatingWindow.getBounds()
    const display = screen.getPrimaryDisplay().bounds
    floatingWindow.setBounds(display)
    floatingWindow.setAlwaysOnTop(true, 'screen-saver')
    floatingWindow.show()
  } else {
    floatingWindow.setAlwaysOnTop(true, 'screen-saver')
    if (floatingCompactBounds) floatingWindow.setBounds(floatingCompactBounds)
    floatingCompactBounds = null
  }
}

app.whenReady().then(() => {
  if (!DEV_URL) registerBundleProtocol()
  initStateHub(() => mainWindow)

  // The floating renderer's Pomodoro state drives whether the break overlay is showing.
  ipcMain.on(IPC.setBreak, (_evt, open: boolean) => {
    setFloatingExpanded(open)
  })

  // A window's own close (✕) button → hide it (re-openable from the tray).
  ipcMain.on(IPC.hideWindow, (evt) => {
    BrowserWindow.fromWebContents(evt.sender)?.hide()
  })

  buildTray()
  createMainWindow()
  createFloatingWindow()

  app.on('activate', () => showMainWindow())
})

// Real quit (Cmd+Q / tray Quit) must bypass the hide-on-close interception.
app.on('before-quit', () => { isQuitting = true })

app.on('window-all-closed', () => {
  // The tray keeps the app alive on macOS; on other platforms, quit.
  if (process.platform !== 'darwin') app.quit()
})
