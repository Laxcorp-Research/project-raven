import { vi, describe, it, expect, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — store functions
// ---------------------------------------------------------------------------

const {
  mockGetAllSettings,
  mockGetSetting,
  mockSaveSetting,
  mockSaveSettings,
  mockSaveApiKeys,
  mockHasApiKeys,
  mockClearApiKeys,
  mockIsFreeMode,
  mockIsProMode,
  mockResetAll,
} = vi.hoisted(() => ({
  mockGetAllSettings: vi.fn().mockReturnValue({}),
  mockGetSetting: vi.fn(),
  mockSaveSetting: vi.fn(),
  mockSaveSettings: vi.fn(),
  mockSaveApiKeys: vi.fn(),
  mockHasApiKeys: vi.fn().mockReturnValue(true),
  mockClearApiKeys: vi.fn(),
  mockIsFreeMode: vi.fn().mockReturnValue(true),
  mockIsProMode: vi.fn().mockReturnValue(false),
  mockResetAll: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Hoisted mocks — windowManager functions
// ---------------------------------------------------------------------------

const {
  mockToggleOverlay,
  mockShowOverlay,
  mockHideOverlay,
  mockSetStealthMode,
  mockGetDashboardWindow,
  mockGetOverlayWindow,
  mockClampOverlayBoundsToDisplay,
} = vi.hoisted(() => ({
  mockToggleOverlay: vi.fn(),
  mockShowOverlay: vi.fn(),
  mockHideOverlay: vi.fn(),
  mockSetStealthMode: vi.fn(),
  mockGetDashboardWindow: vi.fn().mockReturnValue(null),
  mockGetOverlayWindow: vi.fn().mockReturnValue(null),
  mockClampOverlayBoundsToDisplay: vi.fn((b: Record<string, number>) => b),
}))

// ---------------------------------------------------------------------------
// Hoisted mocks — validators
// ---------------------------------------------------------------------------

const { mockValidateBothKeys, mockValidateKeys } = vi.hoisted(() => ({
  mockValidateBothKeys: vi.fn().mockResolvedValue({ valid: true }),
  mockValidateKeys: vi.fn().mockResolvedValue({ valid: true }),
}))

// ---------------------------------------------------------------------------
// Hoisted mocks — electron
// ---------------------------------------------------------------------------

const {
  mockSetLoginItemSettings,
  mockQuit,
  mockGetVersion,
  mockOpenExternal,
  mockGetCursorScreenPoint,
  mockGetDisplayNearestPoint,
  mockGetDisplayMatching,
  handlers,
} = vi.hoisted(() => ({
  mockSetLoginItemSettings: vi.fn(),
  mockQuit: vi.fn(),
  mockGetVersion: vi.fn().mockReturnValue('1.0.0'),
  mockOpenExternal: vi.fn(),
  mockGetCursorScreenPoint: vi.fn().mockReturnValue({ x: 100, y: 200 }),
  mockGetDisplayNearestPoint: vi.fn().mockReturnValue({
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  }),
  mockGetDisplayMatching: vi.fn().mockReturnValue({
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  }),
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/raven-test'),
    setLoginItemSettings: mockSetLoginItemSettings,
    quit: mockQuit,
    getVersion: mockGetVersion,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
    on: vi.fn(),
  },
  shell: {
    openExternal: mockOpenExternal,
  },
  screen: {
    getCursorScreenPoint: mockGetCursorScreenPoint,
    getDisplayNearestPoint: mockGetDisplayNearestPoint,
    getDisplayMatching: mockGetDisplayMatching,
  },
  BrowserWindow: vi.fn(),
}))

vi.mock('../store', () => ({
  getAllSettings: mockGetAllSettings,
  getSetting: mockGetSetting,
  saveSetting: mockSaveSetting,
  saveSettings: mockSaveSettings,
  saveApiKeys: mockSaveApiKeys,
  hasApiKeys: mockHasApiKeys,
  clearApiKeys: mockClearApiKeys,
  isFreeMode: mockIsFreeMode,
  isProMode: mockIsProMode,
  resetAll: mockResetAll,
}))

vi.mock('../windowManager', () => ({
  toggleOverlay: mockToggleOverlay,
  showOverlay: mockShowOverlay,
  hideOverlay: mockHideOverlay,
  setStealthMode: mockSetStealthMode,
  getDashboardWindow: mockGetDashboardWindow,
  getOverlayWindow: mockGetOverlayWindow,
  clampOverlayBoundsToDisplay: mockClampOverlayBoundsToDisplay,
}))

vi.mock('../ipcThrottle', () => ({
  cooldownHandle: vi.fn((channel: string, _cooldownMs: number, handler: (...args: unknown[]) => unknown) => {
    handlers[channel] = (_event: unknown, ...args: unknown[]) => handler(...args)
  }),
  inflightHandle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    handlers[channel] = (_event: unknown, ...args: unknown[]) => handler(...args)
  }),
  resetThrottleState: vi.fn(),
}))

vi.mock('../validators', () => ({
  validateBothKeys: mockValidateBothKeys,
  validateKeys: mockValidateKeys,
}))

vi.mock('../../main/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Import & register handlers
// ---------------------------------------------------------------------------

import { registerIpcHandlers } from '../ipc'

// ---------------------------------------------------------------------------
// Helper: create a fake IPC event
// ---------------------------------------------------------------------------

function fakeEvent(webContentsId = 1) {
  return { sender: { id: webContentsId } } as unknown
}

// ---------------------------------------------------------------------------
// Helper: create a fake BrowserWindow-like overlay
// ---------------------------------------------------------------------------

function createMockOverlay(overrides: Record<string, unknown> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 600, height: 400 })),
    setBounds: vi.fn(),
    getPosition: vi.fn(() => [100, 100]),
    getSize: vi.fn(() => [600, 400]),
    setIgnoreMouseEvents: vi.fn(),
    webContents: { id: 2 },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IPC Handlers (registerIpcHandlers)', () => {
  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k])

    vi.clearAllMocks()

    // Restore return values cleared by mockReset
    mockGetVersion.mockReturnValue('1.0.0')
    mockGetCursorScreenPoint.mockReturnValue({ x: 100, y: 200 })
    mockGetDisplayNearestPoint.mockReturnValue({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })
    mockGetDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })
    mockClampOverlayBoundsToDisplay.mockImplementation((b) => b)
    mockGetAllSettings.mockReturnValue({})
    mockHasApiKeys.mockReturnValue(true)
    mockIsFreeMode.mockReturnValue(true)
    mockIsProMode.mockReturnValue(false)
    mockGetOverlayWindow.mockReturnValue(null)
    mockGetDashboardWindow.mockReturnValue(null)

    registerIpcHandlers()
  })

  // ============================
  // Store handlers
  // ============================

  describe('store:get-all', () => {
    it('delegates to getAllSettings', () => {
      const settings = { theme: 'dark', mode: 'free' }
      mockGetAllSettings.mockReturnValue(settings)

      const result = handlers['store:get-all']()

      expect(result).toBe(settings)
      expect(mockGetAllSettings).toHaveBeenCalled()
    })
  })

  describe('store:get', () => {
    it('delegates to getSetting with the given key', () => {
      mockGetSetting.mockReturnValue('dark')

      const result = handlers['store:get'](fakeEvent(), 'theme')

      expect(mockGetSetting).toHaveBeenCalledWith('theme')
      expect(result).toBe('dark')
    })
  })

  describe('store:set', () => {
    it('delegates to saveSetting and returns true', () => {
      const result = handlers['store:set'](fakeEvent(), 'theme', 'light')

      expect(mockSaveSetting).toHaveBeenCalledWith('theme', 'light')
      expect(result).toBe(true)
    })

    it('sets login item settings when key is openOnLogin', () => {
      handlers['store:set'](fakeEvent(), 'openOnLogin', true)

      expect(mockSetLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
    })

    it('does not set login item settings for other keys', () => {
      handlers['store:set'](fakeEvent(), 'theme', 'dark')

      expect(mockSetLoginItemSettings).not.toHaveBeenCalled()
    })
  })

  describe('store:save-many', () => {
    it('delegates to saveSettings and returns true', () => {
      const partial = { theme: 'dark', stealthEnabled: true }

      const result = handlers['store:save-many'](fakeEvent(), partial)

      expect(mockSaveSettings).toHaveBeenCalledWith(partial)
      expect(result).toBe(true)
    })
  })

  describe('store:save-api-keys', () => {
    it('delegates to saveApiKeys and returns true', () => {
      const result = handlers['store:save-api-keys'](fakeEvent(), 'dg-key', 'ant-key')

      expect(mockSaveApiKeys).toHaveBeenCalledWith('dg-key', 'ant-key', undefined)
      expect(result).toBe(true)
    })

    it('passes openai key when provided', () => {
      const result = handlers['store:save-api-keys'](fakeEvent(), 'dg-key', 'ant-key', 'oai-key')

      expect(mockSaveApiKeys).toHaveBeenCalledWith('dg-key', 'ant-key', 'oai-key')
      expect(result).toBe(true)
    })
  })

  describe('store:has-api-keys', () => {
    it('delegates to hasApiKeys', () => {
      mockHasApiKeys.mockReturnValue(true)

      const result = handlers['store:has-api-keys']()

      expect(result).toBe(true)
      expect(mockHasApiKeys).toHaveBeenCalled()
    })

    it('returns false when no keys', () => {
      mockHasApiKeys.mockReturnValue(false)

      const result = handlers['store:has-api-keys']()

      expect(result).toBe(false)
    })
  })

  describe('store:clear-api-keys', () => {
    it('delegates to clearApiKeys and returns true', () => {
      const result = handlers['store:clear-api-keys']()

      expect(mockClearApiKeys).toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('store:reset-all', () => {
    it('delegates to resetAll and returns true', () => {
      const result = handlers['store:reset-all']()

      expect(mockResetAll).toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('store:is-free-mode', () => {
    it('returns the result of isFreeMode()', () => {
      mockIsFreeMode.mockReturnValue(true)

      expect(handlers['store:is-free-mode']()).toBe(true)
    })
  })

  describe('store:is-pro-mode', () => {
    it('returns the result of isProMode()', () => {
      mockIsProMode.mockReturnValue(false)

      expect(handlers['store:is-pro-mode']()).toBe(false)
    })
  })

  // ============================
  // Shell / open-external
  // ============================

  describe('open-external', () => {
    it('opens valid https URLs', () => {
      const result = handlers['open-external'](fakeEvent(), 'https://example.com')

      expect(mockOpenExternal).toHaveBeenCalledWith('https://example.com')
      expect(result).toBe(true)
    })

    it('opens valid http URLs', () => {
      const result = handlers['open-external'](fakeEvent(), 'http://example.com')

      expect(mockOpenExternal).toHaveBeenCalledWith('http://example.com')
      expect(result).toBe(true)
    })

    it('rejects file:// protocol', () => {
      const result = handlers['open-external'](fakeEvent(), 'file:///etc/passwd')

      expect(mockOpenExternal).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('rejects javascript: protocol', () => {
      const result = handlers['open-external'](fakeEvent(), 'javascript:alert(1)')

      expect(mockOpenExternal).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('rejects invalid URLs', () => {
      const result = handlers['open-external'](fakeEvent(), 'not a url')

      expect(mockOpenExternal).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('rejects data: protocol', () => {
      const result = handlers['open-external'](fakeEvent(), 'data:text/html,<h1>hi</h1>')

      expect(mockOpenExternal).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })
  })

  // ============================
  // app:quit
  // ============================

  describe('app:quit', () => {
    it('calls app.quit()', () => {
      handlers['app:quit']()

      expect(mockQuit).toHaveBeenCalled()
    })
  })

  describe('app:get-version', () => {
    it('returns the app version', () => {
      const result = handlers['app:get-version']()

      expect(result).toBe('1.0.0')
    })
  })

  // ============================
  // Window toggle/show/hide
  // ============================

  describe('window:toggle-overlay', () => {
    it('delegates to toggleOverlay and returns true', () => {
      const result = handlers['window:toggle-overlay']()

      expect(mockToggleOverlay).toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('window:show-overlay', () => {
    it('delegates to showOverlay and returns true', () => {
      const result = handlers['window:show-overlay']()

      expect(mockShowOverlay).toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('window:hide-overlay', () => {
    it('delegates to hideOverlay and returns true', () => {
      const result = handlers['window:hide-overlay']()

      expect(mockHideOverlay).toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  // ============================
  // window:set-ignore-mouse-events
  // ============================

  describe('window:set-ignore-mouse-events', () => {
    it('passes forward option and returns true', () => {
      const overlay = createMockOverlay()
      mockGetOverlayWindow.mockReturnValue(overlay)

      const result = handlers['window:set-ignore-mouse-events'](fakeEvent(), true)

      expect(overlay.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
      expect(result).toBe(true)
    })

    it('returns false when overlay is null', () => {
      mockGetOverlayWindow.mockReturnValue(null)

      const result = handlers['window:set-ignore-mouse-events'](fakeEvent(), true)

      expect(result).toBe(false)
    })

    it('returns false when overlay is destroyed', () => {
      const overlay = createMockOverlay({ isDestroyed: vi.fn(() => true) })
      mockGetOverlayWindow.mockReturnValue(overlay)

      const result = handlers['window:set-ignore-mouse-events'](fakeEvent(), true)

      expect(result).toBe(false)
    })
  })

  // ============================
  // window:move-overlay
  // ============================

  describe('window:move-overlay', () => {
    it('moves up by 50px clamped to work area', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 100, y: 100, width: 600, height: 400 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)

      const result = handlers['window:move-overlay'](fakeEvent(), 'up')

      expect(overlay.setBounds).toHaveBeenCalledWith(
        expect.objectContaining({ x: 100, y: 50 })
      )
      expect(result).toBe(true)
    })

    it('moves down by 50px clamped to work area', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 100, y: 100, width: 600, height: 400 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)

      const result = handlers['window:move-overlay'](fakeEvent(), 'down')

      expect(overlay.setBounds).toHaveBeenCalledWith(
        expect.objectContaining({ x: 100, y: 150 })
      )
      expect(result).toBe(true)
    })

    it('moves left by 50px clamped to work area', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 100, y: 100, width: 600, height: 400 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)

      handlers['window:move-overlay'](fakeEvent(), 'left')

      expect(overlay.setBounds).toHaveBeenCalledWith(
        expect.objectContaining({ x: 50, y: 100 })
      )
    })

    it('moves right by 50px clamped to work area', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 100, y: 100, width: 600, height: 400 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)

      handlers['window:move-overlay'](fakeEvent(), 'right')

      expect(overlay.setBounds).toHaveBeenCalledWith(
        expect.objectContaining({ x: 150, y: 100 })
      )
    })

    it('clamps up movement to top edge of work area', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 100, y: 20, width: 600, height: 400 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)

      handlers['window:move-overlay'](fakeEvent(), 'up')

      expect(overlay.setBounds).toHaveBeenCalledWith(
        expect.objectContaining({ y: 0 })
      )
    })

    it('returns false when no overlay', () => {
      mockGetOverlayWindow.mockReturnValue(null)

      const result = handlers['window:move-overlay'](fakeEvent(), 'up')

      expect(result).toBe(false)
    })
  })

  // ============================
  // window:resize
  // ============================

  describe('window:resize', () => {
    it('clamps width to min and calls setBounds via clamp helper', () => {
      const overlay = createMockOverlay()
      mockGetOverlayWindow.mockReturnValue(overlay)
      mockClampOverlayBoundsToDisplay.mockImplementation((b) => b)

      handlers['window:resize'](fakeEvent(), 200, 300)

      expect(mockClampOverlayBoundsToDisplay).toHaveBeenCalled()
      const arg = mockClampOverlayBoundsToDisplay.mock.calls[0][0]
      // Min width is 480
      expect(arg.width).toBe(480)
    })

    it('keeps bottom-right stable when resizing', () => {
      const overlay = createMockOverlay({
        getPosition: vi.fn(() => [100, 100]),
        getSize: vi.fn(() => [600, 400]),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)
      mockClampOverlayBoundsToDisplay.mockImplementation((b) => b)

      handlers['window:resize'](fakeEvent(), 500, 350)

      const arg = mockClampOverlayBoundsToDisplay.mock.calls[0][0]
      // newX = 100 + (600 - 500) = 200
      expect(arg.x).toBe(200)
      // newY = 100 + (400 - 350) = 150
      expect(arg.y).toBe(150)
    })

    it('returns true even when overlay is null (no-op)', () => {
      mockGetOverlayWindow.mockReturnValue(null)

      const result = handlers['window:resize'](fakeEvent(), 500, 300)

      expect(result).toBe(true)
    })
  })

  // ============================
  // window:set-stealth
  // ============================

  describe('window:set-stealth', () => {
    it('delegates to setStealthMode with true', () => {
      const result = handlers['window:set-stealth'](fakeEvent(), true)

      expect(mockSetStealthMode).toHaveBeenCalledWith(true)
      expect(result).toBe(true)
    })

    it('delegates to setStealthMode with false', () => {
      const result = handlers['window:set-stealth'](fakeEvent(), false)

      expect(mockSetStealthMode).toHaveBeenCalledWith(false)
      expect(result).toBe(true)
    })
  })

  // ============================
  // window:get-type
  // ============================

  describe('window:get-type', () => {
    it('returns "dashboard" when sender matches dashboard webContents', () => {
      const dashboardWin = { webContents: { id: 1 } }
      const overlayWin = { webContents: { id: 2 } }
      mockGetDashboardWindow.mockReturnValue(dashboardWin)
      mockGetOverlayWindow.mockReturnValue(overlayWin)

      const result = handlers['window:get-type'](fakeEvent(1))

      expect(result).toBe('dashboard')
    })

    it('returns "overlay" when sender matches overlay webContents', () => {
      const dashboardWin = { webContents: { id: 1 } }
      const overlayWin = { webContents: { id: 2 } }
      mockGetDashboardWindow.mockReturnValue(dashboardWin)
      mockGetOverlayWindow.mockReturnValue(overlayWin)

      const result = handlers['window:get-type'](fakeEvent(2))

      expect(result).toBe('overlay')
    })

    it('returns "unknown" when sender matches neither window', () => {
      const dashboardWin = { webContents: { id: 1 } }
      const overlayWin = { webContents: { id: 2 } }
      mockGetDashboardWindow.mockReturnValue(dashboardWin)
      mockGetOverlayWindow.mockReturnValue(overlayWin)

      const result = handlers['window:get-type'](fakeEvent(99))

      expect(result).toBe('unknown')
    })

    it('returns "unknown" when both windows are null', () => {
      mockGetDashboardWindow.mockReturnValue(null)
      mockGetOverlayWindow.mockReturnValue(null)

      const result = handlers['window:get-type'](fakeEvent(1))

      expect(result).toBe('unknown')
    })
  })

  // ============================
  // Validation handlers
  // ============================

  describe('validate-api-keys', () => {
    it('delegates to validateBothKeys', async () => {
      mockValidateBothKeys.mockResolvedValue({ valid: true })

      const result = await handlers['validate-api-keys'](fakeEvent(), 'dg-key', 'ant-key')

      expect(result).toEqual({ valid: true })
    })

    it('returns failure from validateBothKeys', async () => {
      mockValidateBothKeys.mockResolvedValue({ valid: false, error: 'Bad key' })

      const result = await handlers['validate-api-keys'](fakeEvent(), 'bad', 'bad')

      expect(result).toEqual({ valid: false, error: 'Bad key' })
    })
  })

  describe('validate-keys', () => {
    it('delegates to validateKeys with provider info', async () => {
      mockValidateKeys.mockResolvedValue({ valid: true })

      const result = await handlers['validate-keys'](fakeEvent(), 'dg-key', 'openai', 'sk-key')

      expect(result).toEqual({ valid: true })
    })
  })

  // ============================
  // window:get-overlay-bounds
  // ============================

  describe('window:get-overlay-bounds', () => {
    it('returns bounds when overlay exists', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 10, y: 20, width: 600, height: 400 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)

      const result = handlers['window:get-overlay-bounds']()

      expect(result).toEqual({ x: 10, y: 20, width: 600, height: 400 })
    })

    it('returns null when no overlay', () => {
      mockGetOverlayWindow.mockReturnValue(null)

      const result = handlers['window:get-overlay-bounds']()

      expect(result).toBeNull()
    })
  })

  // ============================
  // window:get-cursor-point
  // ============================

  describe('window:get-cursor-point', () => {
    it('returns the cursor screen point', () => {
      mockGetCursorScreenPoint.mockReturnValue({ x: 500, y: 300 })

      const result = handlers['window:get-cursor-point']()

      expect(result).toEqual({ x: 500, y: 300 })
    })
  })

  // ============================
  // window:show-dashboard
  // ============================

  describe('window:show-dashboard', () => {
    it('shows and focuses the dashboard and returns true', () => {
      const dashboard = {
        isDestroyed: vi.fn(() => false),
        show: vi.fn(),
        focus: vi.fn(),
      }
      mockGetDashboardWindow.mockReturnValue(dashboard)

      const result = handlers['window:show-dashboard']()

      expect(dashboard.show).toHaveBeenCalled()
      expect(dashboard.focus).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('returns false when dashboard is null', () => {
      mockGetDashboardWindow.mockReturnValue(null)

      const result = handlers['window:show-dashboard']()

      expect(result).toBe(false)
    })

    it('returns false when dashboard is destroyed', () => {
      const dashboard = {
        isDestroyed: vi.fn(() => true),
        show: vi.fn(),
        focus: vi.fn(),
      }
      mockGetDashboardWindow.mockReturnValue(dashboard)

      const result = handlers['window:show-dashboard']()

      expect(result).toBe(false)
    })
  })

  // ============================
  // window:set-overlay-bounds
  // ============================

  describe('window:set-overlay-bounds', () => {
    it('sets clamped bounds on the overlay', () => {
      const overlay = createMockOverlay()
      mockGetOverlayWindow.mockReturnValue(overlay)
      mockClampOverlayBoundsToDisplay.mockImplementation((b) => b)

      const bounds = { x: 50, y: 50, width: 700, height: 500 }
      const result = handlers['window:set-overlay-bounds'](fakeEvent(), bounds)

      expect(overlay.setBounds).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('clamps width and height to minimums', () => {
      const overlay = createMockOverlay()
      mockGetOverlayWindow.mockReturnValue(overlay)
      mockClampOverlayBoundsToDisplay.mockImplementation((b) => b)

      const bounds = { x: 10, y: 10, width: 100, height: 50 }
      handlers['window:set-overlay-bounds'](fakeEvent(), bounds)

      const arg = mockClampOverlayBoundsToDisplay.mock.calls[0][0]
      expect(arg.width).toBe(480) // OVERLAY_MIN_WIDTH
    })

    it('returns false when overlay is null', () => {
      mockGetOverlayWindow.mockReturnValue(null)

      const result = handlers['window:set-overlay-bounds'](fakeEvent(), { x: 0, y: 0, width: 500, height: 300 })

      expect(result).toBe(false)
    })
  })

  // ============================
  // window:auto-size-overlay
  // ============================

  describe('window:auto-size-overlay', () => {
    it('returns false when no overlay', () => {
      mockGetOverlayWindow.mockReturnValue(null)

      const result = handlers['window:auto-size-overlay'](fakeEvent(), 'compact')

      expect(result).toBe(false)
    })

    it('sets bounds for compact mode', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 100, y: 100, width: 600, height: 500 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)
      mockClampOverlayBoundsToDisplay.mockImplementation((b) => b)

      handlers['window:auto-size-overlay'](fakeEvent(), 'compact')

      expect(overlay.setBounds).toHaveBeenCalled()
    })

    it('sets bounds for expanded mode', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 100, y: 100, width: 600, height: 300 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)
      mockClampOverlayBoundsToDisplay.mockImplementation((b) => b)

      handlers['window:auto-size-overlay'](fakeEvent(), 'expanded')

      expect(overlay.setBounds).toHaveBeenCalled()
    })

    it('returns true when target height equals current height', () => {
      const overlay = createMockOverlay({
        getBounds: vi.fn(() => ({ x: 100, y: 100, width: 600, height: 216 })),
      })
      mockGetOverlayWindow.mockReturnValue(overlay)

      const result = handlers['window:auto-size-overlay'](fakeEvent(), 'compact')

      expect(result).toBe(true)
    })
  })

  // ============================
  // Pro mode noop handlers registration
  // ============================

  describe('pro mode noop handlers (free mode)', () => {
    it('registers auth and proxy noop handlers when not pro', () => {
      // Re-register with isProMode returning false
      Object.keys(handlers).forEach((k) => delete handlers[k])
      mockIsProMode.mockReturnValue(false)
      registerIpcHandlers()

      expect(handlers['auth:is-authenticated']).toBeDefined()
      expect(handlers['auth:is-authenticated']()).toBe(false)

      expect(handlers['auth:get-current-user']).toBeDefined()
      expect(handlers['auth:get-current-user']()).toBeNull()

      expect(handlers['auth:is-backend-configured']).toBeDefined()
      expect(handlers['auth:is-backend-configured']()).toBe(false)
    })

    it('does not register noop handlers in pro mode', () => {
      Object.keys(handlers).forEach((k) => delete handlers[k])
      mockIsProMode.mockReturnValue(true)
      registerIpcHandlers()

      expect(handlers['auth:is-authenticated']).toBeUndefined()
    })
  })
})
