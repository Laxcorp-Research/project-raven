import { BrowserWindow, screen } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getSetting, saveSetting } from './store'

const __dirname = dirname(fileURLToPath(import.meta.url))

let dashboardWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

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
    width: savedBounds?.width || 1000,
    height: savedBounds?.height || 700,
    x: savedBounds?.x ?? undefined,
    y: savedBounds?.y ?? undefined,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Raven',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

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

  dashboardWindow.on('closed', () => {
    dashboardWindow = null
  })

  if (rendererURL) {
    dashboardWindow.loadURL(rendererURL)
  } else {
    dashboardWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return dashboardWindow
}

export function createOverlayWindow(preloadPath: string, rendererURL: string | null): BrowserWindow {
  const savedBounds = getSetting('overlayBounds')
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

  // Base overlay size for single-line placeholder layout
  const defaultWidth = 500
  const defaultHeight = 176
  const defaultX = screenWidth - defaultWidth - 20
  const defaultY = screenHeight - defaultHeight - 20

  overlayWindow = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    x: savedBounds?.x ?? defaultX,
    y: savedBounds?.y ?? defaultY,
    minWidth: 500,
    minHeight: 170,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    show: false,
    title: 'Raven Overlay',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Keep on top even over full-screen apps
  overlayWindow.setAlwaysOnTop(true, 'floating', 1)
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setMovable(true)

  // Save overlay bounds on move/resize
  overlayWindow.on('resized', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const current = overlayWindow.getBounds()
      const clamped = clampOverlayBoundsToDisplay(current)
      if (!areBoundsEqual(current, clamped)) {
        overlayWindow.setBounds(clamped)
        return
      }
      saveSetting('overlayBounds', clamped)
    }
  })

  overlayWindow.on('moved', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const current = overlayWindow.getBounds()
      const clamped = clampOverlayBoundsToDisplay(current)
      if (!areBoundsEqual(current, clamped)) {
        overlayWindow.setBounds(clamped)
        return
      }
      saveSetting('overlayBounds', clamped)
    }
  })

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
  if (!overlayWindow || overlayWindow.isDestroyed()) return
  overlayWindow.setContentProtection(enabled)
  saveSetting('stealthEnabled', enabled)

  // Notify both windows of stealth change
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('stealth-changed', enabled)
  }
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('stealth-changed', enabled)
  }
}
