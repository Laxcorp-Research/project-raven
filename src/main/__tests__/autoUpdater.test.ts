import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockIpcHandlers, updaterListeners, mockAutoUpdater, mockApp, mockOpenExternal, mockFetchMacFeedVersion } = vi.hoisted(() => {
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
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
  }
  const mockApp = { isPackaged: true, getVersion: vi.fn(() => '2.3.9') }
  const mockOpenExternal = vi.fn().mockResolvedValue(undefined)
  const mockFetchMacFeedVersion = vi.fn().mockResolvedValue(null)
  return {
    mockIpcHandlers,
    updaterListeners,
    mockAutoUpdater,
    mockApp,
    mockOpenExternal,
    mockFetchMacFeedVersion,
  }
})

vi.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater,
}))

vi.mock('electron', () => ({
  app: mockApp,
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      if (mockIpcHandlers[channel]) {
        throw new Error(`Attempted to register a second handler for '${channel}'`)
      }
      mockIpcHandlers[channel] = handler
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  shell: {
    openExternal: mockOpenExternal,
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

vi.mock('../macManualUpdate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../macManualUpdate')>()
  return {
    ...actual,
    fetchMacFeedVersion: mockFetchMacFeedVersion,
  }
})

import { initAutoUpdater, stopAutoUpdater, shouldRunElectronUpdater, _resetForTesting } from '../autoUpdater'
import { BrowserWindow } from 'electron'

describe('autoUpdater', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    Object.keys(mockIpcHandlers).forEach((k) => delete mockIpcHandlers[k])
    Object.keys(updaterListeners).forEach((k) => delete updaterListeners[k])
    mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined)
    mockFetchMacFeedVersion.mockResolvedValue(null)
    mockOpenExternal.mockResolvedValue(undefined)
    mockApp.isPackaged = true
    mockApp.getVersion.mockReturnValue('2.3.9')
    // Packaged tests exercise the Windows updater path. On a Mac host
    // process.platform is darwin and would skip checks after the OSS
    // ShipIt signature fix.
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    _resetForTesting()
  })

  afterEach(() => {
    stopAutoUpdater()
    _resetForTesting()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('initAutoUpdater', () => {
    it('configures auto-updater settings', () => {
      initAutoUpdater()

      expect(mockAutoUpdater.autoDownload).toBe(false)
      expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false)
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

    it('does not throw if boot() / activate calls initAutoUpdater twice', () => {
      initAutoUpdater()
      expect(() => initAutoUpdater()).not.toThrow()
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
      vi.advanceTimersByTime(10_000)
      expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledOnce()
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

      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', {
        status: 'available',
        version: '2.0.0',
        install: 'auto',
      })
    })

    it('update-not-available broadcasts transient up-to-date then decays to idle', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['update-not-available']()

      // Immediate: transient 'up-to-date' so UI can acknowledge the check ran.
      expect(mockWin.webContents.send).toHaveBeenCalledWith(
        'update:state-changed',
        { status: 'up-to-date' },
      )

      // After the decay window, state drops back to idle.
      vi.advanceTimersByTime(3500)
      expect(mockWin.webContents.send).toHaveBeenCalledWith(
        'update:state-changed',
        { status: 'idle' },
      )
    })

    it('update-not-available decay is cancelled by a newer event', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['update-not-available']()

      // Before decay fires, a new event supersedes the transient state.
      updaterListeners['update-available']({ version: '9.9.9' })
      vi.advanceTimersByTime(3500)

      const sends = mockWin.webContents.send.mock.calls
        .filter((c: unknown[]) => c[0] === 'update:state-changed')
        .map((c: unknown[]) => c[1])

      // Should have gone up-to-date → available, and NOT idle afterwards.
      expect(sends).toEqual(
        expect.arrayContaining([
          { status: 'up-to-date' },
          { status: 'available', version: '9.9.9', install: 'auto' },
        ]),
      )
      expect(sends).not.toContainEqual({ status: 'idle' })
    })

    it('download-progress broadcasts downloading', () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      updaterListeners['update-available']({ version: '2.0.0' })
      updaterListeners['download-progress']({ percent: 45.6, bytesPerSecond: 1000000, transferred: 100000, total: 220000 })

      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', expect.objectContaining({ status: 'downloading', progress: 46 }))
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

    it('update:download calls downloadUpdate', async () => {
      initAutoUpdater()

      const result = await mockIpcHandlers['update:download']()
      expect(result).toEqual({ success: true })
      expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled()
    })

    it('update:download returns error on failure', async () => {
      mockAutoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('network'))
      initAutoUpdater()

      const result = await mockIpcHandlers['update:download']()
      expect(result).toEqual({ success: false, error: expect.stringContaining('network') })
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

  describe('unpackaged (dev) build', () => {
    beforeEach(() => {
      mockApp.isPackaged = false
    })

    it('does not schedule initial or periodic checks', () => {
      initAutoUpdater()

      vi.advanceTimersByTime(10_000)
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()

      vi.advanceTimersByTime(60 * 60 * 1000)
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    })

    it('update:check returns idle + broadcasts without invoking electron-updater', async () => {
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      const result = await mockIpcHandlers['update:check']()

      expect(result).toEqual({ success: true, skipped: 'dev' })
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
      expect(mockWin.webContents.send).toHaveBeenCalledWith(
        'update:state-changed',
        { status: 'idle' },
      )
    })

    it('update:download returns a disabled error without invoking electron-updater', async () => {
      initAutoUpdater()
      const result = await mockIpcHandlers['update:download']()

      expect(result).toEqual({
        success: false,
        error: 'Updates disabled in development',
      })
      expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
    })

    it('still registers all IPC handlers', () => {
      initAutoUpdater()

      expect(mockIpcHandlers['update:check']).toBeDefined()
      expect(mockIpcHandlers['update:download']).toBeDefined()
      expect(mockIpcHandlers['update:install']).toBeDefined()
      expect(mockIpcHandlers['update:get-state']).toBeDefined()
    })
  })

  describe('packaged macOS (unsigned OSS)', () => {
    beforeEach(() => {
      mockApp.isPackaged = true
      vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
      _resetForTesting()
    })

    it('does not schedule ShipIt checks', async () => {
      initAutoUpdater()
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
      vi.advanceTimersByTime(60 * 60 * 1000)
      await Promise.resolve()
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    })

    it('after 10s, a newer GitHub feed broadcasts the Mac DMG prompt and never calls ShipIt', async () => {
      mockFetchMacFeedVersion.mockResolvedValue('2.4.0')
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()

      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
      expect(mockWin.webContents.send).toHaveBeenCalledWith('update:state-changed', {
        status: 'available',
        version: '2.4.0',
        install: 'mac-dmg',
        dmgUrl: 'https://github.com/Laxcorp-Research/project-raven/releases/download/v2.4.0/Raven-Mac-2.4.0-Installer.dmg',
        forcePrompt: false,
      })
    })

    it('scheduled feed failures stay silent (no error banner state)', async () => {
      mockFetchMacFeedVersion.mockRejectedValue(new Error('net::ERR_INTERNET_DISCONNECTED'))
      const mockWin = { isDestroyed: () => false, webContents: { send: vi.fn() } }
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

      initAutoUpdater()
      vi.advanceTimersByTime(10_000)
      await Promise.resolve()

      expect(mockWin.webContents.send).not.toHaveBeenCalled()
      expect(mockIpcHandlers['update:get-state']()).toEqual({ status: 'idle' })
    })

    it('update:check uses the GitHub feed, not electron-updater', async () => {
      mockFetchMacFeedVersion.mockResolvedValue('2.4.0')
      initAutoUpdater()
      const result = await mockIpcHandlers['update:check']()
      expect(result).toEqual({ success: true })
      expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
      expect(mockIpcHandlers['update:get-state']()).toEqual({
        status: 'available',
        version: '2.4.0',
        install: 'mac-dmg',
        dmgUrl: 'https://github.com/Laxcorp-Research/project-raven/releases/download/v2.4.0/Raven-Mac-2.4.0-Installer.dmg',
        forcePrompt: true,
      })
    })

    it('update:download opens the GitHub DMG and never calls ShipIt', async () => {
      mockFetchMacFeedVersion.mockResolvedValue('2.4.0')
      initAutoUpdater()
      await mockIpcHandlers['update:check']()
      const result = await mockIpcHandlers['update:download']()
      expect(result).toEqual({ success: true })
      expect(mockOpenExternal).toHaveBeenCalledWith(
        'https://github.com/Laxcorp-Research/project-raven/releases/download/v2.4.0/Raven-Mac-2.4.0-Installer.dmg',
      )
      expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
    })

    it('update:download without a detected update does not open a URL', async () => {
      initAutoUpdater()
      const result = await mockIpcHandlers['update:download']()
      expect(result).toEqual({
        success: false,
        error: 'No Mac installer is ready. Check for updates first.',
      })
      expect(mockOpenExternal).not.toHaveBeenCalled()
      expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
    })
  })
})

describe('shouldRunElectronUpdater', () => {
  it('skips unpackaged and packaged Mac; allows packaged Windows and Linux', () => {
    expect(shouldRunElectronUpdater({ packaged: false, platform: 'darwin' })).toBe(false)
    expect(shouldRunElectronUpdater({ packaged: false, platform: 'win32' })).toBe(false)
    expect(shouldRunElectronUpdater({ packaged: true, platform: 'darwin' })).toBe(false)
    expect(shouldRunElectronUpdater({ packaged: true, platform: 'win32' })).toBe(true)
    expect(shouldRunElectronUpdater({ packaged: true, platform: 'linux' })).toBe(true)
  })
})
