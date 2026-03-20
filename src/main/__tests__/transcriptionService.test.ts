import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}))

vi.mock('../services/sessionManager', () => ({
  sessionManager: {
    addTranscriptEntry: vi.fn(),
  },
}))

const mockGetSetting = vi.hoisted(() => vi.fn((key: string) => (key === 'displayName' ? 'Alice' : '')))

vi.mock('../store', () => ({
  getSetting: mockGetSetting,
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockWsInstance = vi.hoisted(() => ({
  onopen: null as ((ev?: unknown) => void) | null,
  onmessage: null as ((ev: { data: unknown }) => void) | null,
  onerror: null as ((ev: { message?: string }) => void) | null,
  onclose: null as ((ev: { code?: number; reason?: string }) => void) | null,
  send: vi.fn(),
  close: vi.fn(),
}))

vi.mock('ws', () => ({
  default: vi.fn(() => mockWsInstance),
}))

import { TranscriptionService } from '../transcriptionService'
import { sessionManager } from '../services/sessionManager'

describe('TranscriptionService', () => {
  let service: TranscriptionService

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSetting.mockImplementation((key: string) =>
      key === 'displayName' ? 'Alice' : '',
    )
    mockWsInstance.onopen = null
    mockWsInstance.onmessage = null
    mockWsInstance.onerror = null
    mockWsInstance.onclose = null
    mockWsInstance.send.mockClear()
    mockWsInstance.close.mockClear()
    service = new TranscriptionService()
  })

  describe('setWindows', () => {
    it('sets dashboard and overlay windows', () => {
      const dashboard = { isDestroyed: () => false, webContents: { send: vi.fn() } } as any
      const overlay = { isDestroyed: () => false, webContents: { send: vi.fn() } } as any

      service.setWindows(dashboard, overlay)
    })
  })

  describe('setApiKey', () => {
    it('sets the API key', () => {
      service.setApiKey('test-key')
    })
  })

  describe('start', () => {
    it('fails without API key', async () => {
      const result = await service.start()

      expect(result).toEqual({ success: false, error: 'No Deepgram API key configured' })
    })
  })

  describe('sendAudio', () => {
    it('buffers audio when not connected', () => {
      const buffer = Buffer.from('audio-data')
      service.sendAudio(buffer, 'mic')

      expect(mockWsInstance.send).not.toHaveBeenCalled()
    })

    it('sends audio to connected ws', () => {
      const state = (service as any).micConnection
      state.ws = mockWsInstance
      state.isConnected = true

      const buffer = Buffer.from('audio-data')
      service.sendAudio(buffer, 'mic')

      expect(mockWsInstance.send).toHaveBeenCalled()
    })

    it('accepts ArrayBuffer input', () => {
      const state = (service as any).micConnection
      state.ws = mockWsInstance
      state.isConnected = true

      const arrayBuffer = new ArrayBuffer(16)
      service.sendAudio(arrayBuffer, 'mic')

      expect(mockWsInstance.send).toHaveBeenCalled()
    })

    it('flushes pending audio on reconnect', () => {
      const state = (service as any).micConnection
      state.pendingAudio = [Buffer.from('chunk1'), Buffer.from('chunk2')]
      state.ws = mockWsInstance
      state.isConnected = true

      service.sendAudio(Buffer.from('new-chunk'), 'mic')

      expect(mockWsInstance.send).toHaveBeenCalledTimes(3)
      expect(state.pendingAudio).toEqual([])
    })

    it('tracks send count', () => {
      const state = (service as any).micConnection
      state.ws = mockWsInstance
      state.isConnected = true
      state.sendCount = 0

      service.sendAudio(Buffer.from('data'), 'mic')

      expect(state.sendCount).toBe(1)
    })
  })

  describe('stop', () => {
    it('stops cleanly when not connected', async () => {
      await service.stop()
    })

    it('sets isActive to false', async () => {
      ;(service as any).isActive = true
      await service.stop()
      expect((service as any).isActive).toBe(false)
    })

    it('resets reconnect attempts', async () => {
      ;(service as any).micConnection.reconnectAttempts = 3
      ;(service as any).systemConnection.reconnectAttempts = 2
      await service.stop()
      expect((service as any).micConnection.reconnectAttempts).toBe(0)
      expect((service as any).systemConnection.reconnectAttempts).toBe(0)
    })
  })

  describe('getFullTranscript', () => {
    it('returns empty string when no entries', () => {
      expect(service.getFullTranscript()).toBe('')
    })

    it('formats entries with displayName for "you" speaker', () => {
      ;(service as any).transcriptEntries = [
        { id: '1', source: 'mic', text: 'Hello there', speaker: 'you', timestamp: 1000, isFinal: true },
      ]

      expect(service.getFullTranscript()).toBe('Alice: Hello there')
    })

    it('uses "Them" for non-you speakers', () => {
      ;(service as any).transcriptEntries = [
        { id: '1', source: 'system', text: 'Hi, nice to meet you', speaker: 'them', timestamp: 1000, isFinal: true },
      ]

      expect(service.getFullTranscript()).toBe('Them: Hi, nice to meet you')
    })

    it('falls back to "You" when no displayName is set', () => {
      mockGetSetting.mockReturnValue('')

      ;(service as any).transcriptEntries = [
        { id: '1', source: 'mic', text: 'Hello', speaker: 'you', timestamp: 1000, isFinal: true },
      ]

      expect(service.getFullTranscript()).toBe('You: Hello')
    })
  })

  describe('getFullTranscriptWithInterims', () => {
    it('includes current interim text', () => {
      ;(service as any).transcriptEntries = [
        { id: '1', source: 'mic', text: 'Hello', speaker: 'you', timestamp: 1000, isFinal: true },
      ]
      ;(service as any).systemConnection.currentInterim = 'I think...'
      ;(service as any).micConnection.currentInterim = 'And also...'

      const result = service.getFullTranscriptWithInterims()

      expect(result).toContain('Alice: Hello')
      expect(result).toContain('Them (still speaking): I think...')
      expect(result).toContain('Alice (still speaking): And also...')
    })

    it('returns only finalized text when no interims', () => {
      ;(service as any).transcriptEntries = [
        { id: '1', source: 'mic', text: 'Hello', speaker: 'you', timestamp: 1000, isFinal: true },
      ]

      const result = service.getFullTranscriptWithInterims()
      expect(result).toBe('Alice: Hello')
    })
  })

  describe('getTranscriptEntries', () => {
    it('returns all entries', () => {
      const entries = [
        { id: '1', source: 'mic', text: 'Hello', speaker: 'you', timestamp: 1000, isFinal: true },
      ]
      ;(service as any).transcriptEntries = entries

      expect(service.getTranscriptEntries()).toEqual(entries)
    })
  })

  describe('getTranscriptBySource', () => {
    it('filters by mic source', () => {
      ;(service as any).transcriptEntries = [
        { id: '1', source: 'mic', text: 'Hello', speaker: 'you', timestamp: 1000, isFinal: true },
        { id: '2', source: 'system', text: 'Hi', speaker: 'them', timestamp: 1001, isFinal: true },
      ]

      const result = service.getTranscriptBySource('mic')
      expect(result).toBe('Alice: Hello')
    })

    it('filters by system source', () => {
      ;(service as any).transcriptEntries = [
        { id: '1', source: 'mic', text: 'Hello', speaker: 'you', timestamp: 1000, isFinal: true },
        { id: '2', source: 'system', text: 'Hi there', speaker: 'them', timestamp: 1001, isFinal: true },
      ]

      const result = service.getTranscriptBySource('system')
      expect(result).toBe('Them: Hi there')
    })

    it('returns all sources when filter is "all"', () => {
      ;(service as any).transcriptEntries = [
        { id: '1', source: 'mic', text: 'Hello', speaker: 'you', timestamp: 1000, isFinal: true },
        { id: '2', source: 'system', text: 'Hi', speaker: 'them', timestamp: 1001, isFinal: true },
      ]

      const result = service.getTranscriptBySource('all')
      expect(result).toContain('Alice: Hello')
      expect(result).toContain('Them: Hi')
    })
  })

  describe('handleTranscriptResult', () => {
    it('creates new entry for a final result', () => {
      const data = {
        channel: { alternatives: [{ transcript: 'First sentence' }] },
        is_final: true,
      }

      ;(service as any).handleTranscriptResult(data, 'mic')

      const entries = service.getTranscriptEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].text).toBe('First sentence')
      expect(entries[0].speaker).toBe('you')
      expect(entries[0].isFinal).toBe(true)
    })

    it('merges consecutive same-speaker entries within 5s', () => {
      const first = {
        channel: { alternatives: [{ transcript: 'Part one' }] },
        is_final: true,
      }
      const second = {
        channel: { alternatives: [{ transcript: 'part two' }] },
        is_final: true,
      }

      ;(service as any).handleTranscriptResult(first, 'mic')
      ;(service as any).handleTranscriptResult(second, 'mic')

      const entries = service.getTranscriptEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].text).toBe('Part one part two')
    })

    it('creates separate entry when speaker differs', () => {
      const micData = {
        channel: { alternatives: [{ transcript: 'Hello from mic' }] },
        is_final: true,
      }
      const systemData = {
        channel: { alternatives: [{ transcript: 'Hello from system' }] },
        is_final: true,
      }

      ;(service as any).handleTranscriptResult(micData, 'mic')
      ;(service as any).handleTranscriptResult(systemData, 'system')

      const entries = service.getTranscriptEntries()
      expect(entries).toHaveLength(2)
      expect(entries[0].speaker).toBe('you')
      expect(entries[1].speaker).toBe('them')
    })

    it('stores interim as currentInterim', () => {
      const data = {
        channel: { alternatives: [{ transcript: 'Still speaking...' }] },
        is_final: false,
      }

      ;(service as any).handleTranscriptResult(data, 'mic')

      expect((service as any).micConnection.currentInterim).toBe('Still speaking...')
    })

    it('clears currentInterim on final result', () => {
      ;(service as any).micConnection.currentInterim = 'partial'

      const data = {
        channel: { alternatives: [{ transcript: 'Complete sentence' }] },
        is_final: true,
      }

      ;(service as any).handleTranscriptResult(data, 'mic')

      expect((service as any).micConnection.currentInterim).toBe('')
    })

    it('ignores messages without transcript', () => {
      const data = {
        channel: { alternatives: [{ transcript: '' }] },
        is_final: true,
      }

      ;(service as any).handleTranscriptResult(data, 'mic')

      expect(service.getTranscriptEntries()).toHaveLength(0)
    })

    it('ignores messages with no alternatives', () => {
      const data = { channel: { alternatives: [] }, is_final: true }

      ;(service as any).handleTranscriptResult(data, 'mic')

      expect(service.getTranscriptEntries()).toHaveLength(0)
    })

    it('sends transcript to sessionManager', () => {
      const data = {
        channel: { alternatives: [{ transcript: 'Test text' }] },
        is_final: true,
      }

      ;(service as any).handleTranscriptResult(data, 'mic')

      expect(sessionManager.addTranscriptEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test text',
          isFinal: true,
        }),
      )
    })

    it('sends interim transcripts to sessionManager', () => {
      const data = {
        channel: { alternatives: [{ transcript: 'In progress' }] },
        is_final: false,
      }

      ;(service as any).handleTranscriptResult(data, 'system')

      expect(sessionManager.addTranscriptEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'interim-system',
          text: 'In progress',
          isFinal: false,
        }),
      )
    })

    it('broadcasts transcript to windows', () => {
      const overlaySend = vi.fn()
      const dashboardSend = vi.fn()
      service.setWindows(
        { isDestroyed: () => false, webContents: { send: dashboardSend } } as any,
        { isDestroyed: () => false, webContents: { send: overlaySend } } as any,
      )

      const data = {
        channel: { alternatives: [{ transcript: 'Hello' }] },
        is_final: true,
      }

      ;(service as any).handleTranscriptResult(data, 'mic')

      expect(overlaySend).toHaveBeenCalledWith('transcription:update', expect.any(Object))
      expect(dashboardSend).toHaveBeenCalledWith('transcription:update', expect.any(Object))
    })

    it('caps transcript entries at maximum', () => {
      for (let i = 0; i < 5001; i++) {
        ;(service as any).transcriptEntries.push({
          id: `entry-${i}`,
          source: 'mic',
          text: `Text ${i}`,
          speaker: 'you',
          timestamp: i * 6000,
          isFinal: true,
        })
      }

      const data = {
        channel: { alternatives: [{ transcript: 'New entry' }] },
        is_final: true,
      }
      ;(service as any).handleTranscriptResult(data, 'system')

      expect(service.getTranscriptEntries().length).toBeLessThanOrEqual(5001)
    })
  })

  describe('clearTranscript', () => {
    it('resets all state', () => {
      ;(service as any).transcriptEntries = [
        { id: '1', source: 'mic', text: 'text', speaker: 'you', timestamp: 1000, isFinal: true },
      ]
      ;(service as any).micConnection.currentInterim = 'interim mic'
      ;(service as any).systemConnection.currentInterim = 'interim system'

      service.clearTranscript()

      expect(service.getTranscriptEntries()).toHaveLength(0)
      expect(service.getFullTranscript()).toBe('')
      expect((service as any).micConnection.currentInterim).toBe('')
      expect((service as any).systemConnection.currentInterim).toBe('')
    })
  })
})
