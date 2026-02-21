import { app, BrowserWindow, screen, nativeTheme, session } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSetting, saveSetting } from './store'
import { DASHBOARD_DEFAULT_WIDTH, DASHBOARD_DEFAULT_HEIGHT, DASHBOARD_MIN_WIDTH, DASHBOARD_MIN_HEIGHT, OVERLAY_DEFAULT_WIDTH, OVERLAY_DEFAULT_HEIGHT, OVERLAY_MIN_WIDTH, OVERLAY_MIN_HEIGHT, OVERLAY_SCREEN_EDGE_OFFSET } from './constants'

const __dirname = dirname(fileURLToPath(import.meta.url))

let dashboardWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

const stealthTrayCallbacks: { hide?: () => void; show?: () => void } = {}

export function registerStealthTrayCallbacks(hide: () => void, show: () => void): void {
  stealthTrayCallbacks.hide = hide
  stealthTrayCallbacks.show = show
}

/** Apply Content-Security-Policy headers to restrict renderer capabilities. */
function applyCSP(win: BrowserWindow): void {
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://*.googleusercontent.com",
            "font-src 'self' data:",
            "connect-src 'self' https://*.raven.app https://*.deepgram.com wss://*.deepgram.com https://api.anthropic.com https://api.openai.com",
            "media-src 'self' blob:",
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

function areBoundsEqual(a: WindowBounds, b: WindowBounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
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
    title: '',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  })

  applyCSP(dashboardWindow)
  disableZoom(dashboardWindow)

  dashboardWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://') && !url.startsWith('http://localhost')) {
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
  })

  // On macOS, hide instead of close so the window can be re-shown
  dashboardWindow.on('close', (e) => {
    if (process.platform === 'darwin' && dashboardWindow && !dashboardWindow.isDestroyed()) {
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

  if (rendererURL) {
    dashboardWindow.loadURL(rendererURL)
  } else {
    dashboardWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

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
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    roundedCorners: false,
    show: false,
    title: 'Raven Overlay',
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  })

  applyCSP(overlayWindow)
  disableZoom(overlayWindow)

  // Force macOS compositor to blend transparency properly
  overlayWindow.setOpacity(0.99)

  // Highest z-level — visible above fullscreen apps and screen savers
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // Prevent throttling when overlay isn't focused
  overlayWindow.webContents.setBackgroundThrottling(false)

  overlayWindow.on('closed', () => {
    overlayWindow = null
  })

  // Load the overlay route
  if (rendererURL) {
    overlayWindow.loadURL(`${rendererURL}#overlay`)
  } else {
    overlayWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'overlay' })
  }

  return overlayWindow
}

export function toggleOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  if (overlayWindow.isVisible()) {
    overlayWindow.hide()
  } else {
    overlayWindow.show()
    overlayWindow.focus()
  }
}

export function showOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.show()
  overlayWindow.focus()
}

export function hideOverlay(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.hide()
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
