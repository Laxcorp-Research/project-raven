import { app, BrowserWindow, globalShortcut, ipcMain, desktopCapturer, Menu } from 'electron'
import { join, dirname } from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

// CRITICAL: single-instance lock is the FIRST runtime action this main
// process takes. If a second instance launches (e.g. Windows Shell
// invoked Raven again to handle a `raven://` OAuth deep-link callback
// while the app was already running) we quit IMMEDIATELY - before any
// later import has a chance to open the database, register IPC
// handlers, or create a window. Without this top-of-file guard, the
// previous setupDeepLinkHandlers() lock check fired far too late
// (after app.whenReady, after boot() had already created the dashboard
// window) and the user ended up with two visible Raven windows on
// screen: the original instance + the OAuth-callback instance whose
// dashboard was already onscreen by the time it realised it should
// have quit. Reproduced live on 2026-05-08 by the user finishing
// Google OAuth and seeing both an "all sessions" dashboard AND a
// fresh permissions-step onboarding window in parallel.
//
// Once we hold the lock, the OS routes every subsequent raven://...
// invocation to us via the `second-instance` event registered later
// in setupDeepLinkHandlers(). The deep-link URL arrives in the
// argv array there and is forwarded to handleDeepLink() which
// focuses the existing dashboard window and processes the auth code.
if (!app.requestSingleInstanceLock()) {
  // Lost the lock => we are the second instance. The first instance
  // will receive our argv via 'second-instance'. Hard-exit so no
  // further imports run; app.quit() alone is async and would let the
  // module-load chain continue creating windows before the quit
  // settles.
  app.quit()
  process.exit(0)
}

if (process.platform === 'win32') {
  const gstRoot = process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64
    || (existsSync('C:\\Program Files\\gstreamer\\1.0\\msvc_x86_64') ? 'C:\\Program Files\\gstreamer\\1.0\\msvc_x86_64' : '')
  if (gstRoot) {
    const gstBin = join(gstRoot, 'bin')
    if (!process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64) {
      process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64 = gstRoot
    }
    if (!(process.env.PATH || '').includes(gstBin)) {
      process.env.PATH = gstBin + ';' + (process.env.PATH || '')
    }
  }
}
import type WebSocket from 'ws'
import { registerIpcHandlers } from './ipc'
import {
  createDashboardWindow,
  createOverlayWindow,
  getDashboardWindow,
  setStealthMode,
  setOverlayEnabled,
  showOverlayWindow,
  registerStealthTrayCallbacks,
  reloadAllWindows,
  shouldReloadAfterChildProcessGone,
  ipv4RendererURL,
} from './windowManager'
import { getSetting, getStore, saveSetting, hasApiKeys } from './store'
import { OVERLAY_SHOW_DELAY_MS, AUDIO_SAMPLE_RATE, AUDIO_CHANNELS, DEEPGRAM_KEEPALIVE_MS } from './constants'
import { AudioManager } from './audioManager'
import { ClaudeService } from './claudeService'
import { registerSystemAudioHandlers } from './systemAudioNative'
import { databaseService, type Session, type Mode } from './services/database'
import { sessionManager } from './services/sessionManager'
import { ensureActiveMode, createDefaultMode, migrateGeneralAssistantPromptV21 } from './services/builtinModes'
import { initializeVendorFeatures, shutdownVendorFeatures } from './services/vendorFeatures'
import { createTray, destroyTray, setTrayOnboarding, setTrayVisibility } from './trayManager'
import { initAutoUpdater, stopAutoUpdater } from './autoUpdater'
import { initAnalytics, shutdownAnalytics } from './analytics'
import { initClientEvents, shutdownClientEvents } from './services/clientEvents'
import { inflightHandle, cooldownHandle } from './ipcThrottle'
import { initSentry, captureException } from './sentry'
import { registerPermissionHandlers, getPermissionStatus, permissionsAllowOverlay } from './permissions'
import { createLogger } from './logger'
import { trustSystemCAs } from './trustSystemCAs'

const log = createLogger('Raven')
const ipcLog = createLogger('IPC')

