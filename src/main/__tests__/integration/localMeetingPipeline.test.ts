import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ipcHandlers, sockets, provider, sendToOverlay } = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: any[]) => any>(),
  sockets: [] as Array<{ send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>,
  provider: {
    name: 'ollama' as const,
    generateShort: vi.fn(),
    streamResponse: vi.fn(async (_params, callbacks) => {
      callbacks.onText('Use the local rollout plan.')
      callbacks.onDone('Use the local rollout plan.')
    }),
  },
  sendToOverlay: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
      ipcHandlers.set(channel, handler)
    }),
    emit: vi.fn(),
  },
  desktopCapturer: { getSources: vi.fn() },
  screen: { getPrimaryDisplay: vi.fn() },
}))

vi.mock('ws', () => ({
  default: vi.fn(function () {
    const socket = { send: vi.fn(), close: vi.fn() }
    sockets.push(socket)
    return socket
  }),
}))

vi.mock('uuid', () => ({ v4: vi.fn(() => 'local-ai-response') }))

vi.mock('../../services/sessionManager', () => ({
  sessionManager: {
    addTranscriptEntry: vi.fn(),
    addSessionMessage: vi.fn(),
    addAIResponse: vi.fn(),
  },
}))

vi.mock('../../services/ai/providerFactory', () => ({
  getProviderFromStore: vi.fn(async () => provider),
  getProProvider: vi.fn(),
  getProFastProvider: vi.fn(),
}))

vi.mock('../../store', () => ({
  getSetting: vi.fn((key: string) => {
    if (key === 'displayName') return 'Alice'
    if (key === 'aiModel') return 'qwen3:8b'
    if (key === 'ollamaBaseUrl') return 'http://127.0.0.1:11434'
    return ''
  }),
  isProMode: vi.fn(() => false),
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { ClaudeService } from '../../claudeService'
import { TranscriptionService } from '../../transcriptionService'

describe('local meeting pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ipcHandlers.clear()
    sockets.length = 0
    ClaudeService._resetForTesting()
  })

  it('routes dual PCM through local STT results and streams Ollama output to the overlay', async () => {
    const overlay = {
      isDestroyed: () => false,
      webContents: { send: sendToOverlay },
    } as any

    const transcription = new TranscriptionService()
    transcription.setWindows(null, overlay)

    for (const source of ['micConnection', 'systemConnection']) {
      const state = (transcription as any)[source]
      state.ws = { send: vi.fn(), close: vi.fn() }
      state.isConnected = true
    }

    const micPcm = Buffer.from([1, 2, 3, 4])
    const systemPcm = Buffer.from([5, 6, 7, 8])
    transcription.sendAudio(micPcm, 'mic')
    transcription.sendAudio(systemPcm, 'system')

    expect((transcription as any).micConnection.ws.send).toHaveBeenCalledWith(micPcm)
    expect((transcription as any).systemConnection.ws.send).toHaveBeenCalledWith(systemPcm)

    ;(transcription as any).handleTranscriptResult({
      channel: { alternatives: [{ transcript: 'We should roll out locally.', words: [{ speaker: 0 }] }] },
      is_final: true,
    }, 'mic')
    ;(transcription as any).handleTranscriptResult({
      channel: { alternatives: [{ transcript: 'What is the next step?' }] },
      is_final: true,
    }, 'system')

    const transcript = transcription.getFullTranscript()
    expect(transcript).toContain('Alice: We should roll out locally.')
    expect(transcript).toContain('Them: What is the next step?')

    new ClaudeService(overlay)
    const request = ipcHandlers.get('claude:get-response')
    expect(request).toBeDefined()
    await request?.({}, { transcript, action: 'assist', includeScreenshot: false })

    expect(provider.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 300 }),
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(sendToOverlay).toHaveBeenCalledWith(
      'claude:response',
      expect.objectContaining({ type: 'delta', text: 'Use the local rollout plan.' }),
    )
    expect(sendToOverlay).toHaveBeenCalledWith(
      'claude:response',
      expect.objectContaining({ type: 'done', fullText: 'Use the local rollout plan.' }),
    )
  })
})
