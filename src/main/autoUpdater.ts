import { autoUpdater } from 'electron-updater'
import { ipcMain, BrowserWindow } from 'electron'
import { createLogger } from './logger'

const log = createLogger('AutoUpdate')

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  error?: string
}

let state: UpdateState = { status: 'idle' }
let checkInterval: NodeJS.Timeout | null = null

function broadcastState(): void {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('update:state-changed', state)
    }
  })
}

export function initAutoUpdater(): void {
  autoUpdater.logger = null
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
    state = { status: 'checking' }
    broadcastState()
  })

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version)
    state = { status: 'available', version: info.version }
    broadcastState()
  })

  autoUpdater.on('update-not-available', () => {
    log.debug('No update available')
    state = { status: 'idle' }
    broadcastState()
  })

  autoUpdater.on('download-progress', () => {
    state = { ...state, status: 'downloading' }
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
    try {
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('update:install', () => {
    if (state.status === 'downloaded') {
      autoUpdater.quitAndInstall()
    }
    return { success: state.status === 'downloaded' }
  })

  ipcMain.handle('update:get-state', () => state)

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
}
