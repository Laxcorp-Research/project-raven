import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: vi.fn() }))
vi.mock('assemblyai', () => ({ RealtimeTranscriber: vi.fn() }))
vi.mock('../../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('../../store', () => ({
  getApiKey: vi.fn(() => ''),
  getSetting: vi.fn((key: string) => (key === 'displayName' ? 'Alice' : '')),
}))
vi.mock('../sessionManager', () => ({
  sessionManager: { addTranscriptEntry: vi.fn() },
}))

import { AssemblyAITranscriptionService } from '../assemblyAITranscriptionService'

/**
 * seedTranscript must behave identically on both STT providers, because a
 * resumed session does not know which one will win the connect race.
 */
describe('AssemblyAITranscriptionService.seedTranscript (resumed session)', () => {
  let service: AssemblyAITranscriptionService

  beforeEach(() => {
    service = new AssemblyAITranscriptionService()
  })

  it('loads saved finals with speaker derived from source, sorted, dropping interims and blanks', () => {
    (service as any).micState.currentInterim = 'half a'

    service.seedTranscript([
      { id: 'b', source: 'mic', text: 'Sure, we shipped it in Q2.', timestamp: 2000, isFinal: true },
      { id: 'a', source: 'system', text: 'Tell me about the launch.', timestamp: 1000, isFinal: true },
      { id: 'c', source: 'mic', text: 'and the', timestamp: 3000, isFinal: false },
      { id: 'd', source: 'system', text: '  ', timestamp: 4000, isFinal: true },
    ])

    expect(service.getTranscriptEntries()).toEqual([
      { id: 'a', source: 'system', text: 'Tell me about the launch.', speaker: 'them', timestamp: 1000, isFinal: true },
      { id: 'b', source: 'mic', text: 'Sure, we shipped it in Q2.', speaker: 'you', timestamp: 2000, isFinal: true },
    ])
    expect((service as any).micState.currentInterim).toBe('')
    expect(service.getFullTranscriptWithInterims()).toBe(
      'Them: Tell me about the launch.\nAlice: Sure, we shipped it in Q2.',
    )
  })

  it('new live finals append after the seeded sitting instead of merging into it', () => {
    service.seedTranscript([
      { id: 'a', source: 'mic', text: 'Yesterday I said this.', timestamp: 1000, isFinal: true },
    ])

    ;(service as any).handleFinalTranscript('Today I say this.', 'mic')

    const entries = service.getTranscriptEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].text).toBe('Yesterday I said this.')
    expect(entries[1].text).toBe('Today I say this.')
  })
})
