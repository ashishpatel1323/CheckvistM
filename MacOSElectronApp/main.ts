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
import * as fs from 'fs'
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

// Inline HTML for the loading spinner shown while the 5.1 MB JS bundle parses.
// A centered pulsing ring in the brand color (#E8632A) on a light grey background.
// Once React mounts, it replaces #root's innerHTML, so the spinner disappears automatically.
const SPINNER_HTML = `
  <style>
    @keyframes cv-spin { to { transform: rotate(360deg); } }
    #root {
      display: flex;
      height: 100%;
      align-items: center;
      justify-content: center;
      background: #F5F5F5;
    }
    #cv-spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #E5E7EB;
      border-top-color: #E8632A;
      border-radius: 50%;
      animation: cv-spin 0.8s linear infinite;
      will-change: transform;
    }
  </style>
  <div id="cv-spinner"></div>
`

/** Load the bundle into a window, tagging the role via a query param the preload reads. */
function loadRole(win: BrowserWindow, role: 'main' | 'floating'): void {
  const base = DEV_URL || APP_ORIGIN
  win.loadURL(`${base}/?cvwindow=${role}`)
}

/**
 * Serve dist/ over app://bundle/.
 *  - "/" (index.html): rewritten to inject a loading spinner inside #root so the user sees
 *    a pulsing ring instead of a blank white screen while the 5.1 MB JS bundle parses.
 *  - Everything else: streamed straight from disk.
 */
function registerBundleProtocol(): void {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const rel = pathname === '/' || pathname === '' ? '/index.html' : pathname

    // Special-case index.html: rewrite it with a loading spinner.
    if (rel === '/index.html') {
      try {
        const filePath = path.join(DIST_DIR, 'index.html')
        let html = fs.readFileSync(filePath, 'utf-8')
        html = html.replace('<div id="root"></div>', `<div id="root">${SPINNER_HTML}</div>`)
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      } catch (err) {
        console.error('[macos] failed to read index.html for spinner injection:', err)
        // Fall through to default streaming fallback
      }
    }

    // Default: stream from disk.
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
    show: false,
    backgroundColor: '#F5F5F5',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
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
    show: false,
    backgroundColor: '#FFFFFF',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  floatingWindow.once('ready-to-show', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) floatingWindow.show()
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

/**
 * Create the floating window after the main window has finished loading its bundle.
 * This avoids two webContents parsing the 5.1 MB JS bundle concurrently, giving the main
 * window the CPU for its first paint. Includes a 1.2 s fallback timer in case loading
 * is slow or the did-finish-load never fires.
 */
function deferredCreateFloatingWindow(): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let done = false

  function spawn() {
    if (done) return
    done = true
    if (timer) { clearTimeout(timer); timer = null }
    createFloatingWindow()
  }

  // Listen for main window load completion.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.once('did-finish-load', spawn)
  }

  // Fallback timer — create floating window after 1.2 s regardless.
  timer = setTimeout(spawn, 1200)
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
  // Create the floating window after main window loads (with fallback), avoiding concurrent
  // JS bundle parsing that causes white-screen delays.
  deferredCreateFloatingWindow()

  app.on('activate', () => showMainWindow())
})

// Real quit (Cmd+Q / tray Quit) must bypass the hide-on-close interception.
app.on('before-quit', () => { isQuitting = true })

app.on('window-all-closed', () => {
  // The tray keeps the app alive on macOS; on other platforms, quit.
  if (process.platform !== 'darwin') app.quit()
})