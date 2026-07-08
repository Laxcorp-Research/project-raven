import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { BrowserWindow } from 'electron'

const { mockBrowserWindowInstance, mockWebRequestHandlers: _mockWebRequestHandlers } = vi.hoisted(() => ({
  mockBrowserWindowInstance: {
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      setBackgroundThrottling: vi.fn(),
      setZoomLevel: vi.fn(),
      setVisualZoomLevelLimits: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      session: {
        webRequest: {
          onHeadersReceived: vi.fn(),
        },
      },
    },
    on: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    setContentProtection: vi.fn(),
    setFocusable: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    showInactive: vi.fn(),
    setOpacity: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 500, height: 400 })),
    isContentProtected: vi.fn(() => false),
  },
  mockWebRequestHandlers: {} as Record<string, (...args: unknown[]) => void>,
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () { return mockBrowserWindowInstance }),
  screen: {
    getDisplayMatching: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    })),
    getPrimaryDisplay: vi.fn(() => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workAreaSize: { width: 1920, height: 1080 },
    })),
  },
  app: {
    getPath: vi.fn(() => '/tmp'),
    dock: {
      hide: vi.fn(),
      show: vi.fn(),
    },
    isPackaged: false,
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  session: {},
}))

const mockGetSetting = vi.hoisted(() => vi.fn(() => null))
const mockSaveSetting = vi.hoisted(() => vi.fn())

vi.mock('../store', () => ({
  getSetting: mockGetSetting,
  saveSetting: mockSaveSetting,
}))

// The overlay tool-window (Alt-Tab exclusion) helper loads a Windows native
// module; stub it so windowManager tests stay isolated from that .node.
vi.mock('../windowsOverlayStyle', () => ({
  applyOverlayToolWindowStyle: vi.fn(() => false),
}))

import {
  clampOverlayBoundsToDisplay,
  createDashboardWindow,
  createOverlayWindow,
  getDashboardWindow,
  getOverlayWindow,
  toggleOverlay,
  showOverlay,
  hideOverlay,
  setOverlayEnabled,
  setOverlayFocusable,
  showOverlayWindow,
  setStealthMode,
  registerStealthTrayCallbacks,
} from '../windowManager'
import { app } from 'electron'

