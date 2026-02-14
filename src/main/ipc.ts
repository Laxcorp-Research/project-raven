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

  ipcMain.handle('window:resize', (_event, width: number, height: number) => {
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      const minWidth = 540
      const minHeight = 420
      const clampedWidth = Math.max(width, minWidth)
      const clampedHeight = Math.max(height, minHeight)

      const [x, y] = overlay.getPosition()
      const [currentWidth, currentHeight] = overlay.getSize()

      // Keep bottom-right position stable while resizing
      const newX = x + (currentWidth - clampedWidth)
      const newY = y + (currentHeight - clampedHeight)

      overlay.setBounds({
        x: Math.max(0, newX),
        y: Math.max(0, newY),
        width: clampedWidth,
        height: clampedHeight
      })
    }
    return true
  })

  ipcMain.handle('window:get-overlay-bounds', () => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return null
    return overlay.getBounds()
  })

  ipcMain.handle(
    'window:set-overlay-bounds',
    (_event, bounds: { x: number; y: number; width: number; height: number }) => {
      const overlay = getOverlayWindow()
      if (!overlay || overlay.isDestroyed()) return false

      const minWidth = 540
      const minHeight = 420

      const clampedWidth = Math.max(Math.round(bounds.width), minWidth)
      const clampedHeight = Math.max(Math.round(bounds.height), minHeight)

      overlay.setBounds({
        x: Math.max(0, Math.round(bounds.x)),
        y: Math.max(0, Math.round(bounds.y)),
        width: clampedWidth,
        height: clampedHeight
      })
      return true
    }
  )

  ipcMain.handle('window:show-dashboard', () => {
    const dashboard = getDashboardWindow()
    if (dashboard && !dashboard.isDestroyed()) {
      dashboard.show()
      dashboard.focus()
      return true
    }
    return false
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
