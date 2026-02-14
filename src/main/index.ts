import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, screen } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type WebSocket from 'ws'
import { registerIpcHandlers } from './ipc'
import {
  createDashboardWindow,
  createOverlayWindow,
  getOverlayWindow,
  setStealthMode
} from './windowManager'
import { getSetting, getStore } from './store'
import { AudioManager } from './audioManager'
import { ClaudeService } from './claudeService'
import { registerSystemAudioHandlers, setSystemAudioWindows } from './systemAudioNative'
import { databaseService, type Session, type Mode } from './services/database'
import { sessionManager } from './services/sessionManager'
import { seedBuiltinModes, resetBuiltinMode } from './services/builtinModes'
import { generateSessionSummary } from './services/summaryService'

const __dirname = dirname(fileURLToPath(import.meta.url))
const preloadPath = join(__dirname, '../preload/index.cjs')

const audioManager = new AudioManager()
const store = getStore()
let testTranscriptionWs: WebSocket | null = null
let testTranscriptionCleanup: (() => void) | null = null

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

  // Toggle Visibility: Cmd/Ctrl + \
  const visibilityRegistered = globalShortcut.register(`${modifier}+\\`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (overlayWindow.isVisible()) {
        overlayWindow.hide()
      } else {
        overlayWindow.show()
        overlayWindow.focus()
        overlayWindow.setAlwaysOnTop(true, 'floating', 1)
      }
    }
  })

  // Ask Raven (AI Suggestion): Cmd/Ctrl + Enter
  const aiRegistered = globalShortcut.register(`${modifier}+Return`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:ai-suggestion')
      // Make sure overlay is visible when asking for help
      if (!overlayWindow.isVisible()) {
        overlayWindow.show()
        overlayWindow.focus()
      }
    }
  })

  // Toggle Recording: Cmd/Ctrl + R
  const recordingRegistered = globalShortcut.register(`${modifier}+R`, () => {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('hotkey:toggle-recording')
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:toggle-recording')
    }
  })

  // Clear Conversation: Cmd/Ctrl + Shift + R
  const clearRegistered = globalShortcut.register(`${modifier}+Shift+R`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:clear-conversation')
    }
  })

  // Move Window: Cmd/Ctrl + Arrow Keys
  const moveUpRegistered = globalShortcut.register(`${modifier}+Up`, () => {
    moveOverlayWindow(overlayWindow, 'up')
  })

  const moveDownRegistered = globalShortcut.register(`${modifier}+Down`, () => {
    moveOverlayWindow(overlayWindow, 'down')
  })

  const moveLeftRegistered = globalShortcut.register(`${modifier}+Left`, () => {
    moveOverlayWindow(overlayWindow, 'left')
  })

  const moveRightRegistered = globalShortcut.register(`${modifier}+Right`, () => {
    moveOverlayWindow(overlayWindow, 'right')
  })

  // Scroll: Cmd/Ctrl + Shift + Arrow Keys
  const scrollUpRegistered = globalShortcut.register(`${modifier}+Shift+Up`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:scroll-up')
    }
  })

  const scrollDownRegistered = globalShortcut.register(`${modifier}+Shift+Down`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:scroll-down')
    }
  })

  console.log('[Raven] Hotkeys registered:', {
    visibility: visibilityRegistered,
    aiSuggestion: aiRegistered,
    recording: recordingRegistered,
    clear: clearRegistered,
    moveUp: moveUpRegistered,
    moveDown: moveDownRegistered,
    moveLeft: moveLeftRegistered,
    moveRight: moveRightRegistered,
    scrollUp: scrollUpRegistered,
    scrollDown: scrollDownRegistered
  })
}

