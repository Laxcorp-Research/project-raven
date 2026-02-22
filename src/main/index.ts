import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer } from 'electron'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type WebSocket from 'ws'
import { registerIpcHandlers } from './ipc'
import {
  createDashboardWindow,
  createOverlayWindow,
  getDashboardWindow,
  getOverlayWindow,
  setStealthMode,
  registerStealthTrayCallbacks
} from './windowManager'
import { getSetting, getStore, saveSetting, hasApiKeys } from './store'
import { OVERLAY_SHOW_DELAY_MS, AUDIO_SAMPLE_RATE, AUDIO_CHANNELS, DEEPGRAM_KEEPALIVE_MS } from './constants'
import { AudioManager } from './audioManager'
import { ClaudeService } from './claudeService'
import { registerSystemAudioHandlers } from './systemAudioNative'
import { databaseService, type Session, type Mode } from './services/database'
import { sessionManager } from './services/sessionManager'
import { seedBuiltinModes, resetBuiltinMode } from './services/builtinModes'
import { generateSessionSummary } from './services/summaryService'
import { initializeProFeatures } from './proLoader'
import { createTray, destroyTray, setTrayOnboarding, setTrayVisibility } from './trayManager'
import { initAutoUpdater, stopAutoUpdater } from './autoUpdater'
import { initAnalytics } from './analytics'
import { registerPermissionHandlers } from './permissions'
import { createLogger } from './logger'
import { isProMode } from './store'

const log = createLogger('Raven')
const ipcLog = createLogger('IPC')

const __dirname = dirname(fileURLToPath(import.meta.url))
const preloadPath = join(__dirname, '../preload/index.cjs')

const audioManager = new AudioManager()
const store = getStore()
let testTranscriptionWs: WebSocket | null = null
let testTranscriptionCleanup: (() => void) | null = null

// Enable screen capture on macOS
app.commandLine.appendSwitch('enable-features', 'ScreenCaptureKitMac')

// Register raven:// protocol + macOS open-url listener early (before app.whenReady)
async function initDeepLinksEarly(): Promise<void> {
  try {
    const { registerProtocol, registerOpenUrlHandler } = await import(
      /* @vite-ignore */ '../pro/main/deepLink'
    )
    registerProtocol()
    registerOpenUrlHandler()
  } catch {
    // src/pro/ not present (open-source build) — skip silently
  }
}
void initDeepLinksEarly()

// Single-instance lock + second-instance handler — must run AFTER app is ready
async function initDeepLinksReady(): Promise<void> {
  try {
    const { setupDeepLinkHandlers } = await import(
      /* @vite-ignore */ '../pro/main/deepLink'
    )
    setupDeepLinkHandlers()
  } catch {
    // src/pro/ not present — skip
  }
}

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
    log.error('Failed to get desktop sources:', err)
    return []
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
        overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1)
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

  // Move Overlay Panel: Cmd/Ctrl + Arrow Keys (sends to renderer to adjust CSS position)
  globalShortcut.register(`${modifier}+Up`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:move', 'up')
    }
  })
  globalShortcut.register(`${modifier}+Down`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:move', 'down')
    }
  })
  globalShortcut.register(`${modifier}+Left`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:move', 'left')
    }
  })
  globalShortcut.register(`${modifier}+Right`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:move', 'right')
    }
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

  log.info('Hotkeys registered:', {
    visibility: visibilityRegistered,
    aiSuggestion: aiRegistered,
    recording: recordingRegistered,
    clear: clearRegistered,
    scrollUp: scrollUpRegistered,
    scrollDown: scrollDownRegistered
  })

  // Window move (Cmd+Arrow) registered above — requires Accessibility permission on macOS
}


