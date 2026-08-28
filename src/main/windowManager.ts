import { app, BrowserWindow, screen, nativeTheme } from 'electron'
import { createLogger } from './logger'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSetting, saveSetting } from './store'
import { applyOverlayToolWindowStyle } from './windowsOverlayStyle'
import { DASHBOARD_DEFAULT_WIDTH, DASHBOARD_DEFAULT_HEIGHT, DASHBOARD_MIN_WIDTH, DASHBOARD_MIN_HEIGHT } from './constants'

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = createLogger('WindowManager')
const CSP_APPLIED = Symbol.for('raven.cspApplied')

let dashboardWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let overlayEnabled = false
// Tracks whether the overlay has been shown at least once. Used to fire
// 'overlay:shown' only on RE-shows (not the initial boot show), so the
// renderer can re-arm mouse-event forwarding without blocking background
// clicks on first launch. See the 'show' handler in createOverlayWindow.
let overlayHasShownOnce = false

const stealthTrayCallbacks: { hide?: () => void; show?: () => void } = {}

export function registerStealthTrayCallbacks(hide: () => void, show: () => void): void {
  stealthTrayCallbacks.hide = hide
  stealthTrayCallbacks.show = show
}

/** Apply Content-Security-Policy headers to restrict renderer capabilities.
 *  Unpackaged (`npm run dev`) skips this: Vite needs eval/HMR, and registering
 *  the header hook twice on the shared session crashes Chromium's network
 *  service, which leaves both windows blank. Packaged installs it once. */
function applyCSP(win: BrowserWindow): void {
  if (!app.isPackaged) return
  const session = win.webContents.session as Electron.Session & { [CSP_APPLIED]?: boolean }
  if (session[CSP_APPLIED]) return
  session[CSP_APPLIED] = true
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' blob:",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://lh3.googleusercontent.com",
            "font-src 'self' data:",
            "connect-src 'self' https://api.useraven.ai https://api-staging.useraven.ai https://api.deepgram.com wss://api.deepgram.com https://api.anthropic.com https://api.openai.com",
            "media-src 'self' blob:",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'none'",
            "frame-ancestors 'none'",
          ].join('; '),
        ],
      },
    })
  })
}

const DEV_LOAD_RETRY_MS = 2500
const DEV_LOAD_MAX_RETRIES = 8

let reloadDashboard: (() => void) | null = null
let reloadOverlay: (() => void) | null = null

/** Vite is rewritten to 127.0.0.1; the old localhost-only allowlist
 *  cancelled that navigation and left both windows on about:blank. */
export function isAllowedRendererNavigation(url: string): boolean {
  if (!url) return false
  if (url.startsWith('file://')) return true
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function attachRendererDiagnostics(win: BrowserWindow, label: string, retryLoad: () => void): void {
  if (app.isPackaged || process.env.VITEST) return
  let loaded = false
  let retries = 0

  const markLoaded = (): void => {
    if (isAllowedRendererNavigation(win.webContents.getURL())) loaded = true
  }

  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    log.error(`${label} did-fail-load`, { code, desc, url })
  })
  win.webContents.on('render-process-gone', (_event, details) => {
    log.error(`${label} render-process-gone`, details)
  })
  win.webContents.on('did-finish-load', markLoaded)
  win.webContents.on('did-navigate', markLoaded)

  const tick = (): void => {
    if (loaded || win.isDestroyed()) return
    if (retries >= DEV_LOAD_MAX_RETRIES) {
      log.error(`${label} still blank after ${retries} load retries`)
      return
    }
    retries++
    log.warn(`${label} load hung, retrying original URL (${retries}/${DEV_LOAD_MAX_RETRIES})`)
    retryLoad()
    setTimeout(tick, DEV_LOAD_RETRY_MS)
  }
  setTimeout(tick, DEV_LOAD_RETRY_MS)
}

/** Block Ctrl/Cmd +/-/0 and pinch-to-zoom so the app feels native. */
function disableZoom(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (_event, input) => {
    const isZoomKey = input.key === '+' || input.key === '-' || input.key === '=' || input.key === '0'
    if (isZoomKey && (input.control || input.meta)) {
      _event.preventDefault()
    }
  })
  win.webContents.setZoomLevel(0)
  win.webContents.setVisualZoomLevelLimits(1, 1)
}

interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export function overlaySafeInsetsForWindow(
  windowBounds: WindowBounds,
  workArea: { x: number; y: number; width: number; height: number },
): { top: number; right: number; bottom: number; left: number } {
  return {
    top: Math.max(0, Math.round(workArea.y - windowBounds.y)),
    left: Math.max(0, Math.round(workArea.x - windowBounds.x)),
    right: Math.max(0, Math.round((windowBounds.x + windowBounds.width) - (workArea.x + workArea.width))),
    bottom: Math.max(0, Math.round((windowBounds.y + windowBounds.height) - (workArea.y + workArea.height))),
  }
}