// Node `ws` / undici (mic test + live STT) must use the OS CA store.
// Without this, Windows can fail AssemblyAI/Deepgram with
// "unable to verify the first certificate" while Chromium works.
trustSystemCAs()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeHandle(channel: string, handler: (...args: any[]) => any): void {
  ipcMain.handle(channel, (_event, ...args) => {
    try {
      const result = handler(...args)
      if (result instanceof Promise) {
        return result.catch((err: unknown) => {
          ipcLog.error(`[${channel}] handler error:`, err)
          return { __ipcError: true, error: err instanceof Error ? err.message : 'Unknown error' }
        })
      }
      return result
    } catch (err) {
      ipcLog.error(`[${channel}] handler error:`, err)
      return { __ipcError: true, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  })
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const preloadPath = join(__dirname, '../preload/index.cjs')

const audioManager = new AudioManager()
const store = getStore()
let testTranscriptionWs: WebSocket | null = null
let testTranscriptionCleanup: (() => void) | null = null
let testTranscriptionProvider: 'deepgram' | 'assemblyai' | null = null
let testAssemblyAITranscriber: { sendAudio: (buf: Buffer) => void; close: () => Promise<void> } | null = null

// Enable screen capture on macOS
app.commandLine.appendSwitch('enable-features', 'ScreenCaptureKitMac')

// Sentry must init before app 'ready' event
initSentry()

// Forward renderer-side errors (React error boundary, uncaught
// promise rejections, etc.) to the main-process Sentry SDK.
// Without this, a component that throws during render would show
// the ErrorBoundary fallback but the error itself would never reach
// Sentry - we'd only know through user reports. Main-process
// captureException already no-ops if Sentry isn't initialized
// (e.g., in dev), so this is safe to always register.
ipcMain.on('sentry:capture-renderer-error', (_event, payload: {
  message: string
  stack?: string
  componentStack?: string
}) => {
  try {
    const err = new Error(payload.message || 'Renderer error')
    if (payload.stack) err.stack = payload.stack
    if (payload.componentStack) {
      // Attach React component stack as a non-standard property -
      // Sentry's beforeSend won't strip it and it's invaluable for
      // tracing which component threw.
      (err as Error & { componentStack?: string }).componentStack = payload.componentStack
    }
    captureException(err)
  } catch { /* best effort - we don't want error reporting to throw */ }
})

cooldownHandle('desktop:get-sources', 1000, async () => {
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
        // showOverlayWindow re-arms mouse-move forwarding on Windows
        // (showInactive), so the panel stays grabbable after a hide.
        showOverlayWindow()
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
        showOverlayWindow()
      }
    }
  })

  // Toggle Recording: Cmd/Ctrl + Shift + Space.
  // NOTE: this is a SYSTEM-WIDE shortcut. It was previously Cmd/Ctrl+R,
  // which hijacked the browser's refresh in every app while Raven ran.
  // Shift+Space is effectively never bound globally by other apps.
  // Only the overlay subscribes to 'hotkey:toggle-recording'
  // (OverlayWindow / OverlayToolbar). The dashboard uses its own
  // dashboard-scoped keyboard shortcut which it relays to main via
  // `sendHotkeyToggleRecording` → 'hotkey:toggle-recording-from-dashboard'
  // handled in ipc.ts. The previous extra `dashboardWindow.send(...)` here
  // was misleading - it had no subscriber and implied the dashboard
  // received global-hotkey toggles when it didn't.
  const recordingRegistered = globalShortcut.register(`${modifier}+Shift+Space`, () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('hotkey:toggle-recording')
    }
  })

  // Clear Conversation: Cmd/Ctrl + Shift + Backspace.
  // Was Cmd/Ctrl+Shift+R, which clobbered the browser's hard-refresh
  // system-wide (same global-shortcut hijack class as the recording key).
  const clearRegistered = globalShortcut.register(`${modifier}+Shift+Backspace`, () => {
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

  // Window move (Cmd+Arrow) registered above - requires Accessibility permission on macOS.

  // If the PRIMARY hotkeys failed to register, the likely cause is:
  //   - macOS Accessibility permission not granted (common on first run)
  //   - Another app already owns the accelerator (e.g. Cmd+R in a
  //     running browser foregrounded over Raven)
  // Either way, silent failure is the worst outcome - the user hits
  // Cmd+R, nothing happens, they assume the app is broken. Surface a
  // one-time notification that tells them what to check.
  const failedPrimary =
    !recordingRegistered || !visibilityRegistered || !aiRegistered
  if (failedPrimary) {
    const failed: string[] = []
    if (!recordingRegistered) failed.push(`${modifier}+Shift+Space (toggle recording)`)
    if (!visibilityRegistered) failed.push(`${modifier}+\\ (toggle visibility)`)
    if (!aiRegistered) failed.push(`${modifier}+Return (ask Raven)`)
    const payload = {
      id: `hotkey-fail-${Date.now()}`,
      title: 'Some shortcuts are disabled',
      body: process.platform === 'darwin'
        ? `Couldn't register ${failed.join(', ')}. Grant Raven Accessibility permission in System Settings → Privacy & Security → Accessibility, or quit the other app that owns these shortcuts.`
        : `Couldn't register ${failed.join(', ')}. Another app may already own the shortcut.`,
      type: 'warning' as const,
      autoDismissMs: 12_000,
    }
    try {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('overlay:notification', payload)
      }
      if (dashboardWindow && !dashboardWindow.isDestroyed()) {
        dashboardWindow.webContents.send('overlay:notification', payload)
      }
    } catch (err) {
      log.warn('Failed to broadcast hotkey-failure notification:', err)
    }
  }
}

