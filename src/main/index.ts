import { app, BrowserWindow, globalShortcut } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { registerIpcHandlers } from './ipc'
import {
  createDashboardWindow,
  createOverlayWindow,
  setStealthMode
} from './windowManager'
import { getSetting } from './store'
import { AudioManager } from './audioManager'
import { ClaudeService } from './claudeService'

const __dirname = dirname(fileURLToPath(import.meta.url))
const preloadPath = join(__dirname, '../preload/index.cjs')

const audioManager = new AudioManager()

function registerGlobalHotkeys(
  dashboardWindow: BrowserWindow | null,
  overlayWindow: BrowserWindow | null
): void {
  const modifier = process.platform === 'darwin' ? 'Command' : 'Control'

  globalShortcut.unregisterAll()

  const overlayRegistered = globalShortcut.register(`${modifier}+Shift+H`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide()
      } else {
        overlayWindow.show()
        overlayWindow.focus()
      }
    }
  })

  const recordingRegistered = globalShortcut.register(`${modifier}+Shift+R`, () => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('hotkey:toggle-recording')
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:toggle-recording')
    }
  })

  const aiRegistered = globalShortcut.register(`${modifier}+Return`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:ai-suggestion')
    }
  })

  console.log('[Raven] Hotkeys registered:', {
    overlay: overlayRegistered,
    recording: recordingRegistered,
    aiSuggestion: aiRegistered
  })
}

function boot(): void {
  const rendererURL = process.env.VITE_DEV_SERVER_URL || null

  console.log('[Raven] Preload path:', preloadPath)
  console.log('[Raven] Renderer URL:', rendererURL)

  // Create both windows
  const dashboard = createDashboardWindow(preloadPath, rendererURL)
  const overlay = createOverlayWindow(preloadPath, rendererURL)
  const claudeService = new ClaudeService(overlay)

  audioManager.setWindows(dashboard, overlay)

  // Show overlay after dashboard is ready
  dashboard.on('ready-to-show', () => {
    // Small delay so overlay doesn't flash before dashboard
    setTimeout(() => {
      overlay.show()
    }, 500)
  })

  // Apply stealth mode from saved settings
  const stealthEnabled = getSetting('stealthEnabled')
  if (stealthEnabled) {
    setStealthMode(true)
  }

  registerGlobalHotkeys(dashboard, overlay)
}

app.whenReady().then(() => {
  registerIpcHandlers()
  boot()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) boot()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
