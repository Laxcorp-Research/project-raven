import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockTrayInstance, mockCreateFromPath } = vi.hoisted(() => ({
  mockTrayInstance: {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    setImage: vi.fn(),
    destroy: vi.fn(),
  },
  mockCreateFromPath: vi.fn(() => ({ isEmpty: () => false })),
}))

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
  getDashboardWindow: vi.fn(() => null),
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
import { Tray, nativeImage } from 'electron'

describe('trayManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateFromPath.mockReturnValue({ isEmpty: () => false })
    destroyTray()
  })

  describe('createTray', () => {
    it('creates a tray icon', () => {
      createTray()

      expect(Tray).toHaveBeenCalledOnce()
      expect(mockTrayInstance.setToolTip).toHaveBeenCalledWith('Raven')
      expect(mockTrayInstance.setContextMenu).toHaveBeenCalled()
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
