import { autoUpdater } from 'electron-updater'
import { ipcMain, app, BrowserWindow, shell } from 'electron'
import { createRequire } from 'module'
import { createLogger } from './logger'
import {
  evaluateMacManualUpdate,
  fetchMacFeedVersion,
} from './macManualUpdate'

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
  /** Windows: electron-updater. Mac OSS: GitHub DMG (ShipIt cannot apply). */
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
let macFeedCheckInFlight = false

/**
 * electron-updater on macOS uses Squirrel.Mac / ShipIt, which rejects
 * ad-hoc (OSS) signatures: "code failed to satisfy specified code
 * requirement(s)". In-app updates are Windows-only until we notarize.
 */
export function shouldRunElectronUpdater(opts: {
  packaged: boolean
  platform: NodeJS.Platform
}): boolean {
  return opts.packaged && opts.platform !== 'darwin'
}

/** Test-only: allow initAutoUpdater() to run again in the same process. */
export function _resetForTesting(): void {
  started = false
  macFeedCheckInFlight = false
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

async function checkMacManualUpdate(opts: { forcePrompt: boolean }): Promise<{
  success: boolean
  error?: string
}> {
  if (macFeedCheckInFlight) return { success: true }
  macFeedCheckInFlight = true
  if (opts.forcePrompt) {
    clearUpToDateTimer()
    state = { status: 'checking' }
    broadcastState()
  }
  try {
    const remoteVersion = await fetchMacFeedVersion()
    const result = evaluateMacManualUpdate({
      currentVersion: app.getVersion(),
      remoteVersion,
    })
    if (!result.available) {
      if (opts.forcePrompt) setTransientUpToDate()
      return { success: true }
    }
    state = {
      status: 'available',
      version: result.version,
      install: 'mac-dmg',
      dmgUrl: result.dmgUrl,
      forcePrompt: opts.forcePrompt,
    }
    broadcastState()
    return { success: true }
  } catch (err) {
    log.debug('Mac release feed check failed (non-fatal):', err)
    if (!opts.forcePrompt) return { success: true }
    const message = 'Could not reach GitHub. Check your connection and try again.'
    state = { status: 'error', error: message, install: 'mac-dmg' }
    broadcastState()
    return { success: false, error: message }
  } finally {
    macFeedCheckInFlight = false
  }
}

export function initAutoUpdater(): void {
  // boot() also runs from macOS `activate` when all windows are gone.
  // ipcMain.handle('update:check') throws on the second call.
  if (started) return
  started = true

  autoUpdater.logger = null
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  // electron-updater's AppUpdater.isUpdaterActive() returns false when
  // !app.isPackaged, causing checkForUpdates() to resolve with null
  // without firing any events. If the renderer's optimistic 'checking'
  // state is not reset, the Settings > General "Check for updates"
  // button stays stuck showing "Checking..." for the rest of the dev
  // session. Short-circuit all update paths in unpackaged builds and
  // keep the broadcast state pinned to idle.
  //
  // Packaged Mac is also skipped: unsigned/ad-hoc builds cannot pass
  // ShipIt code-requirement checks.
  const shipIt = shouldRunElectronUpdater({
    packaged: app.isPackaged,
    platform: process.platform,
  })
  const macManual = app.isPackaged && process.platform === 'darwin'

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
    if (macManual) {
      return checkMacManualUpdate({ forcePrompt: true })
    }
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
    if (macManual) {
      const url = state.dmgUrl
      if (!url || state.install !== 'mac-dmg') {
        return {
          success: false,
          error: 'No Mac installer is ready. Check for updates first.',
        }
      }
      try {
        await shell.openExternal(url)
        return { success: true }
      } catch (err) {
        return { success: false, error: String(err) }
      }
    }
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

  if (macManual) {
    log.debug('Mac updates: GitHub DMG prompt (ShipIt disabled)')
    setTimeout(() => {
      checkMacManualUpdate({ forcePrompt: false }).catch((err) => {
        log.debug('Initial Mac feed check failed (non-fatal):', err)
      })
    }, 10_000)
    checkInterval = setInterval(() => {
      checkMacManualUpdate({ forcePrompt: false }).catch((err) => {
        log.debug('Periodic Mac feed check failed (non-fatal):', err)
      })
    }, CHECK_INTERVAL_MS)
    return
  }

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