export function clampOverlayBoundsToDisplay(bounds: WindowBounds): WindowBounds {
  const display = screen.getDisplayMatching(bounds)
  const workArea = display.workArea

  const clampedWidth = Math.min(bounds.width, workArea.width)
  const clampedHeight = Math.min(bounds.height, workArea.height)

  const maxX = workArea.x + workArea.width - clampedWidth
  const maxY = workArea.y + workArea.height - clampedHeight

  const clampedX = Math.min(Math.max(bounds.x, workArea.x), maxX)
  const clampedY = Math.min(Math.max(bounds.y, workArea.y), maxY)

  return {
    x: Math.round(clampedX),
    y: Math.round(clampedY),
    width: Math.round(clampedWidth),
    height: Math.round(clampedHeight)
  }
}

export function getDashboardWindow(): BrowserWindow | null {
  return dashboardWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow
}

export function createDashboardWindow(preloadPath: string, rendererURL: string | null): BrowserWindow {
  const savedBounds = getSetting('dashboardBounds')

  dashboardWindow = new BrowserWindow({
    width: savedBounds?.width || DASHBOARD_DEFAULT_WIDTH,
    height: savedBounds?.height || DASHBOARD_DEFAULT_HEIGHT,
    x: savedBounds?.x ?? undefined,
    y: savedBounds?.y ?? undefined,
    minWidth: DASHBOARD_MIN_WIDTH,
    minHeight: DASHBOARD_MIN_HEIGHT,
    show: false,
    title: 'Raven',
    backgroundColor: '#ffffff',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          // Pin the traffic lights into the 36px drag strip so they do
          // not sit on the logo row below. Windows stays frameless.
          trafficLightPosition: { x: 16, y: 12 },
        }
      : { frame: false }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: app.isPackaged,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  })

  applyCSP(dashboardWindow)
  disableZoom(dashboardWindow)

  const loadDashboard = (): void => {
    if (!dashboardWindow || dashboardWindow.isDestroyed()) return
    if (rendererURL) dashboardWindow.loadURL(rendererURL)
    else dashboardWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  reloadDashboard = loadDashboard
  attachRendererDiagnostics(dashboardWindow, 'dashboard', loadDashboard)

  if (process.platform === 'win32') {
    dashboardWindow.webContents.setBackgroundThrottling(false)
    dashboardWindow.webContents.on('did-finish-load', () => {
      dashboardWindow?.webContents.executeJavaScript(`
        (function() {
          if (document.querySelector('.win-controls')) return;
          var s = document.createElement('style');
          s.textContent = [
            '.win-controls { display:flex; height:36px; -webkit-app-region:no-drag; position:fixed; top:0; right:0; z-index:99999; }',
            '.win-controls button { width:46px; height:36px; border:none; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; color:#666; }',
            '.win-controls button:hover { background:rgba(0,0,0,0.06); }',
            '.win-controls button.close:hover { background:#e81123; color:#fff; }',
            '.win-controls button svg { width:10px; height:10px; }',
          ].join('\\n');
          document.head.appendChild(s);
          var c = document.createElement('div');
          c.className = 'win-controls';
          c.innerHTML = '<button onclick="window.raven?.windowMinimize?.()" title="Minimize"><svg viewBox="0 0 10 1"><rect fill="currentColor" width="10" height="1"/></svg></button>'
            + '<button onclick="window.raven?.windowMaximize?.()" title="Maximize"><svg viewBox="0 0 10 10"><rect fill="none" stroke="currentColor" stroke-width="1" x="0.5" y="0.5" width="9" height="9"/></svg></button>'
            + '<button class="close" onclick="window.raven?.windowClose?.()" title="Close"><svg viewBox="0 0 10 10"><line stroke="currentColor" stroke-width="1.2" x1="0" y1="0" x2="10" y2="10"/><line stroke="currentColor" stroke-width="1.2" x1="10" y1="0" x2="0" y2="10"/></svg></button>';
          document.body.appendChild(c);
        })()
      `)
    })
  }

  dashboardWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedRendererNavigation(url)) {
      event.preventDefault()
    }
  })
  dashboardWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Save window bounds on move/resize
  dashboardWindow.on('resized', () => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      saveSetting('dashboardBounds', dashboardWindow.getBounds())
    }
  })

  dashboardWindow.on('moved', () => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      saveSetting('dashboardBounds', dashboardWindow.getBounds())
    }
  })

  dashboardWindow.on('ready-to-show', () => {
    dashboardWindow?.show()
    // Electron may switch to Accessory activation policy during the gap between
    // window creation (show:false) and ready-to-show, especially when a panel-type
    // overlay window exists. In stealth mode the dock icon must stay hidden, so
    // keep it hidden; otherwise force it back for a normal (detectable) user.
    // Without the stealth check this unconditionally re-revealed the dock icon
    // whenever the dashboard became ready while undetectable was on.
    if (process.platform === 'darwin' && app.dock) {
      if (getSetting('stealthEnabled')) {
        app.dock.hide()
      } else {
        app.dock.show()
      }
    }
  })

  // Hide-on-close instead of destroy, so the window can be re-shown from
  // the tray. Raven keeps running in the tray + overlay after the
  // dashboard is closed; a real quit goes through app.quit() ("Quit
  // Raven" in the tray), and before-quit in index.ts removes this
  // listener before closing so quit is never blocked.
  //
  // This applies to macOS AND Windows - both ship a persistent tray.
  // Before this fix the guard was darwin-only, so on Windows pressing
  // the custom title-bar close button (-> window:close IPC -> win.close())
  // DESTROYED the dashboard and nulled `dashboardWindow`. After that the
  // tray's showDashboard() / window:show-dashboard only re-show an
  // EXISTING window, so the dashboard could never be brought back - "the
  // window never comes back, not even from the tray icon". Linux is left
  // as close-to-quit (tray support there is unreliable).
  dashboardWindow.on('close', (e) => {
    const hideOnClose = process.platform === 'darwin' || process.platform === 'win32'
    if (hideOnClose && dashboardWindow && !dashboardWindow.isDestroyed()) {
      e.preventDefault()
      dashboardWindow.hide()
    }
  })

  // Apply system theme to dashboard
  const applyTheme = () => {
    if (!dashboardWindow || dashboardWindow.isDestroyed()) return
    const isDark = nativeTheme.shouldUseDarkColors
    dashboardWindow.webContents.send('theme-changed', isDark ? 'dark' : 'light')
    if (process.platform === 'darwin') {
      dashboardWindow.setBackgroundColor(isDark ? '#1a1a2e' : '#ffffff')
    }
  }
  nativeTheme.on('updated', applyTheme)
  dashboardWindow.on('ready-to-show', applyTheme)

  dashboardWindow.on('closed', () => {
    dashboardWindow = null
    nativeTheme.removeListener('updated', applyTheme)
  })

  loadDashboard()

  return dashboardWindow
}

