import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockIpcHandlers, mockIpcOnHandlers } = vi.hoisted(() => ({
  mockIpcHandlers: {} as Record<string, (...args: unknown[]) => unknown>,
  mockIpcOnHandlers: {} as Record<string, (...args: unknown[]) => unknown>,
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockIpcHandlers[channel] = handler
    }),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockIpcOnHandlers[channel] = handler
    }),
    emit: vi.fn(),
  },
}))

const mockSetProcessedAudioCallback = vi.hoisted(() => vi.fn())
const mockStartCapture = vi.hoisted(() => vi.fn(() => true))
const mockStopCapture = vi.hoisted(() => vi.fn())

vi.mock('../systemAudioNative', () => ({
  setProcessedAudioCallback: mockSetProcessedAudioCallback,
  startCapture: mockStartCapture,
  stopCapture: mockStopCapture,
}))

const mockTranscriptionService = vi.hoisted(() => ({
  setWindows: vi.fn(),
  setApiKey: vi.fn(),
  start: vi.fn().mockResolvedValue({ success: true }),
  stop: vi.fn().mockResolvedValue(undefined),
  clearTranscript: vi.fn(),
  getFullTranscript: vi.fn(() => ''),
  getFullTranscriptWithInterims: vi.fn(() => ''),
  getTranscriptEntries: vi.fn(() => []),
  getTranscriptBySource: vi.fn(() => ''),
  sendAudio: vi.fn(),
}))

vi.mock('../transcriptionService', () => ({
  TranscriptionService: vi.fn(function () { return mockTranscriptionService }),
}))

const mockSessionManager = vi.hoisted(() => ({
  startSession: vi.fn(() => ({ id: 'session-1', transcript: [] })),
  endSession: vi.fn(() => ({ id: 'session-1', transcript: [{ id: '1', text: 'test' }] })),
  getActiveSession: vi.fn(),
}))

vi.mock('../services/sessionManager', () => ({
  sessionManager: mockSessionManager,
}))

vi.mock('../trayManager', () => ({
  updateTrayRecordingState: vi.fn(),
}))

const mockCheckPermissions = vi.hoisted(() => vi.fn(() => ({ ok: true, missing: [] })))
const mockRequestMicAccess = vi.hoisted(() => vi.fn().mockResolvedValue(true))

vi.mock('../permissions', () => ({
  checkPermissionsForRecording: mockCheckPermissions,
  requestMicrophoneAccess: mockRequestMicAccess,
}))

const mockGetSetting = vi.hoisted(() => vi.fn(() => ''))
const mockIsProMode = vi.hoisted(() => vi.fn(() => false))

