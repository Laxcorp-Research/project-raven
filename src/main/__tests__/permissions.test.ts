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
  permissionsAllowOverlay,
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

  describe('permissionsAllowOverlay', () => {
    const granted = {
      microphone: 'granted' as const,
      screen: 'granted' as const,
      accessibility: 'granted' as const,
    }

    it('is true on Windows even when macOS-only statuses are denied', () => {
      expect(
        permissionsAllowOverlay(
          { ...granted, screen: 'denied', accessibility: 'denied' },
          'win32',
        ),
      ).toBe(true)
    })

    it('is false on macOS when screen recording is denied', () => {
      expect(permissionsAllowOverlay({ ...granted, screen: 'denied' }, 'darwin')).toBe(false)
    })

    it('is false on macOS when accessibility is denied', () => {
      expect(permissionsAllowOverlay({ ...granted, accessibility: 'denied' }, 'darwin')).toBe(false)
    })

    it('is true on macOS only when mic, screen, and accessibility are granted', () => {
      expect(permissionsAllowOverlay(granted, 'darwin')).toBe(true)
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

  // -----------------------------------------------------------------
  // W10 — Windows microphone permission flow.
  //
  // Pre-2026-05-06 the entire non-darwin branch hardcoded
  // microphone='granted', requestMicrophoneAccess()=true, and
  // openMicrophonePreferences() silently no-op'd. So a Windows user
  // who had toggled OFF "Microphone access" in Settings ->
  // Privacy -> Microphone got:
  //   (a) checkPermissionsForRecording() reporting ok=true, so
  //   audioManager proceeded to open a stream that WASAPI
  //   immediately rejected, with no actionable error to the user.
  //   (b) clicking "Open Microphone Settings" in the Settings panel
  //   (renderer permissionsOpenMicrophone IPC -> main
  //   openMicrophonePreferences()) did literally nothing.
  //
  // The fix in src/main/permissions.ts gives Windows real behaviour:
  // getPermissionStatus reads the actual mic status, requestMicrophoneAccess
  // returns false when the OS reports 'denied' (so the audioManager
  // fail-fast surfaces the right error), and openMicrophonePreferences
  // launches ms-settings:privacy-microphone. These tests lock that in.
  // -----------------------------------------------------------------
  describe('W10 — Windows microphone permission flow', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    })

    it('getPermissionStatus reports the OS-reported microphone status (not hardcoded granted) on Windows', () => {
      mockGetMediaAccessStatus.mockImplementation((type: string) => {
        if (type === 'microphone') return 'denied'
        return 'granted'
      })

      const status = getPermissionStatus()

      // Pre-fix this returned 'granted' regardless. The test would
      // have asserted the wrong value.
      expect(status.microphone).toBe('denied')
      // Screen + accessibility are NOT gated on Windows the same way,
      // so they stay 'granted'.
      expect(status.screen).toBe('granted')
      expect(status.accessibility).toBe('granted')
    })

    it('getPermissionStatus reports granted when Windows mic permission is granted', () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')

      const status = getPermissionStatus()

      expect(status.microphone).toBe('granted')
      expect(status.screen).toBe('granted')
      expect(status.accessibility).toBe('granted')
    })

    it('requestMicrophoneAccess returns false when Windows reports denied (callers should surface the Settings deep-link)', async () => {
      mockGetMediaAccessStatus.mockReturnValue('denied')

      const result = await requestMicrophoneAccess()

      expect(result).toBe(false)
      // Critically: must NOT call askForMediaAccess on Windows,
      // since that API is macOS-only and would throw on Win32.
      expect(mockAskForMediaAccess).not.toHaveBeenCalled()
    })

    it('requestMicrophoneAccess returns true on Windows for not-determined (lets the OS prompt fire at first stream open via WASAPI)', async () => {
      mockGetMediaAccessStatus.mockReturnValue('not-determined')

      const result = await requestMicrophoneAccess()

      // Windows has no in-app prompt API; the OS pops its own
      // dialog when the audio stream is actually opened. Returning
      // true here lets audioManager proceed to that point.
      expect(result).toBe(true)
      expect(mockAskForMediaAccess).not.toHaveBeenCalled()
    })

    it('requestMicrophoneAccess returns true on Windows when already granted', async () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')

      const result = await requestMicrophoneAccess()

      expect(result).toBe(true)
      expect(mockAskForMediaAccess).not.toHaveBeenCalled()
    })

    it('checkPermissionsForRecording on Windows reports missing mic when denied (so audioManager can short-circuit)', () => {
      mockGetMediaAccessStatus.mockImplementation((type: string) => {
        if (type === 'microphone') return 'denied'
        return 'granted'
      })

      const result = checkPermissionsForRecording()

      // Pre-fix this returned ok=true on Windows, audioManager
      // proceeded, WASAPI failed, user saw a vague error.
      expect(result.ok).toBe(false)
      expect(result.missing).toContain('microphone')
      // Screen is hardcoded granted on Windows so it should NOT be missing.
      expect(result.missing).not.toContain('screen')
    })

    it('openMicrophonePreferences launches ms-settings:privacy-microphone on Windows (no longer a silent no-op)', () => {
      openMicrophonePreferences()

      expect(mockOpenExternal).toHaveBeenCalledWith('ms-settings:privacy-microphone')
    })

    it('openScreenRecordingPreferences is a no-op on Windows (no equivalent OS gating)', () => {
      openScreenRecordingPreferences()

      // Confirms the macOS-only branch stays macOS-only - we do NOT
      // want to launch some unrelated ms-settings: page when Windows
      // doesn't gate screen capture this way.
      expect(mockOpenExternal).not.toHaveBeenCalled()
    })

    it('openAccessibilityPreferences is a no-op on Windows (no equivalent OS gating)', () => {
      openAccessibilityPreferences()

      expect(mockOpenExternal).not.toHaveBeenCalled()
    })
  })
})
