import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const {
  mockIpcHandlers,
  mockGetMediaAccessStatus,
  mockIsTrustedAccessibilityClient,
  mockAskForMediaAccess,
  mockOpenExternal,
} = vi.hoisted(() => ({
  mockIpcHandlers: {} as Record<string, (...args: unknown[]) => unknown>,
  mockGetMediaAccessStatus: vi.fn(),
  mockIsTrustedAccessibilityClient: vi.fn(),
  mockAskForMediaAccess: vi.fn(),
  mockOpenExternal: vi.fn(),
}))

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: mockGetMediaAccessStatus,
    isTrustedAccessibilityClient: mockIsTrustedAccessibilityClient,
    askForMediaAccess: mockAskForMediaAccess,
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockIpcHandlers[channel] = handler
    }),
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

import {
  getPermissionStatus,
  requestAccessibilityAccess,
  requestMicrophoneAccess,
  checkPermissionsForRecording,
  openScreenRecordingPreferences,
  openMicrophonePreferences,
  openAccessibilityPreferences,
  registerPermissionHandlers,
} from '../permissions'

describe('permissions', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockIpcHandlers).forEach((k) => delete mockIpcHandlers[k])
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  describe('getPermissionStatus', () => {
    it('returns actual status on macOS', () => {
      mockGetMediaAccessStatus.mockImplementation((type: string) => {
        if (type === 'microphone') return 'granted'
        if (type === 'screen') return 'denied'
        return 'unknown'
      })
      mockIsTrustedAccessibilityClient.mockReturnValue(true)

      const status = getPermissionStatus()

      expect(status.microphone).toBe('granted')
      expect(status.screen).toBe('denied')
      expect(status.accessibility).toBe('granted')
    })

    it('reports denied accessibility when not trusted', () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')
      mockIsTrustedAccessibilityClient.mockReturnValue(false)

      const status = getPermissionStatus()

      expect(status.accessibility).toBe('denied')
    })
  })

  describe('requestAccessibilityAccess', () => {
    it('calls isTrustedAccessibilityClient with prompt on macOS', () => {
      mockIsTrustedAccessibilityClient.mockReturnValue(true)

      const result = requestAccessibilityAccess()

      expect(result).toBe(true)
      expect(mockIsTrustedAccessibilityClient).toHaveBeenCalledWith(true)
    })

    it('returns false when not granted', () => {
      mockIsTrustedAccessibilityClient.mockReturnValue(false)

      expect(requestAccessibilityAccess()).toBe(false)
    })
  })

  describe('requestMicrophoneAccess', () => {
    it('returns true when already granted', async () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')

      const result = await requestMicrophoneAccess()

      expect(result).toBe(true)
      expect(mockAskForMediaAccess).not.toHaveBeenCalled()
    })

    it('asks for access when not granted', async () => {
      mockGetMediaAccessStatus.mockReturnValue('not-determined')
      mockAskForMediaAccess.mockResolvedValue(true)

      const result = await requestMicrophoneAccess()

      expect(result).toBe(true)
      expect(mockAskForMediaAccess).toHaveBeenCalledWith('microphone')
    })

    it('returns false when access denied', async () => {
      mockGetMediaAccessStatus.mockReturnValue('denied')
      mockAskForMediaAccess.mockResolvedValue(false)

      const result = await requestMicrophoneAccess()

      expect(result).toBe(false)
    })
  })

  describe('checkPermissionsForRecording', () => {
    it('returns ok when all permissions granted', () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')
      mockIsTrustedAccessibilityClient.mockReturnValue(true)

      const result = checkPermissionsForRecording()

      expect(result.ok).toBe(true)
      expect(result.missing).toEqual([])
    })

    it('reports missing microphone', () => {
      mockGetMediaAccessStatus.mockImplementation((type: string) => {
        if (type === 'microphone') return 'denied'
        return 'granted'
      })
      mockIsTrustedAccessibilityClient.mockReturnValue(true)

      const result = checkPermissionsForRecording()

      expect(result.ok).toBe(false)
      expect(result.missing).toContain('microphone')
    })

    it('reports missing screen', () => {
      mockGetMediaAccessStatus.mockImplementation((type: string) => {
        if (type === 'screen') return 'denied'
        return 'granted'
      })
      mockIsTrustedAccessibilityClient.mockReturnValue(true)

      const result = checkPermissionsForRecording()

      expect(result.ok).toBe(false)
      expect(result.missing).toContain('screen')
    })

    it('reports both missing', () => {
      mockGetMediaAccessStatus.mockReturnValue('denied')
      mockIsTrustedAccessibilityClient.mockReturnValue(true)

      const result = checkPermissionsForRecording()

      expect(result.ok).toBe(false)
      expect(result.missing).toContain('microphone')
      expect(result.missing).toContain('screen')
    })
  })

  describe('openScreenRecordingPreferences', () => {
    it('opens system preferences on macOS', () => {
      openScreenRecordingPreferences()

      expect(mockOpenExternal).toHaveBeenCalledWith(
        expect.stringContaining('Privacy_ScreenCapture'),
      )
    })

  })

  describe('openMicrophonePreferences', () => {
    it('opens system preferences on macOS', () => {
      openMicrophonePreferences()

      expect(mockOpenExternal).toHaveBeenCalledWith(
        expect.stringContaining('Privacy_Microphone'),
      )
    })
  })

  describe('openAccessibilityPreferences', () => {
    it('opens system preferences on macOS', () => {
      openAccessibilityPreferences()

      expect(mockOpenExternal).toHaveBeenCalledWith(
        expect.stringContaining('Privacy_Accessibility'),
      )
    })
  })

  describe('registerPermissionHandlers', () => {
    it('registers all IPC handlers', () => {
      registerPermissionHandlers()

      expect(mockIpcHandlers['permissions:get-status']).toBeDefined()
      expect(mockIpcHandlers['permissions:request-microphone']).toBeDefined()
      expect(mockIpcHandlers['permissions:open-screen-recording']).toBeDefined()
      expect(mockIpcHandlers['permissions:open-microphone']).toBeDefined()
      expect(mockIpcHandlers['permissions:request-accessibility']).toBeDefined()
      expect(mockIpcHandlers['permissions:open-accessibility']).toBeDefined()
    })

    it('permissions:get-status returns permission status', async () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')
      mockIsTrustedAccessibilityClient.mockReturnValue(true)

      registerPermissionHandlers()
      const result = await mockIpcHandlers['permissions:get-status']()

      expect(result).toEqual({
        microphone: 'granted',
        screen: 'granted',
        accessibility: 'granted',
      })
    })

    it('permissions:request-microphone calls requestMicrophoneAccess', async () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')

      registerPermissionHandlers()
      const result = await mockIpcHandlers['permissions:request-microphone']()

      expect(result).toBe(true)
    })

    it('permissions:open-screen-recording opens preferences', async () => {
      registerPermissionHandlers()
      const result = await mockIpcHandlers['permissions:open-screen-recording']()

      expect(result).toBe(true)
      expect(mockOpenExternal).toHaveBeenCalled()
    })

    it('permissions:request-accessibility returns access status', async () => {
      mockIsTrustedAccessibilityClient.mockReturnValue(true)

      registerPermissionHandlers()
      const result = await mockIpcHandlers['permissions:request-accessibility']()

      expect(result).toBe(true)
    })

    it('permissions:open-accessibility opens preferences', async () => {
      registerPermissionHandlers()
      const result = await mockIpcHandlers['permissions:open-accessibility']()

      expect(result).toBe(true)
    })

    it('permissions:open-microphone opens preferences', async () => {
      registerPermissionHandlers()
      const result = await mockIpcHandlers['permissions:open-microphone']()

      expect(result).toBe(true)
    })
  })
})