export function createOverlayWindow(preloadPath: string, rendererURL: string | null): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { x, y, width, height } = primaryDisplay.bounds

  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    roundedCorners: false,
    show: false,
    title: 'Raven Overlay',
    // Windows: keep the overlay focusable (the BrowserWindow default).
    // A focusable:false (WS_EX_NOACTIVATE) window loses setIgnoreMouseEvents
    // (forward:true) mouse-move forwarding after a hide -> re-show cycle,
    // which left the panel click-through and dead after Ctrl+\ (issue D).
    // We avoid stealing focus from the meeting by always showing via
    // showInactive() (see showOverlayWindow) - the overlay only activates
    // when the user actually clicks its UI, and skipTaskbar keeps it out of
    // the taskbar/Alt-Tab. macOS uses a non-activating panel window.
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: app.isPackaged,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  })

  applyCSP(overlayWindow)
  disableZoom(overlayWindow)

  const loadOverlay = (): void => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    if (rendererURL) overlayWindow.loadURL(`${rendererURL}#overlay`)
    else overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }
  reloadOverlay = loadOverlay
  attachRendererDiagnostics(overlayWindow, 'overlay', loadOverlay)

  if (process.platform === 'darwin') {
    overlayWindow.setOpacity(0.99)
    overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else {
    overlayWindow.setAlwaysOnTop(true, 'floating')
    // The overlay is focusable (so mouse-forwarding survives Ctrl+\, issue D),
    // which would otherwise make it appear in Alt-Tab. WS_EX_TOOLWINDOW keeps
    // it out of the taskbar AND Alt-Tab. Applied while still hidden (show:false)
    // so it takes effect before the first show. Best-effort / Windows-only.
    applyOverlayToolWindowStyle(overlayWindow)
  }

  // Prevent throttling when overlay isn't focused
  overlayWindow.webContents.setBackgroundThrottling(false)

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  overlayWindow.on('show', () => {
    if (!overlayEnabled && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide()
      return
    }
    // On a RE-show (e.g. after Ctrl+\ hide), Windows can stop forwarding
    // mouse-move messages to a click-through window, which leaves the
    // overlay stuck ignoring the cursor - it "bleeds" through to the app
    // behind and the panel can't be grabbed. Tell the renderer to re-arm
    // its mouse passthrough. Skipped on the very first (boot) show so we
    // don't briefly capture background clicks before the user interacts.
    if (overlayHasShownOnce && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('overlay:shown')
    }
    overlayHasShownOnce = true
  })

  // Unpackaged: don't race the dashboard's first Vite request. Dual loadURL
  // at boot is what hung Chromium's network service into a blank window.
  if (!app.isPackaged && !process.env.VITEST) {
    setTimeout(loadOverlay, 400)
  } else {
    loadOverlay()
  }

  return overlayWindow
}

