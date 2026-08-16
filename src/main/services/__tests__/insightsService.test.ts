import { describe, it, expect, vi, beforeEach } from 'vitest'

const generateShort = vi.fn()

vi.mock('../../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../../store', () => ({
  isProMode: vi.fn(() => false),
}))

vi.mock('../ai/providerFactory', () => ({
  getFastProvider: vi.fn(),
  getProSystemProvider: vi.fn(),
}))

import { isProMode } from '../../store'
import { getFastProvider, getProSystemProvider } from '../ai/providerFactory'
import { analyzeSession } from '../insightsService'

describe('analyzeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateShort.mockResolvedValue('{"overall_sentiment":{"sentiment":"neutral"}}')
    vi.mocked(isProMode).mockReturnValue(false)
    vi.mocked(getFastProvider).mockResolvedValue({
      name: 'anthropic',
      generateShort,
      streamResponse: vi.fn(),
    } as never)
    vi.mocked(getProSystemProvider).mockResolvedValue({
      name: 'anthropic',
      generateShort,
      streamResponse: vi.fn(),
    } as never)
  })

  it('returns error when transcript or features missing', async () => {
    expect(await analyzeSession({ transcript: '', features: ['sentiment'] })).toEqual({
      error: 'Missing required fields: transcript, features',
    })
    expect(await analyzeSession({ transcript: 'hello', features: [] })).toEqual({
      error: 'Missing required fields: transcript, features',
    })
    expect(generateShort).not.toHaveBeenCalled()
  })

  it('returns error when no LLM key is configured', async () => {
    vi.mocked(getFastProvider).mockRejectedValue(new Error('No API key configured for anthropic. Add it in Settings.'))
    const result = await analyzeSession({ transcript: 'hi', features: ['sentiment'] })
    expect(result.error).toMatch(/No API key configured/)
  })

  it('runs requested features on the cheap model and maps keys', async () => {
    generateShort
      .mockResolvedValueOnce('sentiment-json')
      .mockResolvedValueOnce('topics-json')
      .mockResolvedValueOnce('phrases-json')

    const result = await analyzeSession({
      transcript: 'Alice: hello\nBob: hi',
      features: ['sentiment', 'topics', 'key_phrases'],
      sessionId: 's1',
    })

    expect(result.sessionId).toBe('s1')
    expect(result.sentiment).toBe('sentiment-json')
    expect(result.topics).toBe('topics-json')
    expect(result.keyPhrases).toBe('phrases-json')
    expect(getFastProvider).toHaveBeenCalled()
    expect(generateShort).toHaveBeenCalledTimes(3)
    expect(generateShort.mock.calls[0][0].prompt).toContain('Alice: hello')
    expect(generateShort.mock.calls[0][0].maxTokens).toBe(2048)
  })

  it('omits a feature that throws without failing the whole analysis', async () => {
    generateShort
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('topics-ok')

    const result = await analyzeSession({
      transcript: 'talk',
      features: ['sentiment', 'topics'],
    })

    expect(result.sentiment).toBeUndefined()
    expect(result.topics).toBe('topics-ok')
    expect(result.error).toBeUndefined()
  })

  it('uses the Pro system provider in hosted Pro mode instead of BYOK', async () => {
    vi.mocked(isProMode).mockReturnValue(true)
    generateShort.mockResolvedValueOnce('sentiment-json')

    const result = await analyzeSession({
      transcript: 'hi',
      features: ['sentiment'],
    })

    expect(getProSystemProvider).toHaveBeenCalled()
    expect(getFastProvider).not.toHaveBeenCalled()
    expect(result.sentiment).toBe('sentiment-json')
  })
})
