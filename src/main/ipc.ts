import { app, ipcMain, shell, screen } from 'electron'
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
  getOverlayWindow,
  clampOverlayBoundsToDisplay
} from './windowManager'

function assertString(val: unknown, name: string, maxLen = 10_000): asserts val is string {
  if (typeof val !== 'string') throw new Error(`${name} must be a string`)
  if (val.length > maxLen) throw new Error(`${name} exceeds max length (${maxLen})`)
}

function assertNumber(val: unknown, name: string): asserts val is number {
  if (typeof val !== 'number' || !Number.isFinite(val)) throw new Error(`${name} must be a finite number`)
}

function assertBoolean(val: unknown, name: string): asserts val is boolean {
  if (typeof val !== 'boolean') throw new Error(`${name} must be a boolean`)
}

export function registerIpcHandlers(): void {
  const OVERLAY_MIN_WIDTH = 480
  const OVERLAY_COMPACT_MIN_HEIGHT = 210
  const OVERLAY_COMPACT_TARGET_HEIGHT = 216
  const OVERLAY_EXPANDED_MIN_HEIGHT = 500

  let overlayActiveMinHeight = OVERLAY_COMPACT_MIN_HEIGHT

  ipcMain.handle('store:get-all', () => {
    return getAllSettings()
  })

  ipcMain.handle('store:get', (_event, key: keyof LocalSettings) => {
    assertString(key, 'key', 100)
    return getSetting(key)
  })

  const PROTECTED_STORE_KEYS: readonly string[] = ['mode', 'auth_tokens', 'auth_user', 'deepgramApiKey', 'anthropicApiKey', 'openaiApiKey', 'apiKeysConfigured']

  ipcMain.handle(
    'store:set',
    (_event, key: keyof LocalSettings, value: LocalSettings[keyof LocalSettings]) => {
      if (PROTECTED_STORE_KEYS.includes(key as string)) {
        return false
      }
      saveSetting(key, value)
      if (key === 'openOnLogin') {
        app.setLoginItemSettings({ openAtLogin: !!value })
      }
      return true
    }
  )

  ipcMain.handle('store:save-many', (_event, settings: Partial<LocalSettings>) => {
    const filtered = { ...settings }
    for (const key of PROTECTED_STORE_KEYS) {
      delete (filtered as Record<string, unknown>)[key]
    }
    saveSettings(filtered)
    return true
  })

  ipcMain.handle(
    'store:save-api-keys',
    (_event, deepgramKey: string, anthropicKey: string) => {
      assertString(deepgramKey, 'deepgramKey', 500)
      assertString(anthropicKey, 'anthropicKey', 500)
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

  ipcMain.handle(
    'validate-keys',
    async (_event, deepgramKey: string, aiProvider: 'anthropic' | 'openai', aiKey: string) => {
      const { validateKeys } = await import('./validators')
      return validateKeys(deepgramKey, aiProvider, aiKey)
    }
  )

  // ---- Shell ----

  ipcMain.handle('open-external', (_event, url: string) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return false
      }
    } catch {
      return false
    }
    shell.openExternal(url)
    return true
  })

  ipcMain.handle('app:quit', () => {
    app.quit()
  })

  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
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

  ipcMain.handle('window:auto-size-overlay', (_event, mode: 'compact' | 'expanded') => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return false

    const bounds = overlay.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const workArea = display.workArea

    overlayActiveMinHeight = mode === 'expanded'
      ? OVERLAY_EXPANDED_MIN_HEIGHT
      : OVERLAY_COMPACT_MIN_HEIGHT

    const targetHeight = mode === 'compact'
      ? OVERLAY_COMPACT_TARGET_HEIGHT
      : Math.max(bounds.height, OVERLAY_EXPANDED_MIN_HEIGHT)

    if (targetHeight === bounds.height) return true

    let nextY = bounds.y
    const delta = targetHeight - bounds.height

    if (delta > 0) {
      const availableBottom = workArea.y + workArea.height - (bounds.y + bounds.height)
      if (availableBottom < delta) {
        nextY = bounds.y - (delta - availableBottom)
      }
    } else {
      // On shrink, keep bottom/input anchor stable.
      nextY = bounds.y + Math.abs(delta)
    }

    const clamped = clampOverlayBoundsToDisplay({
      x: bounds.x,
      y: nextY,
      width: bounds.width,
      height: targetHeight
    })
    overlay.setBounds(clamped)
    return true
  })

  ipcMain.handle('window:move-overlay', (_event, direction: 'up' | 'down' | 'left' | 'right') => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return false

    const bounds = overlay.getBounds()
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y })
    const workArea = display.workArea
    const step = 50

    let newX = bounds.x
    let newY = bounds.y

    switch (direction) {
      case 'up': newY = Math.max(workArea.y, bounds.y - step); break
      case 'down': newY = Math.min(workArea.y + workArea.height - bounds.height, bounds.y + step); break
      case 'left': newX = Math.max(workArea.x, bounds.x - step); break
      case 'right': newX = Math.min(workArea.x + workArea.width - bounds.width, bounds.x + step); break
    }

    overlay.setBounds({ ...bounds, x: newX, y: newY })
    return true
  })

  ipcMain.handle('window:set-ignore-mouse-events', (_event, ignore: boolean) => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return false
    overlay.setIgnoreMouseEvents(ignore, { forward: true })
    return true
  })

  ipcMain.handle('window:resize', (_event, width: number, height: number) => {
    assertNumber(width, 'width')
    assertNumber(height, 'height')
    const overlay = getOverlayWindow()
    if (overlay && !overlay.isDestroyed()) {
      const clampedWidth = Math.max(width, OVERLAY_MIN_WIDTH)
      const clampedHeight = Math.max(height, overlayActiveMinHeight)

      const [x, y] = overlay.getPosition()
      const [currentWidth, currentHeight] = overlay.getSize()

      // Keep bottom-right position stable while resizing
      const newX = x + (currentWidth - clampedWidth)
      const newY = y + (currentHeight - clampedHeight)

      const clampedBounds = clampOverlayBoundsToDisplay({
        x: newX,
        y: newY,
        width: clampedWidth,
        height: clampedHeight
      })
      overlay.setBounds(clampedBounds)
    }
    return true
  })

  ipcMain.handle('window:get-overlay-bounds', () => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return null
    return overlay.getBounds()
  })

  ipcMain.handle('window:get-cursor-point', () => {
    return screen.getCursorScreenPoint()
  })

  ipcMain.handle(
    'window:set-overlay-bounds',
    (_event, bounds: { x: number; y: number; width: number; height: number }) => {
      const overlay = getOverlayWindow()
      if (!overlay || overlay.isDestroyed()) return false

      const clampedWidth = Math.max(Math.round(bounds.width), OVERLAY_MIN_WIDTH)
      const clampedHeight = Math.max(Math.round(bounds.height), overlayActiveMinHeight)

      const clampedBounds = clampOverlayBoundsToDisplay({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: clampedWidth,
        height: clampedHeight
      })
      overlay.setBounds(clampedBounds)
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
    assertBoolean(enabled, 'enabled')
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

  if (!isProMode()) {
    const noopNull = () => null
    const noopFalse = () => false
    const noopObj = () => ({})
    const noopResult = () => ({ success: false })
    ipcMain.handle('auth:is-backend-configured', noopFalse)
    ipcMain.handle('auth:is-authenticated', noopFalse)
    ipcMain.handle('auth:get-current-user', noopNull)
    ipcMain.handle('auth:start-browser-login', noopResult)
    ipcMain.handle('auth:cancel-browser-login', noopResult)
    ipcMain.handle('auth:login', noopResult)
    ipcMain.handle('auth:signup', noopResult)
    ipcMain.handle('auth:start-google-login', noopResult)
    ipcMain.handle('auth:start-apple-login', noopResult)
    ipcMain.handle('auth:logout', noopResult)
    ipcMain.handle('auth:fetch-profile', noopResult)
    ipcMain.handle('auth:get-subscription', () => ({ plan: 'FREE', status: 'ACTIVE', currentPeriodEnd: null }))
    ipcMain.handle('auth:get-managed-keys', noopNull)
    ipcMain.handle('auth:open-checkout', noopResult)
    ipcMain.handle('auth:open-billing-portal', noopResult)
    ipcMain.handle('proxy:get-usage', () => ({ plan: 'FREE', used: 0, limit: 5, remaining: 5, sessionsUsed: 0, sessionLimit: 999, sessionMaxSeconds: 120, resetAt: null }))
    ipcMain.handle('proxy:check-session', () => ({ allowed: true, plan: 'FREE', sessionMaxSeconds: 120, sessionsUsed: 0, sessionLimit: 999, resetAt: null }))
    ipcMain.handle('proxy:start-session', () => ({ allowed: true, sessionMaxSeconds: 120 }))
    ipcMain.handle('proxy:get-transcription-token', noopNull)
    ipcMain.handle('proxy:analyze-session', noopNull)
    ipcMain.handle('sync:get-status', () => ({ lastSyncAt: null, queueSize: 0, consecutiveFailures: 0 }))
    ipcMain.handle('sync:trigger', noopObj)
    ipcMain.handle('sync:get-log', () => [])

    ipcMain.handle('recall:is-available', noopFalse)
    ipcMain.handle('recall:get-detected-meetings', () => [])
    ipcMain.handle('recall:get-state', () => ({ isRecording: false, windowId: null, sdkReady: false }))
    ipcMain.handle('recall:start-meeting-recording', noopResult)
    ipcMain.handle('recall:start-adhoc-recording', noopResult)
    ipcMain.handle('recall:stop-recording', noopResult)
  }
}
