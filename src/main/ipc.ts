import { ipcMain, shell } from 'electron'
import {
  getAllSettings,
  getSetting,
  saveSetting,
  saveSettings,
  saveApiKeys,
  hasApiKeys,
  clearApiKeys,
  isFreeMode,
  isProMode,
  resetAll
} from './store'
import type { LocalSettings } from './store'
import {
  toggleOverlay,
  showOverlay,
  hideOverlay,
  setStealthMode,
  getDashboardWindow,
  getOverlayWindow
} from './windowManager'

export function registerIpcHandlers(): void {
  ipcMain.handle('store:get-all', () => {
    return getAllSettings()
  })

  ipcMain.handle('store:get', (_event, key: keyof LocalSettings) => {
    return getSetting(key)
  })

  ipcMain.handle(
    'store:set',
    (_event, key: keyof LocalSettings, value: LocalSettings[keyof LocalSettings]) => {
      saveSetting(key, value)
      return true
    }
  )

  ipcMain.handle('store:save-many', (_event, settings: Partial<LocalSettings>) => {
    saveSettings(settings)
    return true
  })

  ipcMain.handle(
    'store:save-api-keys',
    (_event, deepgramKey: string, anthropicKey: string) => {
      saveApiKeys(deepgramKey, anthropicKey)
      return true
    }
  )

  ipcMain.handle('store:has-api-keys', () => {
    return hasApiKeys()
  })

  ipcMain.handle('store:clear-api-keys', () => {
    clearApiKeys()
    return true
  })

  ipcMain.handle('store:is-free-mode', () => {
    return isFreeMode()
  })

  ipcMain.handle('store:is-pro-mode', () => {
    return isProMode()
  })

  ipcMain.handle('store:reset-all', () => {
    resetAll()
    return true
  })

  // ---- Validation ----

  ipcMain.handle(
    'validate-api-keys',
    async (_event, deepgramKey: string, anthropicKey: string) => {
      const { validateBothKeys } = await import('./validators')
      return validateBothKeys(deepgramKey, anthropicKey)
    }
  )

  // ---- Shell ----

  ipcMain.handle('open-external', (_event, url: string) => {
    shell.openExternal(url)
    return true
  })

  // ---- Window ----

  ipcMain.handle('window:toggle-overlay', () => {
    toggleOverlay()
    return true
  })

  ipcMain.handle('window:show-overlay', () => {
    showOverlay()
    return true
  })

  ipcMain.handle('window:hide-overlay', () => {
    hideOverlay()
    return true
  })

  ipcMain.handle('window:set-stealth', (_event, enabled: boolean) => {
    setStealthMode(enabled)
    return true
  })

  ipcMain.handle('window:get-type', (event) => {
    const webContentsId = event.sender.id
    const dashboard = getDashboardWindow()
    const overlay = getOverlayWindow()

    if (dashboard && dashboard.webContents.id === webContentsId) return 'dashboard'
    if (overlay && overlay.webContents.id === webContentsId) return 'overlay'
    return 'unknown'
  })

  // ---- Recording hotkey from dashboard ----
  ipcMain.on('hotkey:toggle-recording-from-dashboard', () => {
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('hotkey:toggle-recording')
      if (!overlay.isVisible()) {
        overlay.show()
        overlay.focus()
      }
    }
  })
}
