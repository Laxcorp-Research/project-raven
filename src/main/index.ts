import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { registerIpcHandlers } from './ipc'
import {
  createDashboardWindow,
  createOverlayWindow,
  getOverlayWindow,
  setStealthMode
} from './windowManager'
import { getSetting } from './store'
import { AudioManager } from './audioManager'
import { ClaudeService } from './claudeService'
import { registerSystemAudioHandlers, setSystemAudioWindows } from './systemAudioNative'
import { databaseService, type Session } from './services/database'
import { sessionManager } from './services/sessionManager'

const __dirname = dirname(fileURLToPath(import.meta.url))
const preloadPath = join(__dirname, '../preload/index.cjs')

const audioManager = new AudioManager()

// Enable screen capture on macOS
app.commandLine.appendSwitch('enable-features', 'ScreenCaptureKitMac')

ipcMain.handle('desktop:get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      fetchWindowIcons: false
    })

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id
    }))
  } catch (err) {
    console.error('[Desktop] Failed to get sources:', err)
    return []
  }
})

// Forward system audio chunks to Deepgram (overlay renderer)
ipcMain.on('system-audio:to-deepgram', (_event, chunk: { data: number[]; timestamp: number }) => {
  const overlayWindow = getOverlayWindow()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('system-audio:for-deepgram', chunk)
  }
})

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

  setSystemAudioWindows(dashboard, overlay)
  sessionManager.setWindows(dashboard, overlay)
  sessionManager.recoverSession()

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
  // Initialize database
  databaseService.initialize()

  registerIpcHandlers()
  registerSystemAudioHandlers()
  boot()

  // Session IPC handlers
  ipcMain.handle('sessions:create', (_event, session: Omit<Session, 'createdAt'>) => {
    return databaseService.createSession(session)
  })

  ipcMain.handle('sessions:update', (_event, id: string, updates: Partial<Session>) => {
    databaseService.updateSession(id, updates)
    return true
  })

  ipcMain.handle('sessions:get', (_event, id: string) => {
    return databaseService.getSession(id)
  })

  ipcMain.handle('sessions:getAll', () => {
    return databaseService.getAllSessions()
  })

  ipcMain.handle('sessions:search', (_event, query: string) => {
    return databaseService.searchSessions(query)
  })

  ipcMain.handle('sessions:delete', (_event, id: string) => {
    return databaseService.deleteSession(id)
  })

  ipcMain.handle('sessions:getInProgress', () => {
    return databaseService.getInProgressSession()
  })

  ipcMain.handle('session:getActive', () => {
    return sessionManager.getActiveSession()
  })

  ipcMain.handle('session:hasActive', () => {
    return sessionManager.hasActiveSession()
  })

  ipcMain.handle('session:regenerateTitle', async (_event, sessionId: string) => {
    return sessionManager.generateTitle(sessionId)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) boot()
  })
})

app.on('before-quit', () => {
  databaseService.close()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