describe('windowManager', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSetting.mockReturnValue(null)
    mockBrowserWindowInstance.isDestroyed.mockReturnValue(false)
    mockBrowserWindowInstance.isVisible.mockReturnValue(false)
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  describe('clampOverlayBoundsToDisplay', () => {
    it('returns same bounds when within display area', () => {
      const bounds = { x: 100, y: 100, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result).toEqual({ x: 100, y: 100, width: 400, height: 300 })
    })

    it('clamps x to left edge when negative', () => {
      const bounds = { x: -50, y: 100, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.x).toBe(0)
    })

    it('clamps x to right edge when overflowing', () => {
      const bounds = { x: 1800, y: 100, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.x).toBe(1520)
    })

    it('clamps y to top edge when negative', () => {
      const bounds = { x: 100, y: -20, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.y).toBe(0)
    })

    it('clamps y to bottom edge when overflowing', () => {
      const bounds = { x: 100, y: 900, width: 400, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.y).toBe(780)
    })

    it('clamps width to display width when too large', () => {
      const bounds = { x: 0, y: 0, width: 3000, height: 300 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.width).toBe(1920)
    })

    it('clamps height to display height when too large', () => {
      const bounds = { x: 0, y: 0, width: 400, height: 2000 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.height).toBe(1080)
    })

    it('handles window larger than display in both dimensions', () => {
      const bounds = { x: 500, y: 500, width: 3000, height: 2000 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(result.width).toBe(1920)
      expect(result.height).toBe(1080)
      expect(result.x).toBe(0)
      expect(result.y).toBe(0)
    })

    it('rounds fractional values', () => {
      const bounds = { x: 100.7, y: 200.3, width: 400.5, height: 300.9 }
      const result = clampOverlayBoundsToDisplay(bounds)

      expect(Number.isInteger(result.x)).toBe(true)
      expect(Number.isInteger(result.y)).toBe(true)
      expect(Number.isInteger(result.width)).toBe(true)
      expect(Number.isInteger(result.height)).toBe(true)
    })
  })

  describe('createDashboardWindow', () => {
    it('creates a BrowserWindow with correct options', () => {
      const win = createDashboardWindow('/preload.js', 'http://localhost:3000')

      expect(win).toBeDefined()
      expect(mockBrowserWindowInstance.loadURL).toHaveBeenCalledWith('http://localhost:3000')
    })

    it('loads file when no rendererURL', () => {
      createDashboardWindow('/preload.js', null)

      expect(mockBrowserWindowInstance.loadFile).toHaveBeenCalled()
    })

    it('uses saved bounds from settings', () => {
      mockGetSetting.mockReturnValue({ x: 50, y: 50, width: 800, height: 600 })

      createDashboardWindow('/preload.js', null)
    })

    it('registers event listeners', () => {
      createDashboardWindow('/preload.js', null)

      const registeredEvents = mockBrowserWindowInstance.on.mock.calls.map((c: unknown[]) => c[0])
      expect(registeredEvents).toContain('resized')
      expect(registeredEvents).toContain('moved')
      expect(registeredEvents).toContain('ready-to-show')
      expect(registeredEvents).toContain('close')
      expect(registeredEvents).toContain('closed')
    })

    it('saves bounds on resize', () => {
      createDashboardWindow('/preload.js', null)

      const resizeHandler = mockBrowserWindowInstance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'resized',
      )?.[1] as () => void
      resizeHandler()

      expect(mockSaveSetting).toHaveBeenCalledWith('dashboardBounds', expect.any(Object))
    })

    it('saves bounds on move', () => {
      createDashboardWindow('/preload.js', null)

      const moveHandler = mockBrowserWindowInstance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'moved',
      )?.[1] as () => void
      moveHandler()

      expect(mockSaveSetting).toHaveBeenCalledWith('dashboardBounds', expect.any(Object))
    })

    it('sets will-navigate handler to block external URLs', () => {
      createDashboardWindow('/preload.js', null)

      expect(mockBrowserWindowInstance.webContents.on).toHaveBeenCalled()
      const willNavigateCall = mockBrowserWindowInstance.webContents.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'will-navigate',
      )
      expect(willNavigateCall).toBeDefined()
    })

    it('sets window open handler to deny', () => {
      createDashboardWindow('/preload.js', null)

      expect(mockBrowserWindowInstance.webContents.setWindowOpenHandler).toHaveBeenCalled()
    })
  })

  describe('dashboard close behavior (hide-on-close)', () => {
    const getCloseHandler = () => {
      createDashboardWindow('/preload.js', null)
      return mockBrowserWindowInstance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'close',
      )?.[1] as ((e: { preventDefault: () => void }) => void) | undefined
    }

    it('hides instead of destroying on Windows (so the tray can re-show it)', () => {
      // Regression for "the window never comes back, not even from the
      // tray icon": before the fix this guard was darwin-only, so on
      // Windows window:close DESTROYED the dashboard and nulled the
      // reference - the tray could no longer re-show it.
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      const closeHandler = getCloseHandler()
      expect(closeHandler).toBeDefined()

      const preventDefault = vi.fn()
      closeHandler!({ preventDefault })

      expect(preventDefault).toHaveBeenCalled()
      expect(mockBrowserWindowInstance.hide).toHaveBeenCalled()
    })

    it('hides instead of destroying on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      const closeHandler = getCloseHandler()

      const preventDefault = vi.fn()
      closeHandler!({ preventDefault })

      expect(preventDefault).toHaveBeenCalled()
      expect(mockBrowserWindowInstance.hide).toHaveBeenCalled()
    })

    it('allows close-to-quit on Linux where tray support is unreliable', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      const closeHandler = getCloseHandler()

      const preventDefault = vi.fn()
      closeHandler!({ preventDefault })

      expect(preventDefault).not.toHaveBeenCalled()
      expect(mockBrowserWindowInstance.hide).not.toHaveBeenCalled()
    })
  })

  describe('createOverlayWindow', () => {
    it('creates an overlay BrowserWindow', () => {
      const win = createOverlayWindow('/preload.js', 'http://localhost:3000')

      expect(win).toBeDefined()
      expect(mockBrowserWindowInstance.loadURL).toHaveBeenCalledWith('http://localhost:3000#overlay')
    })

    it('loads file when no rendererURL', () => {
      createOverlayWindow('/preload.js', null)

      expect(mockBrowserWindowInstance.loadFile).toHaveBeenCalled()
    })

    it('configures always-on-top on macOS', () => {
      createOverlayWindow('/preload.js', null)

      expect(mockBrowserWindowInstance.setOpacity).toHaveBeenCalledWith(0.99)
      expect(mockBrowserWindowInstance.setAlwaysOnTop).toHaveBeenCalled()
      expect(mockBrowserWindowInstance.setVisibleOnAllWorkspaces).toHaveBeenCalled()
    })

    it('disables background throttling', () => {
      createOverlayWindow('/preload.js', null)

      expect(mockBrowserWindowInstance.webContents.setBackgroundThrottling).toHaveBeenCalledWith(false)
    })
  })

  describe('getDashboardWindow / getOverlayWindow', () => {
    it('returns dashboard window after creation', () => {
      createDashboardWindow('/preload.js', null)
      expect(getDashboardWindow()).toBeDefined()
    })

    it('returns overlay window after creation', () => {
      createOverlayWindow('/preload.js', null)
      expect(getOverlayWindow()).toBeDefined()
    })
  })

  describe('toggleOverlay', () => {
    it('does nothing when overlay not created', () => {
      toggleOverlay()
    })

    it('hides visible overlay', () => {
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.isVisible.mockReturnValue(true)

      toggleOverlay()

      expect(mockBrowserWindowInstance.hide).toHaveBeenCalled()
    })

    it('shows hidden overlay when enabled', () => {
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.isVisible.mockReturnValue(false)
      setOverlayEnabled(true)

      toggleOverlay()

      expect(mockBrowserWindowInstance.show).toHaveBeenCalled()
      expect(mockBrowserWindowInstance.focus).toHaveBeenCalled()
    })

    it('does not show hidden overlay when disabled', () => {
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.isVisible.mockReturnValue(false)
      setOverlayEnabled(false)
      mockBrowserWindowInstance.show.mockClear()

      toggleOverlay()

      expect(mockBrowserWindowInstance.show).not.toHaveBeenCalled()
    })
  })

  describe('showOverlay', () => {
    it('shows overlay when enabled', () => {
      createOverlayWindow('/preload.js', null)
      setOverlayEnabled(true)
      mockBrowserWindowInstance.show.mockClear()

      showOverlay()

      expect(mockBrowserWindowInstance.show).toHaveBeenCalled()
    })

    it('does not show overlay when disabled', () => {
      createOverlayWindow('/preload.js', null)
      setOverlayEnabled(false)
      mockBrowserWindowInstance.show.mockClear()

      showOverlay()

      expect(mockBrowserWindowInstance.show).not.toHaveBeenCalled()
    })
  })

  describe('hideOverlay', () => {
    it('hides overlay window', () => {
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.hide.mockClear()

      hideOverlay()

      expect(mockBrowserWindowInstance.hide).toHaveBeenCalled()
    })

    it('does nothing when overlay not created', () => {
      hideOverlay()
    })
  })

  describe('setOverlayEnabled', () => {
    it('hides overlay when disabled', () => {
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.hide.mockClear()

      setOverlayEnabled(false)

      expect(mockBrowserWindowInstance.hide).toHaveBeenCalled()
    })
  })

  describe('setStealthMode', () => {
    it('enables content protection on both windows', () => {
      createDashboardWindow('/preload.js', null)
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.setContentProtection.mockClear()

      setStealthMode(true)

      expect(mockBrowserWindowInstance.setContentProtection).toHaveBeenCalledWith(true)
      expect(mockBrowserWindowInstance.webContents.send).toHaveBeenCalledWith('stealth-changed', true)
    })

    it('hides dock on macOS when stealth enabled', () => {
      createDashboardWindow('/preload.js', null)

      setStealthMode(true)

      expect(app.dock!.hide).toHaveBeenCalled()
    })

    it('shows dock on macOS when stealth disabled', () => {
      createDashboardWindow('/preload.js', null)

      setStealthMode(false)

      expect(app.dock!.show).toHaveBeenCalled()
    })

    it('saves stealth setting', () => {
      setStealthMode(true)

      expect(mockSaveSetting).toHaveBeenCalledWith('stealthEnabled', true)
    })

    it('calls stealth tray callbacks when enabled', () => {
      const hideCb = vi.fn()
      const showCb = vi.fn()
      registerStealthTrayCallbacks(hideCb, showCb)

      setStealthMode(true)
      expect(hideCb).toHaveBeenCalled()

      setStealthMode(false)
      expect(showCb).toHaveBeenCalled()
    })
  })

  describe('registerStealthTrayCallbacks', () => {
    it('registers hide and show callbacks', () => {
      const hideCb = vi.fn()
      const showCb = vi.fn()

      registerStealthTrayCallbacks(hideCb, showCb)

      setStealthMode(true)
      expect(hideCb).toHaveBeenCalled()
    })
  })

  describe('setOverlayFocusable (issue A: overlay typing on Windows)', () => {
    it('makes the overlay focusable + focuses it on Windows when true', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.setFocusable.mockClear()
      mockBrowserWindowInstance.focus.mockClear()

      setOverlayFocusable(true)

      expect(mockBrowserWindowInstance.setFocusable).toHaveBeenCalledWith(true)
      expect(mockBrowserWindowInstance.focus).toHaveBeenCalled()
    })

    it('does NOT drop focusability when false (would re-break mouse forwarding after Ctrl+\\, issue D)', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.setFocusable.mockClear()
      mockBrowserWindowInstance.focus.mockClear()

      setOverlayFocusable(false)

      // focusable:false (WS_EX_NOACTIVATE) kills setIgnoreMouseEvents
      // forwarding across a hide -> re-show; the overlay must stay focusable.
      expect(mockBrowserWindowInstance.setFocusable).not.toHaveBeenCalled()
      expect(mockBrowserWindowInstance.focus).not.toHaveBeenCalled()
    })

    it('is a no-op on macOS (the panel overlay already accepts text input)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.setFocusable.mockClear()

      setOverlayFocusable(true)

      expect(mockBrowserWindowInstance.setFocusable).not.toHaveBeenCalled()
    })
  })

  describe('createOverlayWindow focusable model (issue D)', () => {
    it('creates the Windows overlay focusable so mouse forwarding survives hide/show', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      vi.mocked(BrowserWindow).mockClear()
      createOverlayWindow('/preload.js', null)
      const opts = vi.mocked(BrowserWindow).mock.calls.at(-1)?.[0] as Record<string, unknown>
      // focusable:false (WS_EX_NOACTIVATE) is what killed setIgnoreMouseEvents
      // forwarding after Ctrl+\. Must NOT be false (defaults to focusable).
      expect(opts.focusable).not.toBe(false)
    })

    it('keeps the macOS overlay a non-activating panel (unchanged)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      vi.mocked(BrowserWindow).mockClear()
      createOverlayWindow('/preload.js', null)
      const opts = vi.mocked(BrowserWindow).mock.calls.at(-1)?.[0] as Record<string, unknown>
      expect(opts.type).toBe('panel')
      expect(opts.focusable).toBeUndefined()
    })
  })

  describe('showOverlayWindow (issue D: re-arm mouse forwarding on Windows)', () => {
    it('re-arms forwarding via setIgnoreMouseEvents + showInactive on Windows (not show/focus)', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.setIgnoreMouseEvents.mockClear()
      mockBrowserWindowInstance.showInactive.mockClear()
      mockBrowserWindowInstance.show.mockClear()
      mockBrowserWindowInstance.focus.mockClear()

      showOverlayWindow()

      expect(mockBrowserWindowInstance.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
      expect(mockBrowserWindowInstance.showInactive).toHaveBeenCalled()
      // show()+focus() is exactly what drops the forwarding hook on Windows.
      expect(mockBrowserWindowInstance.show).not.toHaveBeenCalled()
      expect(mockBrowserWindowInstance.focus).not.toHaveBeenCalled()
    })

    it('uses show()+focus() on macOS (no forwarding bug; panel needs activation)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      createOverlayWindow('/preload.js', null)
      mockBrowserWindowInstance.showInactive.mockClear()
      mockBrowserWindowInstance.show.mockClear()
      mockBrowserWindowInstance.focus.mockClear()

      showOverlayWindow()

      expect(mockBrowserWindowInstance.show).toHaveBeenCalled()
      expect(mockBrowserWindowInstance.focus).toHaveBeenCalled()
      expect(mockBrowserWindowInstance.showInactive).not.toHaveBeenCalled()
    })
  })

  describe('overlay re-show re-arms mouse passthrough (issue D)', () => {
    it("suppresses 'overlay:shown' on the first show but fires it on re-show", () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      createOverlayWindow('/preload.js', null)
      setOverlayEnabled(true)
      const showHandler = mockBrowserWindowInstance.on.mock.calls.find(
        (c: unknown[]) => c[0] === 'show',
      )?.[1] as () => void
      expect(showHandler).toBeDefined()
      mockBrowserWindowInstance.webContents.send.mockClear()

      // First (boot) show: must NOT re-arm, so it can't capture background
      // clicks before the user interacts.
      showHandler()
      const firstShowReArmed = mockBrowserWindowInstance.webContents.send.mock.calls.some(
        (c: unknown[]) => c[0] === 'overlay:shown',
      )
      expect(firstShowReArmed).toBe(false)

      // Re-show (e.g. after Ctrl+\): re-arm the renderer's passthrough.
      showHandler()
      expect(mockBrowserWindowInstance.webContents.send).toHaveBeenCalledWith('overlay:shown')
    })
  })
})