function boot(): void {
  const rendererURL = process.env.VITE_DEV_SERVER_URL || null

  log.debug('Preload path:', preloadPath)
  log.debug('Renderer URL:', rendererURL)

  // Create both windows
  const dashboard = createDashboardWindow(preloadPath, rendererURL)
  const overlay = createOverlayWindow(preloadPath, rendererURL)
  const claudeService = new ClaudeService(overlay)

  sessionManager.setWindows(dashboard, overlay)
  sessionManager.recoverSession()

  audioManager.setWindows(dashboard, overlay)

  const isPro = isProMode()
  const onboardingDone = isPro
    ? (getSetting('proOnboardingComplete') || getSetting('onboardingComplete'))
    : getSetting('onboardingComplete')

  const isFullyReady = isPro
    ? !!onboardingDone && !!getSetting('auth_tokens')
    : !!onboardingDone && hasApiKeys()
  const shouldEnableOverlay = isFullyReady

  if (shouldEnableOverlay) {
    dashboard.on('ready-to-show', () => {
      setTimeout(() => {
        overlay.show()
      }, OVERLAY_SHOW_DELAY_MS)
    })

    const stealthEnabled = getSetting('stealthEnabled')
    if (stealthEnabled) {
      setStealthMode(true)
    }

    registerGlobalHotkeys(dashboard, overlay)
  }

  ipcMain.on('onboarding:completed', () => {
    log.info('Onboarding completed — showing overlay')
    setStealthMode(true)
    overlay.show()
    registerGlobalHotkeys(dashboard, overlay)
    setTrayOnboarding(false)
  })

  registerStealthTrayCallbacks(
    () => setTrayVisibility(false),
    () => createTray()
  )

  if (!shouldEnableOverlay) {
    setTrayOnboarding(true)
  }
  createTray()
  initAutoUpdater()
  initAnalytics()
}