/**
 * Show (or re-show) the overlay with mouse-event forwarding intact.
 *
 * On Windows, hiding the overlay and re-showing it with show()+focus()
 * permanently drops the mouse-move forwarding hook that powers the
 * overlay's click-through hit-testing - the panel then ignores the cursor
 * entirely and clicks "bleed" through to the app behind (Electron
 * #15376 / #40486). Re-applying setIgnoreMouseEvents alone does NOT fix
 * it. The reliable re-arm is showInactive() (which rebuilds the native
 * window's mouse hook) plus a fresh setIgnoreMouseEvents(true,{forward})
 * BEFORE showing; the renderer's passthrough hit-testing then works again
 * after Ctrl+\. showInactive also avoids stealing focus from the meeting
 * (the overlay is focusable:false on Windows anyway; typing is handled by
 * setOverlayFocusable on the input's focus).
 *
 * macOS doesn't have this bug and uses a panel window, so it keeps the
 * existing show()+focus() behavior untouched.
 */
export function showOverlayWindow(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  if (process.platform === 'win32') {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
    overlayWindow.showInactive()
  } else {
    overlayWindow.show()
    overlayWindow.focus()
  }
}

export function toggleOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
  } else if (overlayEnabled) {
    showOverlayWindow()
  }
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayEnabled) return
  showOverlayWindow()
}

export function setOverlayEnabled(enabled: boolean): void {
  overlayEnabled = enabled
  if (!enabled) hideOverlay()
}

export function hideOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.hide()
}

/**
 * Activate the overlay so its chat/Assist text box can receive keyboard
 * focus. Called from the input's onMouseDown.
 *
 * The overlay is created focusable on Windows (see createOverlayWindow) and
 * shown inactive so it never steals focus on appearance; activating it on
 * click makes typing reliable after a re-show.
 *
 * We deliberately do NOT honor `focusable === false`: dropping focusability
 * (WS_EX_NOACTIVATE) makes the overlay lose setIgnoreMouseEvents
 * (forward:true) mouse-move forwarding across a hide -> re-show, which left
 * the whole panel click-through and dead after Ctrl+\ (issue D). A stray
 * `false` is therefore a no-op rather than a regression.
 *
 * macOS uses a `panel` overlay that already accepts text input, so this is
 * a Windows-only concern; on every other platform it's a no-op.
 */
export function setOverlayFocusable(focusable: boolean): void {
  if (process.platform !== 'win32') return
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  // Never make the overlay non-focusable - it breaks mouse forwarding after
  // Ctrl+\ (issue D). Only honor activation requests.
  if (!focusable) return
  overlayWindow.setFocusable(true)
  overlayWindow.focus()
}

export function setStealthMode(enabled: boolean): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setContentProtection(enabled)
    overlayWindow.webContents.send('stealth-changed', enabled)
  }
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.setContentProtection(enabled)
    dashboardWindow.webContents.send('stealth-changed', enabled)
  }

  if (enabled) {
    if (stealthTrayCallbacks.hide) stealthTrayCallbacks.hide()
    if (process.platform === 'darwin' && app.dock) {
      app.dock.hide()
    }
  } else {
    if (stealthTrayCallbacks.show) stealthTrayCallbacks.show()
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show()
    }
  }

  saveSetting('stealthEnabled', enabled)
}

/** Rewrite Vite's localhost URL to IPv4. Chromium on macOS can hang or
 *  crash its network service on `localhost` (::1), leaving a blank window. */
export function ipv4RendererURL(url: string | null): string | null {
  if (!url) return null
  return url.replace(/:\/\/localhost(?=[:/]|$)/, '://127.0.0.1')
}

/** Re-navigate both windows. Used after Chromium's network service crashes
 *  during `npm run dev` (the first load of localhost hangs and both windows
 *  stay blank). */
export function reloadAllWindows(): void {
  reloadDashboard?.()
  reloadOverlay?.()
}

export function shouldReloadAfterChildProcessGone(details: {
  type?: string
  reason?: string
  serviceName?: string
}): boolean {
  // Vite HMR kills Electron helpers with reason 'killed'. Don't reload then.
  if (details.reason === 'killed') return false
  return (
    details.type === 'Network' ||
    details.serviceName === 'network.mojom.NetworkService'
  )
}