function moveOverlayWindow(
  overlayWindow: BrowserWindow | null,
  direction: 'up' | 'down' | 'left' | 'right'
): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return

  const bounds = overlayWindow.getBounds()
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
  const workArea = display.workArea
  const step = 50 // pixels to move

  let newX = bounds.x
  let newY = bounds.y

  switch (direction) {
    case 'up':
      newY = Math.max(workArea.y, bounds.y - step)
      break
    case 'down':
      newY = Math.min(workArea.y + workArea.height - bounds.height, bounds.y + step)
      break
    case 'left':
      newX = Math.max(workArea.x, bounds.x - step)
      break
    case 'right':
      newX = Math.min(workArea.x + workArea.width - bounds.width, bounds.x + step)
      break
  }

  overlayWindow.setBounds({ ...bounds, x: newX, y: newY })
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
  seedBuiltinModes()

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

  ipcMain.handle('sessions:get-messages', (_event, sessionId: string) => {
    return databaseService.getSessionMessages(sessionId)
  })

  ipcMain.handle('sessions:add-message', (_event, sessionId: string, role: 'user' | 'assistant', content: string) => {
    return databaseService.addSessionMessage(sessionId, role, content)
  })

  ipcMain.handle('sessions:delete', (_event, id: string) => {
    const deleted = databaseService.deleteSession(id)
    if (deleted) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('sessions:list-updated')
      })
    }
    return deleted
  })

  ipcMain.handle('sessions:update-title', (_event, id: string, title: string) => {
    databaseService.updateSession(id, { title })
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('sessions:list-updated')
    })
    return true
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

  ipcMain.handle('sessions:regenerate-summary', async (_event, sessionId: string) => {
    const session = databaseService.getSession(sessionId)
    if (!session || !session.transcript || session.transcript.length === 0) return false

    const anthropicApiKey = getSetting('anthropicApiKey') as string
    if (!anthropicApiKey) return false

    const transcriptText = session.transcript
      .filter((e) => e.isFinal)
      .map((e) => `${e.source === 'mic' ? 'You' : 'Them'}: ${e.text}`)
      .join('\n')

    const result = await generateSessionSummary(transcriptText, session.modeId, anthropicApiKey)
    databaseService.updateSession(sessionId, {
      title: result.title || session.title,
      summary: result.summary,
    })

    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('sessions:list-updated')
    })
    return true
  })

  // ==================== MODE IPC HANDLERS ====================

  ipcMain.handle('modes:get-all', async () => {
    try {
      return databaseService.getAllModes()
    } catch (error) {
      console.error('[IPC] modes:get-all error:', error)
      return []
    }
  })

  ipcMain.handle('modes:get', async (_event, id: string) => {
    try {
      return databaseService.getMode(id)
    } catch (error) {
      console.error('[IPC] modes:get error:', error)
      return null
    }
  })

  ipcMain.handle('modes:create', async (_event, mode: Omit<Mode, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      return databaseService.createMode(mode)
    } catch (error) {
      console.error('[IPC] modes:create error:', error)
      throw error
    }
  })

  ipcMain.handle('modes:update', async (_event, id: string, updates: Partial<Mode>) => {
    try {
      return databaseService.updateMode(id, updates)
    } catch (error) {
      console.error('[IPC] modes:update error:', error)
      return null
    }
  })

  ipcMain.handle('modes:delete', async (_event, id: string) => {
    try {
      return databaseService.deleteMode(id)
    } catch (error) {
      console.error('[IPC] modes:delete error:', error)
      return false
    }
  })

  ipcMain.handle('modes:duplicate', async (_event, id: string, newName: string) => {
    try {
      return databaseService.duplicateMode(id, newName)
    } catch (error) {
      console.error('[IPC] modes:duplicate error:', error)
      return null
    }
  })

  ipcMain.handle('modes:reset-builtin', async (_event, id: string) => {
    try {
      const success = resetBuiltinMode(id)
      if (success) {
        return databaseService.getMode(id)
      }
      return null
    } catch (error) {
      console.error('[IPC] modes:reset-builtin error:', error)
      return null
    }
  })

  ipcMain.handle('modes:get-active', async () => {
    try {
      return databaseService.getActiveMode()
    } catch (error) {
      console.error('[IPC] modes:get-active error:', error)
      return null
    }
  })

  ipcMain.handle('modes:set-active', async (_event, id: string) => {
    try {
      return databaseService.setActiveMode(id)
    } catch (error) {
      console.error('[IPC] modes:set-active error:', error)
      return false
    }
  })

  // Test transcription (doesn't create sessions)
  ipcMain.handle('transcription:start-test', async (event, deviceId: string) => {
    const apiKey = getSetting('deepgramApiKey') as string
    if (!apiKey) {
      return { success: false, error: 'No Deepgram API key' }
    }

    try {
      if (testTranscriptionWs) {
        testTranscriptionWs.close()
        testTranscriptionWs = null
      }

      const sender = event.sender
      const { default: WebSocketModule } = await import('ws')

      // Get language setting from store
      const transcriptionLanguage = (store.get('transcriptionLanguage') as string) || 'en'

      const params = new URLSearchParams({
        model: 'nova-3',
        language: transcriptionLanguage,
        smart_format: 'true',
        interim_results: 'true',
        punctuate: 'true',
        sample_rate: '16000',
        channels: '1',
        encoding: 'linear16',
      })

      const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`

      testTranscriptionWs = new WebSocketModule(url, {
        headers: { Authorization: `Token ${apiKey}` },
      })

      testTranscriptionWs.onopen = () => {
        console.log('[Test Transcription] Connected', deviceId ? `device: ${deviceId}` : '(default)')
        const keepAlive = setInterval(() => {
          if (testTranscriptionWs?.readyState === 1) {
            testTranscriptionWs.send(JSON.stringify({ type: 'KeepAlive' }))
          }
        }, 8000)

        testTranscriptionCleanup = () => {
          clearInterval(keepAlive)
        }
      }

      testTranscriptionWs.onmessage = (messageEvent: { data: unknown }) => {
        try {
          const data = JSON.parse(
            typeof messageEvent.data === 'string' ? messageEvent.data : String(messageEvent.data)
          )
          const transcript = data.channel?.alternatives?.[0]?.transcript

          if (transcript) {
            sender.send('transcription:test-update', {
              text: transcript,
              isFinal: data.is_final,
            })
          }
        } catch (err) {
          console.error('[Test Transcription] Parse error:', err)
        }
      }

      testTranscriptionWs.onerror = (err: { message?: string }) => {
        console.error('[Test Transcription] Error:', err.message || err)
      }

      testTranscriptionWs.onclose = () => {
        console.log('[Test Transcription] Closed')
        if (testTranscriptionCleanup) {
          testTranscriptionCleanup()
          testTranscriptionCleanup = null
        }
        testTranscriptionWs = null
      }

      return { success: true }
    } catch (error) {
      console.error('[Test Transcription] Failed to start:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('transcription:stop-test', async () => {
    if (testTranscriptionWs) {
      try {
        testTranscriptionWs.send(JSON.stringify({ type: 'CloseStream' }))
        testTranscriptionWs.close()
      } catch (err) {
        console.error('[Test Transcription] Close error:', err)
      }
      testTranscriptionWs = null
    }

    if (testTranscriptionCleanup) {
      testTranscriptionCleanup()
      testTranscriptionCleanup = null
    }
    return { success: true }
  })

  ipcMain.handle('transcription:send-test-audio', async (_event, buffer: ArrayBuffer) => {
    if (testTranscriptionWs?.readyState === 1) {
      try {
        testTranscriptionWs.send(Buffer.from(buffer))
      } catch (err) {
        console.error('[Test Transcription] Send error:', err)
      }
    }
    return { success: true }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) boot()
  })
})

app.on('before-quit', () => {
  if (testTranscriptionWs) {
    try {
      testTranscriptionWs.close()
    } catch (err) {
      console.error('[Test Transcription] Close on quit error:', err)
    }
    testTranscriptionWs = null
  }
  if (testTranscriptionCleanup) {
    testTranscriptionCleanup()
    testTranscriptionCleanup = null
  }
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
