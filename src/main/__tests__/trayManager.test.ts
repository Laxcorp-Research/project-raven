import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockTrayInstance, mockCreateFromPath, mockDashboardWindow, mockGetDashboardWindow } = vi.hoisted(() => {
  const dashboard = {
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    webContents: { send: vi.fn() },
  }
  return {
    mockTrayInstance: {
      setToolTip: vi.fn(),
      setContextMenu: vi.fn(),
      setImage: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
    },
    mockCreateFromPath: vi.fn(() => ({ isEmpty: () => false })),
    mockDashboardWindow: dashboard,
    mockGetDashboardWindow: vi.fn(() => dashboard),
  }
})

vi.mock('electron', () => ({
  Tray: vi.fn(function () { return mockTrayInstance }),
  Menu: {
    buildFromTemplate: vi.fn(() => ({})),
  },
  nativeImage: {
    createFromPath: mockCreateFromPath,
    createEmpty: vi.fn(() => ({ isEmpty: () => true })),
  },
  app: {
    isPackaged: false,
    quit: vi.fn(),
  },
}))

vi.mock('../windowManager', () => ({
  getDashboardWindow: mockGetDashboardWindow,
  getOverlayWindow: vi.fn(() => null),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { createTray, updateTrayRecordingState, setTrayVisibility, setTrayOnboarding, destroyTray } from '../trayManager'
import { Tray, nativeImage, app } from 'electron'
import { join } from 'path'

describe('trayManager', () => {
  const originalPlatform = process.platform

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateFromPath.mockReturnValue({ isEmpty: () => false })
    mockGetDashboardWindow.mockReturnValue(mockDashboardWindow)
    mockDashboardWindow.isDestroyed.mockReturnValue(false)
    mockDashboardWindow.isMinimized.mockReturnValue(false)
    destroyTray()
  })

  afterEach(() => {
    setPlatform(originalPlatform)
    app.isPackaged = false
  })

  describe('createTray', () => {
    it('creates a tray icon', () => {
      createTray()

      expect(Tray).toHaveBeenCalledOnce()
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('Raven')
      expect(mockTrayInstance.setContextMenu).toHaveBeenCalled()
    })

    it('loads packaged tray icons from process.resourcesPath/tray', () => {
      app.isPackaged = true
      Object.defineProperty(process, 'resourcesPath', {
        value: '/Fake.app/Contents/Resources',
        configurable: true,
      })

      createTray()

      expect(mockCreateFromPath).toHaveBeenCalledWith(
        join('/Fake.app/Contents/Resources', 'tray', 'iconTemplate.png'),
      )
      app.isPackaged = false
    })

    it('does not create duplicate tray', () => {
      createTray()
      createTray()

      expect(Tray).toHaveBeenCalledOnce()
    })

    it('creates tray with empty icon when icon not found', () => {
      mockCreateFromPath.mockReturnValue({ isEmpty: () => true })

      createTray()

      expect(nativeImage.createEmpty).toHaveBeenCalled()
    })

    it('binds a left-click handler that re-shows the dashboard on Windows', () => {
      // Regression: on Windows the dashboard is hidden (not destroyed) on
      // close, and setContextMenu only binds the RIGHT-click menu. Without
      // a left-click handler the user has no way to bring a closed window
      // back from the tray icon.
      setPlatform('win32')

      createTray()

      const clickHandler = mockTrayInstance.on.mock.calls.find((c) => c[0] === 'click')?.[1] as
        | (() => void)
        | undefined
      expect(clickHandler).toBeDefined()

      clickHandler!()
      expect(mockDashboardWindow.show).toHaveBeenCalled()
      expect(mockDashboardWindow.focus).toHaveBeenCalled()
    })

    it('does not bind a left-click handler on macOS (left-click opens the menu by convention)', () => {
      setPlatform('darwin')

      createTray()

      const clickHandler = mockTrayInstance.on.mock.calls.find((c) => c[0] === 'click')
      expect(clickHandler).toBeUndefined()
    })

    it('left-click restores a minimized dashboard before showing it', () => {
      setPlatform('win32')
      mockDashboardWindow.isMinimized.mockReturnValue(true)

      createTray()

      const clickHandler = mockTrayInstance.on.mock.calls.find((c) => c[0] === 'click')?.[1] as
        | (() => void)
        | undefined
      clickHandler!()

      expect(mockDashboardWindow.restore).toHaveBeenCalled()
      expect(mockDashboardWindow.show).toHaveBeenCalled()
    })
  })

  describe('updateTrayRecordingState', () => {
    it('does nothing when tray not created', () => {
      updateTrayRecordingState(true)

      expect(mockTrayInstance.setImage).not.toHaveBeenCalled()
    })

    it('updates icon and tooltip when recording starts', () => {
      createTray()
      mockTrayInstance.setImage.mockClear()
      mockTrayInstance.setToolTip.mockClear()
      mockTrayInstance.setContextMenu.mockClear()
      mockCreateFromPath.mockReturnValue({ isEmpty: () => false })

      updateTrayRecordingState(true)

      expect(mockTrayInstance.setImage).toHaveBeenCalled()
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('Raven (Recording)')
      expect(mockTrayInstance.setContextMenu).toHaveBeenCalled()
    })

    it('updates icon and tooltip when recording stops', () => {
      createTray()
      mockTrayInstance.setToolTip.mockClear()
      mockCreateFromPath.mockReturnValue({ isEmpty: () => false })

      updateTrayRecordingState(false)

      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('Raven')
    })

    it('handles error when icon not found during update', () => {
      createTray()
      mockTrayInstance.setImage.mockClear()
      mockCreateFromPath.mockReturnValue({ isEmpty: () => true })

      updateTrayRecordingState(true)

      expect(mockTrayInstance.setImage).not.toHaveBeenCalled()
    })
  })

  describe('setTrayVisibility', () => {
    it('does nothing when tray not created', () => {
      setTrayVisibility(false)
    })

    it('destroys tray when set to invisible', () => {
      createTray()
      mockTrayInstance.destroy.mockClear()

      setTrayVisibility(false)

      expect(mockTrayInstance.destroy).toHaveBeenCalled()
    })

    it('does nothing when set to visible', () => {
      createTray()
      mockTrayInstance.destroy.mockClear()

      setTrayVisibility(true)

      expect(mockTrayInstance.destroy).not.toHaveBeenCalled()
    })
  })

  describe('setTrayOnboarding', () => {
    it('updates context menu when tray exists', () => {
      createTray()
      mockTrayInstance.setContextMenu.mockClear()

      setTrayOnboarding(true)

      expect(mockTrayInstance.setContextMenu).toHaveBeenCalled()
    })

    it('does nothing when tray does not exist', () => {
      setTrayOnboarding(true)

      expect(mockTrayInstance.setContextMenu).not.toHaveBeenCalled()
    })
  })

  describe('destroyTray', () => {
    it('destroys existing tray', () => {
      createTray()
      mockTrayInstance.destroy.mockClear()

      destroyTray()

      expect(mockTrayInstance.destroy).toHaveBeenCalled()
    })

    it('does nothing when no tray', () => {
      destroyTray()

      expect(mockTrayInstance.destroy).not.toHaveBeenCalled()
    })
  })
})
