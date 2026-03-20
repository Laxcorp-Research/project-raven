import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockIpcHandlers, updaterListeners, mockAutoUpdater } = vi.hoisted(() => {
  const mockIpcHandlers: Record<string, (...args: unknown[]) => unknown> = {}
  const updaterListeners: Record<string, (...args: unknown[]) => void> = {}
  const mockAutoUpdater = {
    logger: null as unknown,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      updaterListeners[event] = handler
    }),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
  }
  return { mockIpcHandlers, updaterListeners, mockAutoUpdater }
})

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockIpcHandlers[channel] = handler
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { initAutoUpdater, stopAutoUpdater } from '../autoUpdater'
import { BrowserWindow } from 'electron'

describe('autoUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    Object.keys(mockIpcHandlers).forEach((k) => delete mockIpcHandlers[k])
    Object.keys(updaterListeners).forEach((k) => delete updaterListeners[k])
    mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined)
  })

  afterEach(() => {
    stopAutoUpdater()
    vi.useRealTimers()
  })

  describe('initAutoUpdater', () => {
    it('configures auto-updater settings', () => {
      initAutoUpdater()

      expect(mockAutoUpdater.autoDownload).toBe(true)
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true)
      expect(mockAutoUpdater.logger).toBeNull()
    })

    it('registers event listeners', () => {
      initAutoUpdater()

      expect(updaterListeners['checking-for-update']).toBeDefined()
      expect(updaterListeners['update-available']).toBeDefined()
      expect(updaterListeners['update-not-available']).toBeDefined()
      expect(updaterListeners['download-progress']).toBeDefined()
      expect(updaterListeners['update-downloaded']).toBeDefined()
      expect(updaterListeners['error']).toBeDefined()
    })

    it('registers IPC handlers', () => {
      initAutoUpdater()

      expect(mockIpcHandlers['update:check']).toBeDefined()
      expect(mockIpcHandlers['update:install']).toBeDefined()
      expect(mockIpcHandlers['update:get-state']).toBeDefined()
    })

    it('performs initial check after 10s', () => {
      initAutoUpdater()

      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
      vi.advanceTimersByTime(10_000)
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce()
    })

    it('performs periodic checks every hour', () => {
      initAutoUpdater()

      vi.advanceTimersByTime(10_000)
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(60 * 60 * 1000)
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(2)
    })
  })

  describe('event handlers', () => {
    it('checking-for-update broadcasts state', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['checking-for-update']()

      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', { status: 'checking' })
    })

    it('update-available broadcasts version', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['update-available']({ version: '2.0.0' })

      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', { status: 'available', version: '2.0.0' })
    })

    it('update-not-available resets to idle', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['update-not-available']()

      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', { status: 'idle' })
    })

    it('download-progress broadcasts downloading', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['update-available']({ version: '2.0.0' })
      updaterListeners['download-progress']()

      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', expect.objectContaining({ status: 'downloading' }))
    })

    it('update-downloaded broadcasts downloaded', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['update-downloaded']({ version: '2.0.0' })

      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', { status: 'downloaded', version: '2.0.0' })
    })

    it('error broadcasts error state', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['error'](new Error('Network failed'))

      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', { status: 'error', error: 'Network failed' })
    })

    it('skips destroyed windows during broadcast', () => {
      const destroyedWin = { isDestroyed: () => true, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([destroyedWin as any])

      initAutoUpdater()
      updaterListeners['checking-for-update']()

      expect(destroyedWin.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('IPC handlers', () => {
    it('update:check calls checkForUpdates', async () => {
      initAutoUpdater()

      const result = await mockIpcHandlers['update:check']()
      expect(result).toEqual({ success: true })
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled()
    })

    it('update:check returns error on failure', async () => {
      mockAutoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('fail'))
      initAutoUpdater()

      const result = await mockIpcHandlers['update:check']()
      expect(result).toEqual({ success: false, error: expect.stringContaining('fail') })
    })

    it('update:install quits and installs when downloaded', async () => {
      initAutoUpdater()
      updaterListeners['update-downloaded']({ version: '2.0.0' })

      const result = mockIpcHandlers['update:install']()
      expect(result).toEqual({ success: true })
      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
    })

    it('update:install does nothing when not downloaded', () => {
      initAutoUpdater()
      updaterListeners['update-not-available']()

      const result = mockIpcHandlers['update:install']()
      expect(result).toEqual({ success: false })
      expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled()
    })

    it('update:get-state returns current state', () => {
      initAutoUpdater()
      updaterListeners['checking-for-update']()

      const result = mockIpcHandlers['update:get-state']()
      expect(result).toEqual({ status: 'checking' })
    })
  })

  describe('stopAutoUpdater', () => {
    it('clears periodic check interval', () => {
      initAutoUpdater()

      vi.advanceTimersByTime(10_000)
      const afterInitialCheck = mockAutoUpdater.checkForUpdates.mock.calls.length

      stopAutoUpdater()

      vi.advanceTimersByTime(2 * 60 * 60 * 1000)
      expect(mockAutoUpdater.checkForUpdates.mock.calls.length).toBe(afterInitialCheck)
    })
  })
})