app.whenReady().then(() => {
  // Set app mode from environment variable (defaults to 'free' for open-source)
  const appMode = process.env.RAVEN_MODE === 'pro' ? 'pro' : 'free'
  saveSetting('mode', appMode)
  log.info(`App mode: ${appMode}`)

  // Initialize database
  databaseService.initialize()
  seedBuiltinModes()

  registerIpcHandlers()
  registerSystemAudioHandlers()
  registerPermissionHandlers()
  void initializeProFeatures()
  void initDeepLinksReady()
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
      if (isProMode()) {
        import(/* @vite-ignore */ '../pro/main/syncService')
          .then(({ deleteSessionFromBackend }) => deleteSessionFromBackend(id))
          .catch(() => {})
      }
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

    const regenDisplayName = getSetting('displayName') || 'You'
    const transcriptText = session.transcript
      .filter((e) => e.isFinal)
      .map((e) => `${e.source === 'mic' ? regenDisplayName : 'Them'}: ${e.text}`)
      .join('\n')

    try {
      const result = await generateSessionSummary(transcriptText, session.modeId)
      databaseService.updateSession(sessionId, {
        title: result.title || session.title,
        summary: result.summary,
      })

      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('sessions:list-updated')
      })
      return true
    } catch (err) {
      ipcLog.error('Regenerate summary failed:', err)
      return false
    }
  })

  // ==================== MODE IPC HANDLERS ====================

  ipcMain.handle('modes:get-all', async () => {
    try {
      return databaseService.getAllModes()
    } catch (error) {
      ipcLog.error('modes:get-all error:', error)
      return []
    }
  })

  ipcMain.handle('modes:get', async (_event, id: string) => {
    try {
      return databaseService.getMode(id)
    } catch (error) {
      ipcLog.error('modes:get error:', error)
      return null
    }
  })

  ipcMain.handle('modes:create', async (_event, mode: Omit<Mode, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      return databaseService.createMode(mode)
    } catch (error) {
      ipcLog.error('modes:create error:', error)
      throw error
    }
  })

  ipcMain.handle('modes:update', async (_event, id: string, updates: Partial<Mode>) => {
    try {
      return databaseService.updateMode(id, updates)
    } catch (error) {
      ipcLog.error('modes:update error:', error)
      return null
    }
  })

  ipcMain.handle('modes:delete', async (_event, id: string) => {
    try {
      return databaseService.deleteMode(id)
    } catch (error) {
      ipcLog.error('modes:delete error:', error)
      return { success: false, error: 'Failed to delete mode' }
    }
  })

  ipcMain.handle('modes:duplicate', async (_event, id: string, newName: string) => {
    try {
      return databaseService.duplicateMode(id, newName)
    } catch (error) {
      ipcLog.error('modes:duplicate error:', error)
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
      ipcLog.error('modes:reset-builtin error:', error)
      return null
    }
  })

  ipcMain.handle('modes:get-active', async () => {
    try {
      return databaseService.getActiveMode()
    } catch (error) {
      ipcLog.error('modes:get-active error:', error)
      return null
    }
  })

  ipcMain.handle('modes:set-active', async (_event, id: string) => {
    try {
      return databaseService.setActiveMode(id)
    } catch (error) {
      ipcLog.error('modes:set-active error:', error)
      return false
    }
  })

  // ---- Context / RAG ----

  ipcMain.handle('context:upload-file', async (event, modeId: string, filePath: string, fileName: string, fileSize: number) => {
    try {
      const pathMod = await import('path')
      const fsMod = await import('fs')

      // Validate file exists and has an allowed extension
      const resolved = pathMod.resolve(filePath)
      const allowedExtensions = ['.pdf', '.txt', '.md', '.docx']
      const ext = pathMod.extname(resolved).toLowerCase()
      if (!allowedExtensions.includes(ext)) {
        return { success: false, error: `Unsupported file type: ${ext}` }
      }
      if (!fsMod.existsSync(resolved)) {
        return { success: false, error: 'File not found' }
      }

      const { uploadContextFile } = await import('./services/ragService')
      const sender = event.sender
      const result = await uploadContextFile(modeId, resolved, fileName, fileSize, (stage, current, total) => {
        sender.send('context:upload-progress', { stage, current, total })
      })
      return { success: true, file: result }
    } catch (error: unknown) {
      ipcLog.error('context:upload-file error:', error)
      const msg = error instanceof Error ? error.message : 'Upload failed'
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('context:get-files', async (_event, modeId: string) => {
    try {
      const { getContextFiles } = await import('./services/ragService')
      return getContextFiles(modeId)
    } catch (error) {
      ipcLog.error('context:get-files error:', error)
      return []
    }
  })

  ipcMain.handle('context:delete-file', async (_event, fileId: string) => {
    try {
      const { deleteContextFile } = await import('./services/ragService')
      return deleteContextFile(fileId)
    } catch (error) {
      ipcLog.error('context:delete-file error:', error)
      return false
    }
  })

  ipcMain.handle('profile:select-picture', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const sourcePath = result.filePaths[0]
    const pathMod = await import('path')
    const fsMod = await import('fs')

    const appDataPath = app.getPath('userData')
    const profileDir = pathMod.join(appDataPath, 'profile')
    if (!fsMod.existsSync(profileDir)) {
      fsMod.mkdirSync(profileDir, { recursive: true })
    }

    const ext = pathMod.extname(sourcePath)
    const destPath = pathMod.join(profileDir, `avatar${ext}`)
    fsMod.copyFileSync(sourcePath, destPath)

    const { saveSetting } = await import('./store')
    saveSetting('profilePicturePath', destPath)

    return destPath
  })

  ipcMain.handle('profile:select-picture-raw', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const fsMod = await import('fs')
    const pathMod = await import('path')
    const data = fsMod.readFileSync(result.filePaths[0])
    const ext = pathMod.extname(result.filePaths[0]).toLowerCase().replace('.', '')
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mime};base64,${data.toString('base64')}`
  })

  ipcMain.handle('profile:save-picture-data', async (_event, dataUrl: string) => {
    const fsMod = await import('fs')
    const pathMod = await import('path')
    const appDataPath = app.getPath('userData')
    const profileDir = pathMod.join(appDataPath, 'profile')
    if (!fsMod.existsSync(profileDir)) {
      fsMod.mkdirSync(profileDir, { recursive: true })
    }
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!matches) return null
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1]
    const buffer = Buffer.from(matches[2], 'base64')
    const destPath = pathMod.join(profileDir, `avatar.${ext}`)
    fsMod.writeFileSync(destPath, buffer)

    const { saveSetting } = await import('./store')
    saveSetting('profilePicturePath', destPath)
    return destPath
  })

  ipcMain.handle('profile:get-picture-data', async (_event, filePath: string) => {
    if (!filePath) return null
    const fsMod = await import('fs')
    const pathMod = await import('path')

    // Path traversal protection: only allow files inside userData
    const resolved = pathMod.resolve(filePath)
    const userDataPath = app.getPath('userData')
    if (!resolved.startsWith(userDataPath)) return null

    if (!fsMod.existsSync(resolved)) return null
    const data = fsMod.readFileSync(resolved)
    const ext = pathMod.extname(resolved).toLowerCase().replace('.', '')
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mime};base64,${data.toString('base64')}`
  })

  ipcMain.handle('profile:remove-picture', async () => {
    const { getSetting: getSettingLocal, saveSetting: saveSettingLocal } = await import('./store')
    const currentPath = getSettingLocal('profilePicturePath')
    if (currentPath) {
      const fsMod = await import('fs')
      if (fsMod.existsSync(currentPath)) {
        fsMod.unlinkSync(currentPath)
      }
    }
    saveSettingLocal('profilePicturePath', '')
    return true
  })

  ipcMain.handle('context:select-file', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'txt', 'md', 'docx'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const pathMod = await import('path')
    const fsMod = await import('fs')
    const stats = fsMod.statSync(filePath)
    return {
      filePath,
      fileName: pathMod.basename(filePath),
      fileSize: stats.size
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
        sample_rate: String(AUDIO_SAMPLE_RATE),
        channels: String(AUDIO_CHANNELS),
        encoding: 'linear16',
      })

      const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`

      testTranscriptionWs = new WebSocketModule(url, {
        headers: { Authorization: `Token ${apiKey}` },
      })

      testTranscriptionWs.onopen = () => {
        ipcLog.info('Test transcription connected', deviceId ? `device: ${deviceId}` : '(default)')
        const keepAlive = setInterval(() => {
          if (testTranscriptionWs?.readyState === 1) {
            testTranscriptionWs.send(JSON.stringify({ type: 'KeepAlive' }))
          }
        }, DEEPGRAM_KEEPALIVE_MS)

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
          ipcLog.error('Test transcription parse error:', err)
        }
      }

      testTranscriptionWs.onerror = (err: { message?: string }) => {
        ipcLog.error('Test transcription error:', err.message || err)
      }

      testTranscriptionWs.onclose = () => {
        ipcLog.debug('Test transcription closed')
        if (testTranscriptionCleanup) {
          testTranscriptionCleanup()
          testTranscriptionCleanup = null
        }
        testTranscriptionWs = null
      }

      return { success: true }
    } catch (error) {
      ipcLog.error('Test transcription failed to start:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('transcription:stop-test', async () => {
    if (testTranscriptionWs) {
      try {
        testTranscriptionWs.send(JSON.stringify({ type: 'CloseStream' }))
        testTranscriptionWs.close()
      } catch (err) {
        ipcLog.error('Test transcription close error:', err)
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
        ipcLog.error('Test transcription send error:', err)
      }
    }
    return { success: true }
  })

  app.on('activate', () => {
    const dashboard = getDashboardWindow()
    if (dashboard && !dashboard.isDestroyed()) {
      dashboard.show()
      dashboard.focus()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      boot()
    }
  })
})

app.on('before-quit', () => {
  destroyTray()
  stopAutoUpdater()

  // Stop active recording: kills audiocapture child process, closes Deepgram WebSockets, saves session
  audioManager.shutdown().catch((err) => {
    log.error('Shutdown error:', err)
  })

  // Force-close the dashboard window (bypass the hide-on-close behavior)
  const dashboard = getDashboardWindow()
  if (dashboard && !dashboard.isDestroyed()) {
    dashboard.removeAllListeners('close')
    dashboard.close()
  }

  if (testTranscriptionWs) {
    try {
      testTranscriptionWs.close()
    } catch (err) {
      ipcLog.error('Test transcription close on quit error:', err)
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
