import { autoUpdater } from 'electron-updater'
import { ipcMain, app, BrowserWindow } from 'electron'
import { createRequire } from 'module'
import { createLogger } from './logger'

const log = createLogger('AutoUpdate')

// Main process is built as ES modules, so the `require` global isn't
// defined. Build a CJS-compatible require via createRequire so the lazy
// sessionManager import below (kept lazy to avoid an import-time cycle
// between autoUpdater and sessionManager) actually works.
const nodeRequire = createRequire(import.meta.url)

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
  version?: string
  error?: string
  progress?: number
  /**
   * How the renderer should install. Always 'auto' now — electron-updater on
   * every packaged platform (macOS included, post-notarization). The legacy
   * 'mac-dmg' + dmgUrl/forcePrompt fields are retained so older renderer code
   * paths and tests keep type-checking; nothing sets them anymore.
   */
  install?: 'auto' | 'mac-dmg'
  dmgUrl?: string
  forcePrompt?: boolean
}

/**
 * How long the transient `up-to-date` status stays before decaying to `idle`.
 * Renderers show an "You're on the latest version" acknowledgement while
 * this status is active so a manual "Check for updates" click doesn't
 * appear silent.
 */
const UP_TO_DATE_DECAY_MS = 3500

let state: UpdateState = { status: 'idle' }
let checkInterval: NodeJS.Timeout | null = null
let upToDateTimer: NodeJS.Timeout | null = null
let started = false

/**
 * electron-updater drives in-app updates on every packaged platform. macOS
 * uses Squirrel.Mac / ShipIt, which requires a Developer ID signature +
 * notarization — both now produced by the release workflow (`-c.mac.notarize`,
 * dmg+zip+latest-mac.yml) — so the Mac app self-updates exactly like Windows:
 * "Update now" downloads, "Restart & update" installs. Only unpackaged (dev)
 * builds skip it. `platform` is kept in the signature for tests / future
 * per-OS gating.
 */
export function shouldRunElectronUpdater(opts: {
  packaged: boolean
  platform: NodeJS.Platform
}): boolean {
  return opts.packaged
}

/** Test-only: allow initAutoUpdater() to run again in the same process. */
export function _resetForTesting(): void {
  started = false
  state = { status: 'idle' }
  stopAutoUpdater()
}

function broadcastState(): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('update:state-changed', state)
    }
  })
}

function clearUpToDateTimer(): void {
  if (upToDateTimer) {
    clearTimeout(upToDateTimer)
    upToDateTimer = null
  }
}

function setTransientUpToDate(): void {
  clearUpToDateTimer()
  state = { status: 'up-to-date' }
  broadcastState()
  upToDateTimer = setTimeout(() => {
    upToDateTimer = null
    if (state.status === 'up-to-date') {
      state = { status: 'idle' }
      broadcastState()
    }
  }, UP_TO_DATE_DECAY_MS)
}

export function initAutoUpdater(): void {
  // boot() also runs from macOS `activate` when all windows are gone.
  // ipcMain.handle('update:check') throws on the second call.
  if (started) return
  started = true

  // Route updater logs through the app logger instead of discarding them.
  // ShipIt (Squirrel.Mac) writes its own failure log, but silencing this hid
  // the JS-side updater errors that would have surfaced install problems.
  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  // electron-updater's AppUpdater.isUpdaterActive() returns false when
  // !app.isPackaged, causing checkForUpdates() to resolve with null
  // without firing any events. If the renderer's optimistic 'checking'
  // state is not reset, the Settings > General "Check for updates"
  // button stays stuck showing "Checking..." for the rest of the dev
  // session. Short-circuit all update paths in unpackaged builds and
  // keep the broadcast state pinned to idle. Packaged builds (macOS
  // included, now that we notarize) run the real ShipIt/NSIS updater.
  const shipIt = shouldRunElectronUpdater({
    packaged: app.isPackaged,
    platform: process.platform,
  })

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
    state = { status: 'checking' }
    broadcastState()
  })

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version)
    state = { status: 'available', version: info.version, install: 'auto' }
    broadcastState()
  })

  autoUpdater.on('update-not-available', () => {
    log.debug('No update available')
    setTransientUpToDate()
  })

  autoUpdater.on('download-progress', (info) => {
    state = { ...state, status: 'downloading', progress: Math.round(info.percent) }
    broadcastState()
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version)
    state = { status: 'downloaded', version: info.version }
    broadcastState()
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-update error:', err.message)
    state = { status: 'error', error: err.message }
    broadcastState()
  })

  ipcMain.handle('update:check', async () => {
    if (!shipIt) {
      // Clear any lingering up-to-date decay before pinning to idle so
      // the timer can't later overwrite this idle state.
      clearUpToDateTimer()
      state = { status: 'idle' }
      broadcastState()
      return {
        success: true,
        skipped: 'dev',
      }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('update:download', async () => {
    if (!shipIt) {
      return {
        success: false,
        error: 'Updates disabled in development',
      }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('update:install', () => {
    if (state.status === 'downloaded') {
      // End any active recording session before quitting.
      // Lazy nodeRequire avoids an import-time cycle with sessionManager
      // (see the createRequire block at the top of this file).
      try {
        const { sessionManager } = nodeRequire('./services/sessionManager')
        if (sessionManager.getActiveSession()) {
          log.info('Ending active session before update install')
          sessionManager.endSession()
        }
      } catch (err) {
        log.warn('Failed to end session before update:', err)
      }

      // Force-close all windows so macOS hide-on-close doesn't block the quit
      BrowserWindow.getAllWindows().forEach((win) => {
        win.removeAllListeners('close')
        win.close()
      })
      autoUpdater.quitAndInstall(false, true)
    }
    return { success: state.status === 'downloaded' }
  })

  ipcMain.handle('update:get-state', () => state)

  if (!shipIt) {
    log.debug('Updates disabled (unpackaged build) - skipping scheduled checks')
    return
  }

  // Initial check after 10 seconds (give app time to boot)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      log.debug('Initial update check failed (non-fatal):', err.message)
    })
  }, 10_000)

  // Periodic checks
  checkInterval = setInterval(() => {
    autoUpdater.checkForUpdates().catch(err => {
      log.debug('Periodic update check failed (non-fatal):', err.message)
    })
  }, CHECK_INTERVAL_MS)
}

export function stopAutoUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval)
    checkInterval = null
  }
  clearUpToDateTimer()
}