let backgroundServicesStarted = false

function boot(): void {
  const rendererURL = ipv4RendererURL(process.env.VITE_DEV_SERVER_URL || null)

  log.debug('Preload path:', preloadPath)
  log.debug('Renderer URL:', rendererURL)

  // Create both windows
  const dashboard = createDashboardWindow(preloadPath, rendererURL)
  const overlay = createOverlayWindow(preloadPath, rendererURL)
  const claudeService = new ClaudeService(overlay)
  claudeService.setWindows(dashboard, overlay)

  sessionManager.setWindows(dashboard, overlay)
  sessionManager.recoverSession()
  if (hasApiKeys()) {
    void sessionManager.retryMissingNotes()
  }

  audioManager.setWindows(dashboard, overlay)

  const onboardingDone = getSetting('onboardingComplete')
  const isFullyReady = !!onboardingDone && hasApiKeys()
  const shouldEnableOverlay = isFullyReady
  // Fullscreen overlay + leftover stealth covers the dashboard. On macOS
  // wait until mic/screen/accessibility are granted (PermissionsGate).
  const shouldShowOverlayNow =
    shouldEnableOverlay &&
    permissionsAllowOverlay(getPermissionStatus()) &&
    // Unpackaged: never auto-raise the fullscreen overlay. A transparent
    // or failed overlay covers the dashboard and looks like a blank screen.
    app.isPackaged

  if (shouldEnableOverlay) {
    setOverlayEnabled(true)
    if (shouldShowOverlayNow) {
      dashboard.on('ready-to-show', () => {
        setTimeout(() => {
          // Windows: show via showOverlayWindow (showInactive) so the
          // now-focusable overlay doesn't steal focus on launch and arms
          // mouse-move forwarding. macOS keeps its existing show().
          if (process.platform === 'win32') showOverlayWindow()
          else overlay.show()
        }, OVERLAY_SHOW_DELAY_MS)
      })

      const stealthEnabled = getSetting('stealthEnabled')
      if (stealthEnabled) {
        setStealthMode(true)
      }
    }

    registerGlobalHotkeys(dashboard, overlay)
  }

  if (!shouldShowOverlayNow) {
    overlay.hide()
  }

  ipcMain.on('onboarding:completed', async () => {
    log.info('Onboarding completed - showing overlay')
    await createDefaultMode()
    const stealthPref = getSetting('stealthEnabled')
    if (stealthPref) {
      setStealthMode(true)
    }
    setOverlayEnabled(true)
    // Windows: showInactive (focusable overlay must not steal focus on show).
    if (process.platform === 'win32') showOverlayWindow()
    else overlay.show()
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

  // Tray / updater / analytics register process-wide IPC. A second boot()
  // (macOS activate after every window is gone) used to throw
  // "Attempted to register a second handler for 'update:check'".
  if (backgroundServicesStarted) return
  backgroundServicesStarted = true

  createTray()
  initAutoUpdater()
  initAnalytics()
  initClientEvents()
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null)
  }

  saveSetting('mode', 'free')
  log.info('App mode: free')

  let lastNetworkReloadAt = 0
  app.on('child-process-gone', (_event, details) => {
    log.error('child-process-gone', details)
    if (!shouldReloadAfterChildProcessGone(details)) return
    const now = Date.now()
    if (now - lastNetworkReloadAt < 3000) return
    lastNetworkReloadAt = now
    log.warn('Network service died — reloading windows')
    reloadAllWindows()
  })

  // Initialize database
  databaseService.initialize()
  ensureActiveMode()
  // One-time content migration: upgrade pre-v2.1 General Assistant mode
  // to the new prompt + notesTemplate if the user hasn't edited it.
  // See src/main/services/builtinModes.ts for match logic.
  migrateGeneralAssistantPromptV21()

  registerIpcHandlers()
  registerSystemAudioHandlers()
  registerPermissionHandlers()
  void initializeVendorFeatures()
  boot()

  // Session IPC handlers
  safeHandle('sessions:create', (session: Omit<Session, 'createdAt'>) => {
    return databaseService.createSession(session)
  })

  safeHandle('sessions:update', (id: string, updates: Partial<Session>) => {
    databaseService.updateSession(id, updates)
    sessionManager.syncSessionToCloud(id)
    return true
  })

  safeHandle('sessions:get', (id: string) => {
    return databaseService.getSession(id)
  })

  safeHandle('sessions:getAll', () => {
    return databaseService.getAllSessionSummaries()
  })

  safeHandle('sessions:getAllFull', () => {
    return databaseService.getAllSessions()
  })

  safeHandle('sessions:search', (query: string) => {
    return databaseService.searchSessions(query)
  })

  safeHandle('sessions:get-messages', (sessionId: string) => {
    return databaseService.getSessionMessages(sessionId)
  })

  safeHandle('sessions:add-message', (sessionId: string, role: 'user' | 'assistant', content: string) => {
    return databaseService.addSessionMessage(sessionId, role, content)
  })

  safeHandle('sessions:delete', (id: string) => {
    const deleted = databaseService.deleteSession(id)
    if (deleted) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('sessions:list-updated')
      })
      // Still fire-and-forget at the IPC return boundary so the UI
      // isn't held on network latency, but the in-flight DELETE is
      // now tracked via the session_tombstones table. A failure
      // leaves the tombstone unconfirmed and the periodic sync cycle
      // retries until the server actually loses the row. See the
      // modes counterpart for the long-form rationale.
    }
    return deleted
  })

  safeHandle('sessions:update-title', (id: string, title: string) => {
    databaseService.updateSession(id, { title })
    sessionManager.syncSessionToCloud(id)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('sessions:list-updated')
    })
    return true
  })

  safeHandle('sessions:getInProgress', () => {
    return databaseService.getInProgressSession()
  })

  safeHandle('session:getActive', () => {
    return sessionManager.getActiveSession()
  })

  safeHandle('session:hasActive', () => {
    return sessionManager.hasActiveSession()
  })

  inflightHandle('session:regenerateTitle', async (sessionId: string) => {
    return sessionManager.generateTitle(sessionId)
  })

  safeHandle('sessions:regenerate-summary', async (sessionId: string) => {
    return sessionManager.generateAndStoreNotes(sessionId)
  })

  // ==================== MODE IPC HANDLERS ====================

  function syncModeToCloud(): void {
    // Local-only. Hosted sync was removed with Pro.
  }

  // Fire the backend DELETE and, if it succeeds, confirm the tombstone
  // that deleteMode() wrote. Still fire-and-forget at the IPC boundary
  // so the UI isn't held on network latency, but now the in-flight
  // fetch is tracked: failures leave the tombstone unconfirmed and the
  // periodic sync cycle (retryUnconfirmedModeDeletes) will retry until
  // the server actually loses the row. Before this fix, any failure
  // (dev HMR interruption, 5xx, offline at delete time) silently left
  // the server with an orphan row that pull would resurrect on next
  // boot.
  function deleteModeFromCloud(_modeId: string): void {
    // Local-only. Hosted sync was removed with Pro.
  }

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
      const result = databaseService.createMode(mode)
      syncModeToCloud()
      return result
    } catch (error) {
      ipcLog.error('modes:create error:', error)
      throw error
    }
  })

  ipcMain.handle('modes:update', async (_event, id: string, updates: Partial<Mode>) => {
    try {
      const result = databaseService.updateMode(id, updates)
      syncModeToCloud()
      return result
    } catch (error) {
      ipcLog.error('modes:update error:', error)
      return null
    }
  })

  ipcMain.handle('modes:delete', async (_event, id: string) => {
    try {
      const result = databaseService.deleteMode(id)
      deleteModeFromCloud(id)
      return result
    } catch (error) {
      ipcLog.error('modes:delete error:', error)
      return { success: false, error: 'Failed to delete mode' }
    }
  })

  ipcMain.handle('modes:duplicate', async (_event, id: string, newName: string) => {
    try {
      const result = databaseService.duplicateMode(id, newName)
      syncModeToCloud()
      return result
    } catch (error) {
      ipcLog.error('modes:duplicate error:', error)
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

  // Fetch a built-in mode's canonical systemPrompt from the backend.
  // Called from the renderer at mode-creation time (Templates picker).
  // Pro-only; returns null for OSS users so the renderer falls back
  // to its bundled template.systemPrompt. Returns null on any fetch
  // failure for the same reason.
  //
  // Key convention matches backend/src/seed.ts MODE_PROMPTS: bare keys
  // like 'interview', 'sales', 'meeting', 'job-search', 'learning',
  // 'general'. The client strips its `tpl-` prefix before calling.
  ipcMain.handle('prompts:fetch-mode-template', async () => null)

  // ---- Context / RAG ----

  ipcMain.handle('context:upload-file', async (event, modeId: string, filePath: string, fileName: string, fileSize: number) => {
    // Inflight guard - one upload at a time
    if ((globalThis as Record<string, unknown>).__uploadInFlight) {
      return { success: false, error: 'An upload is already in progress' }
    }
    (globalThis as Record<string, unknown>).__uploadInFlight = true
    try {
      const pathMod = await import('path')
      const fsMod = await import('fs')

      const resolved = pathMod.resolve(filePath)

      // Restrict to user's home directory to prevent arbitrary filesystem reads
      const homedir = (await import('os')).homedir()
      if (!resolved.startsWith(homedir)) {
        return { success: false, error: 'File must be within your home directory' }
      }

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
    } finally {
      (globalThis as Record<string, unknown>).__uploadInFlight = false
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

  ipcMain.handle('context:delete-file', async (_event, modeId: string, fileId: string) => {
    try {
      const { deleteContextFile } = await import('./services/ragService')
      const result = deleteContextFile(fileId)

      // deleteContextFile already wrote the tombstone transactionally.
      // Fire-and-forget the backend DELETE at the IPC boundary to keep
      // the UI snappy, but track the outcome: on success confirm the
      // tombstone so the sync retry loop stops hammering. On failure
      // leave it unconfirmed and let runSyncCycle retry. See the
      // mode/session equivalents for the full rationale.
      return result
    } catch (error) {
      ipcLog.error('context:delete-file error:', error)
      return false
    }
  })

  safeHandle('profile:select-picture', async () => {
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

  safeHandle('profile:select-picture-raw', async () => {
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

  const PICTURE_MAX_BYTES = 5 * 1024 * 1024 // 5 MB

  safeHandle('profile:save-picture-data', async (dataUrl: string) => {
    if (typeof dataUrl !== 'string' || dataUrl.length > PICTURE_MAX_BYTES * 1.37) {
      return { error: 'PAYLOAD_TOO_LARGE', message: 'Profile picture must be under 5 MB' }
    }

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

    if (buffer.byteLength > PICTURE_MAX_BYTES) {
      return { error: 'PAYLOAD_TOO_LARGE', message: 'Profile picture must be under 5 MB' }
    }

    const destPath = pathMod.join(profileDir, `avatar.${ext}`)
    fsMod.writeFileSync(destPath, buffer)

    const { saveSetting } = await import('./store')
    saveSetting('profilePicturePath', destPath)
    return destPath
  })

  safeHandle('profile:get-picture-data', async (filePath: string) => {
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

  safeHandle('profile:remove-picture', async () => {
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

  safeHandle('context:select-file', async () => {
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
    const sender = event.sender

    // Clean up any previous test session. Swallow close errors - we're
    // about to drop the reference anyway, so a failed close just means the
    // underlying socket/transcriber was already torn down.
    if (testTranscriptionWs) {
      try { testTranscriptionWs.close() } catch { /* already-closed, ignore */ }
      testTranscriptionWs = null
    }
    if (testAssemblyAITranscriber) {
      try { await testAssemblyAITranscriber.close() } catch { /* already-closed, ignore */ }
      testAssemblyAITranscriber = null
    }
    testTranscriptionProvider = null

    const assemblyKey = getSetting('assemblyaiApiKey') as string
    if (assemblyKey) {
      try {
        const { AssemblyAI, RealtimeTranscriber } = await import('assemblyai')
        const client = new AssemblyAI({ apiKey: assemblyKey })
        const token = await client.realtime.createTemporaryToken({ expires_in: 480 })
        const transcriber = new RealtimeTranscriber({
          token,
          sampleRate: AUDIO_SAMPLE_RATE,
          encoding: 'pcm_s16le',
          endUtteranceSilenceThreshold: 500,
        })

        transcriber.on('transcript', (transcript) => {
          if (!transcript.text) return
          try {
            sender.send('transcription:test-update', {
              text: transcript.text,
              isFinal: transcript.message_type === 'FinalTranscript',
            })
          } catch { /* sender may be destroyed */ }
        })

        transcriber.on('error', (err) => {
          ipcLog.error('Test AssemblyAI error:', err)
        })

        await transcriber.connect()
        testAssemblyAITranscriber = {
          sendAudio: (buf: Buffer) => transcriber.sendAudio(buf as unknown as ArrayBufferLike),
          close: () => transcriber.close(),
        }
        testTranscriptionProvider = 'assemblyai'
        ipcLog.info('Test transcription connected (AssemblyAI)', deviceId ? `device: ${deviceId}` : '(default)')
        return { success: true, provider: 'assemblyai' }
      } catch (err) {
        ipcLog.warn('Test AssemblyAI failed, trying Deepgram fallback:', err instanceof Error ? err.message : err)
      }
    }

    // Deepgram path (free mode or AssemblyAI fallback)
    const apiKey = getSetting('deepgramApiKey') as string
    if (!apiKey) {
      return { success: false, error: 'No transcription API key available' }
    }

    try {
      const { default: WebSocketModule } = await import('ws')
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

      testTranscriptionWs.onclose = () => {
        ipcLog.debug('Test transcription closed')
        if (testTranscriptionCleanup) {
          testTranscriptionCleanup()
          testTranscriptionCleanup = null
        }
        testTranscriptionWs = null
      }

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Deepgram test connect timed out'))
        }, 8000)
        testTranscriptionWs!.onopen = () => {
          clearTimeout(timer)
          ipcLog.info('Test transcription connected (Deepgram)', deviceId ? `device: ${deviceId}` : '(default)')
          const keepAlive = setInterval(() => {
            if (testTranscriptionWs?.readyState === 1) {
              testTranscriptionWs.send(JSON.stringify({ type: 'KeepAlive' }))
            }
          }, DEEPGRAM_KEEPALIVE_MS)
          testTranscriptionCleanup = () => {
            clearInterval(keepAlive)
          }
          resolve()
        }
        testTranscriptionWs!.onerror = (err: { message?: string }) => {
          clearTimeout(timer)
          ipcLog.error('Test transcription error:', err.message || err)
          reject(new Error(err.message || 'Deepgram test connection failed'))
        }
      })

      testTranscriptionProvider = 'deepgram'
      return { success: true, provider: 'deepgram' }
    } catch (error) {
      ipcLog.error('Test transcription failed to start:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('transcription:stop-test', async () => {
    if (testAssemblyAITranscriber) {
      try { await testAssemblyAITranscriber.close() } catch (err) {
        ipcLog.error('Test AssemblyAI close error:', err)
      }
      testAssemblyAITranscriber = null
    }

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
    testTranscriptionProvider = null
    return { success: true }
  })

  const AUDIO_CHUNK_MAX_BYTES = 1 * 1024 * 1024 // 1 MB

  ipcMain.handle('transcription:send-test-audio', async (_event, buffer: ArrayBuffer) => {
    if (!buffer || buffer.byteLength > AUDIO_CHUNK_MAX_BYTES) {
      return { success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Audio chunk must be under 1 MB' }
    }
    const buf = Buffer.from(buffer)

    if (testTranscriptionProvider === 'assemblyai' && testAssemblyAITranscriber) {
      try {
        testAssemblyAITranscriber.sendAudio(buf)
      } catch (err) {
        ipcLog.error('Test AssemblyAI send error:', err)
      }
    } else if (testTranscriptionWs?.readyState === 1) {
      try {
        testTranscriptionWs.send(buf)
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
  void shutdownAnalytics()
  void shutdownClientEvents()

  // Stop active recording: kills audiocapture child process, closes Deepgram WebSockets, saves session
  audioManager.shutdown().catch((err) => {
    log.error('Shutdown error:', err)
  })

  void shutdownVendorFeatures()

  // Force-close the dashboard window (bypass the hide-on-close behavior)
  const dashboard = getDashboardWindow()
  if (dashboard && !dashboard.isDestroyed()) {
    dashboard.removeAllListeners('close')
    dashboard.close()
  }

  if (testAssemblyAITranscriber) {
    testAssemblyAITranscriber.close().catch((err) => ipcLog.warn('Transcriber close error:', err))
    testAssemblyAITranscriber = null
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