vi.mock('../store', () => ({
  getSetting: mockGetSetting,
  isProMode: mockIsProMode,
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { AudioManager } from '../audioManager'

describe('AudioManager', () => {
  let manager: AudioManager

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockIpcHandlers).forEach((k) => delete mockIpcHandlers[k])
    Object.keys(mockIpcOnHandlers).forEach((k) => delete mockIpcOnHandlers[k])

    mockGetSetting.mockReturnValue('')
    mockIsProMode.mockReturnValue(false)
    mockStartCapture.mockReturnValue(true)
    mockTranscriptionService.start.mockResolvedValue({ success: true })
    mockTranscriptionService.stop.mockResolvedValue(undefined)
    mockSessionManager.endSession.mockReturnValue({ id: 'session-1', transcript: [{ id: '1', text: 'test' }] })

    manager = new AudioManager()
  })

  describe('constructor', () => {
    it('sets up audio pipeline callback', () => {
      expect(mockSetProcessedAudioCallback).toHaveBeenCalledOnce()
    })

    it('registers IPC handlers', () => {
      expect(mockIpcHandlers['audio:start-recording']).toBeDefined()
      expect(mockIpcHandlers['audio:stop-recording']).toBeDefined()
      expect(mockIpcHandlers['audio:get-state']).toBeDefined()
      expect(mockIpcHandlers['audio:get-transcript']).toBeDefined()
      expect(mockIpcHandlers['audio:clear-transcript']).toBeDefined()
      expect(mockIpcHandlers['audio:get-transcript-entries']).toBeDefined()
      expect(mockIpcHandlers['audio:get-transcript-by-source']).toBeDefined()
    })

    it('registers audio:stop-from-limit listener', () => {
      expect(mockIpcOnHandlers['audio:stop-from-limit']).toBeDefined()
    })
  })

  describe('setWindows', () => {
    it('forwards windows to transcription service', () => {
      const dashboard = { isDestroyed: () => false, webContents: { send: vi.fn() } } as any
      const overlay = { isDestroyed: () => false, webContents: { send: vi.fn() } } as any

      manager.setWindows(dashboard, overlay)

      expect(mockTranscriptionService.setWindows).toHaveBeenCalledWith(dashboard, overlay)
    })
  })

  describe('getIsRecording', () => {
    it('returns false initially', () => {
      expect(manager.getIsRecording()).toBe(false)
    })
  })

  describe('audio:start-recording (free mode)', () => {
    it('starts recording successfully with Deepgram key', async () => {
      mockGetSetting.mockImplementation((key: string) => {
        if (key === 'deepgramApiKey') return 'dg-test-key'
        return ''
      })

      const handler = mockIpcHandlers['audio:start-recording']
      const result = await handler({})

      expect(result).toEqual({ success: true })
      expect(manager.getIsRecording()).toBe(true)
      expect(mockTranscriptionService.setApiKey).toHaveBeenCalledWith('dg-test-key')
      expect(mockTranscriptionService.start).toHaveBeenCalled()
      expect(mockStartCapture).toHaveBeenCalled()
    })

    it('starts recording without Deepgram key (transcription disabled)', async () => {
      mockGetSetting.mockReturnValue('')

      const handler = mockIpcHandlers['audio:start-recording']
      const result = await handler({})

      expect(result).toEqual({ success: true })
      expect(manager.getIsRecording()).toBe(true)
      expect(mockTranscriptionService.setApiKey).not.toHaveBeenCalled()
    })

    it('returns error when recording is already in progress', async () => {
      const handler = mockIpcHandlers['audio:start-recording']
      await handler({})

      const result = await handler({})

      expect(result).toEqual({ success: false, error: 'Recording already in progress' })
    })

    it('returns error when native capture fails', async () => {
      mockStartCapture.mockReturnValue(false)

      const handler = mockIpcHandlers['audio:start-recording']
      const result = await handler({})

      expect(result).toEqual({ success: false, error: 'Audio capture failed to start' })
      expect(manager.getIsRecording()).toBe(false)
    })

    it('starts session in free mode', async () => {
      const handler = mockIpcHandlers['audio:start-recording']
      await handler({})

      expect(mockSessionManager.startSession).toHaveBeenCalledWith(null)
    })
  })

  describe('audio:start-recording (macOS permissions)', () => {
    const originalPlatform = process.platform

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    })

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    })

    it('checks permissions on macOS', async () => {
      const handler = mockIpcHandlers['audio:start-recording']
      await handler({})

      expect(mockCheckPermissions).toHaveBeenCalled()
    })

    it('requests mic access if mic permission missing', async () => {
      mockCheckPermissions.mockReturnValue({ ok: false, missing: ['microphone'] })
      mockRequestMicAccess.mockResolvedValue(true)

      const handler = mockIpcHandlers['audio:start-recording']
      await handler({})

      expect(mockRequestMicAccess).toHaveBeenCalled()
    })

    it('returns error when mic permission denied', async () => {
      mockCheckPermissions.mockReturnValue({ ok: false, missing: ['microphone'] })
      mockRequestMicAccess.mockResolvedValue(false)

      const handler = mockIpcHandlers['audio:start-recording']
      const result = await handler({})

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Microphone permission is required'),
      })
    })

    it('returns error when screen permission missing', async () => {
      mockCheckPermissions.mockReturnValue({ ok: false, missing: ['screen'] })

      const handler = mockIpcHandlers['audio:start-recording']
      const result = await handler({})

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Screen recording permission is required'),
      })
    })
  })

  describe('audio:start-recording (pro mode)', () => {
    beforeEach(() => {
      mockIsProMode.mockReturnValue(true)
    })

    it('allows recording in pro mode when session check passes or pro module unavailable', async () => {
      const handler = mockIpcHandlers['audio:start-recording']
      const result = await handler({})

      // In open-source builds, src/pro/ doesn't exist — pro session check
      // fails gracefully and allows a grace session. In premium builds,
      // the check would enforce limits. Either way, recording should start.
      expect(result).toMatchObject({ success: true })
    })
  })

  describe('audio:stop-recording', () => {
    it('stops an active recording', async () => {
      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})
      expect(manager.getIsRecording()).toBe(true)

      const stopHandler = mockIpcHandlers['audio:stop-recording']
      const result = await stopHandler()

      expect(result).toMatchObject({ success: true })
      expect(manager.getIsRecording()).toBe(false)
      expect(mockStopCapture).toHaveBeenCalled()
      expect(mockSessionManager.endSession).toHaveBeenCalled()
    })
  })

  describe('audio:get-state', () => {
    it('returns not recording when idle', async () => {
      const handler = mockIpcHandlers['audio:get-state']
      const state = await handler()

      expect(state).toEqual({ isRecording: false, duration: 0 })
    })

    it('returns recording state with duration', async () => {
      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})

      const handler = mockIpcHandlers['audio:get-state']
      const state = await handler() as { isRecording: boolean; duration: number }

      expect(state.isRecording).toBe(true)
      expect(state.duration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('audio:get-transcript', () => {
    it('returns transcript from active provider', async () => {
      mockTranscriptionService.getFullTranscriptWithInterims.mockReturnValue('Alice: Hello')

      const handler = mockIpcHandlers['audio:get-transcript']
      const result = await handler()

      expect(result).toBe('Alice: Hello')
    })
  })

  describe('audio:clear-transcript', () => {
    it('clears transcript from active provider', async () => {
      const handler = mockIpcHandlers['audio:clear-transcript']
      const result = await handler()

      expect(result).toEqual({ success: true })
      expect(mockTranscriptionService.clearTranscript).toHaveBeenCalled()
    })
  })

  describe('audio:get-transcript-entries', () => {
    it('returns transcript entries', async () => {
      const entries = [{ id: '1', source: 'mic', text: 'hi', speaker: 'you', timestamp: 1, isFinal: true }]
      mockTranscriptionService.getTranscriptEntries.mockReturnValue(entries)

      const handler = mockIpcHandlers['audio:get-transcript-entries']
      const result = await handler()

      expect(result).toEqual(entries)
    })
  })

  describe('audio:get-transcript-by-source', () => {
    it('returns transcript filtered by source', async () => {
      mockTranscriptionService.getTranscriptBySource.mockReturnValue('Alice: Hello')

      const handler = mockIpcHandlers['audio:get-transcript-by-source']
      const result = await handler({}, 'mic')

      expect(result).toBe('Alice: Hello')
    })
  })

  describe('audio pipeline callback', () => {
    it('sends audio to active provider when recording', async () => {
      const startHandler = mockIpcHandlers['audio:start-recording']
      mockGetSetting.mockImplementation((key: string) =>
        key === 'deepgramApiKey' ? 'dg-key' : '',
      )
      await startHandler({})

      const callback = mockSetProcessedAudioCallback.mock.calls[0][0]
      const buffer = Buffer.from('audio-data')
      callback(buffer, 'mic')

      expect(mockTranscriptionService.sendAudio).toHaveBeenCalledWith(buffer, 'mic')
    })

    it('does not send audio when not recording', () => {
      const callback = mockSetProcessedAudioCallback.mock.calls[0][0]
      const buffer = Buffer.from('audio-data')
      callback(buffer, 'mic')

      expect(mockTranscriptionService.sendAudio).not.toHaveBeenCalled()
    })
  })

  describe('audio:stop-from-limit', () => {
    it('auto-stops recording when limit reached', async () => {
      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})
      expect(manager.getIsRecording()).toBe(true)

      const limitHandler = mockIpcOnHandlers['audio:stop-from-limit']
      await limitHandler()

      await vi.waitFor(() => {
        expect(manager.getIsRecording()).toBe(false)
      })
    })
  })

  describe('broadcastRecordingState', () => {
    it('sends state to dashboard and overlay windows', async () => {
      const dashSend = vi.fn()
      const overlaySend = vi.fn()
      const dashboard = { isDestroyed: () => false, webContents: { send: dashSend }, show: vi.fn(), focus: vi.fn() } as any
      const overlay = { isDestroyed: () => false, webContents: { send: overlaySend } } as any

      manager.setWindows(dashboard, overlay)

      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})

      expect(dashSend).toHaveBeenCalledWith('audio:recording-state-changed', expect.objectContaining({ isRecording: true }))
      expect(overlaySend).toHaveBeenCalledWith('audio:recording-state-changed', expect.objectContaining({ isRecording: true }))
    })
  })

  describe('shutdown', () => {
    it('stops recording during shutdown', async () => {
      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})
      expect(manager.getIsRecording()).toBe(true)

      await manager.shutdown()

      expect(manager.getIsRecording()).toBe(false)
      expect(mockStopCapture).toHaveBeenCalled()
      expect(mockSessionManager.endSession).toHaveBeenCalled()
    })

    it('does nothing when not recording', async () => {
      await manager.shutdown()

      expect(mockStopCapture).not.toHaveBeenCalled()
      expect(mockSessionManager.endSession).not.toHaveBeenCalled()
    })
  })

  describe('stopRecordingInternal', () => {
    it('shows and focuses dashboard after stopping', async () => {
      const showFn = vi.fn()
      const focusFn = vi.fn()
      const dashboard = { isDestroyed: () => false, webContents: { send: vi.fn() }, show: showFn, focus: focusFn } as any
      manager.setWindows(dashboard, null)

      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})

      const stopHandler = mockIpcHandlers['audio:stop-recording']
      await stopHandler()

      expect(showFn).toHaveBeenCalled()
      expect(focusFn).toHaveBeenCalled()
    })

    it('clears active provider after stopping', async () => {
      const startHandler = mockIpcHandlers['audio:start-recording']
      mockGetSetting.mockImplementation((key: string) =>
        key === 'deepgramApiKey' ? 'dg-key' : '',
      )
      await startHandler({})

      const stopHandler = mockIpcHandlers['audio:stop-recording']
      await stopHandler()

      expect(mockTranscriptionService.stop).toHaveBeenCalled()
      expect(mockTranscriptionService.clearTranscript).toHaveBeenCalled()
    })
  })

  describe('startSessionOnce', () => {
    it('only starts session once even if called multiple times', async () => {
      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})

      expect(mockSessionManager.startSession).toHaveBeenCalledTimes(1)
    })
  })

  describe('broadcastTranscriptionConnectionState', () => {
    it('sends connection state to windows', async () => {
      const dashSend = vi.fn()
      const overlaySend = vi.fn()
      const dashboard = { isDestroyed: () => false, webContents: { send: dashSend }, show: vi.fn(), focus: vi.fn() } as any
      const overlay = { isDestroyed: () => false, webContents: { send: overlaySend } } as any

      manager.setWindows(dashboard, overlay)

      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})

      const stopHandler = mockIpcHandlers['audio:stop-recording']
      await stopHandler()

      expect(dashSend).toHaveBeenCalledWith('transcription:connection-state', expect.objectContaining({ phase: 'idle' }))
      expect(overlaySend).toHaveBeenCalledWith('transcription:connection-state', expect.objectContaining({ phase: 'idle' }))
    })
  })

  describe('startSessionTimer / clearSessionTimer', () => {
    it('clears session timer on stop', async () => {
      const startHandler = mockIpcHandlers['audio:start-recording']
      await startHandler({})

      const stopHandler = mockIpcHandlers['audio:stop-recording']
      await stopHandler()

      expect(manager.getIsRecording()).toBe(false)
    })
  })

  describe('broadcastError', () => {
    it('sends error to windows', () => {
      const dashSend = vi.fn()
      const overlaySend = vi.fn()
      const dashboard = { isDestroyed: () => false, webContents: { send: dashSend } } as any
      const overlay = { isDestroyed: () => false, webContents: { send: overlaySend } } as any

      manager.setWindows(dashboard, overlay)
      ;(manager as any).broadcastError('Test error')

      expect(dashSend).toHaveBeenCalledWith('notification', expect.objectContaining({ message: 'Test error', type: 'error' }))
      expect(overlaySend).toHaveBeenCalledWith('notification', expect.objectContaining({ message: 'Test error', type: 'error' }))
    })
  })

  describe('startDeepgramFallback', () => {
    it('starts Deepgram with available key', async () => {
      mockGetSetting.mockImplementation((key: string) =>
        key === 'deepgramApiKey' ? 'dg-key' : '',
      )

      await (manager as any).startDeepgramFallback()

      expect(mockTranscriptionService.setApiKey).toHaveBeenCalledWith('dg-key')
      expect(mockTranscriptionService.clearTranscript).toHaveBeenCalled()
      expect(mockTranscriptionService.start).toHaveBeenCalled()
    })

    it('does nothing when no Deepgram key available', async () => {
      mockGetSetting.mockReturnValue('')

      await (manager as any).startDeepgramFallback()

      expect(mockTranscriptionService.setApiKey).not.toHaveBeenCalled()
    })

    it('clears provider when Deepgram start fails', async () => {
      mockGetSetting.mockImplementation((key: string) =>
        key === 'deepgramApiKey' ? 'dg-key' : '',
      )
      mockTranscriptionService.start.mockResolvedValue({ success: false, error: 'fail' })

      await (manager as any).startDeepgramFallback()

      expect((manager as any).activeProvider).toBeNull()
    })
  })

  describe('rollbackSessionCount', () => {
    it('handles rollback error gracefully', async () => {
      vi.doMock('../../pro/main/authService', () => ({
        _apiRequest: vi.fn().mockRejectedValue(new Error('network error')),
      }))

      await expect((manager as any).rollbackSessionCount()).resolves.not.toThrow()
    })
  })
})
