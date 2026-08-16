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

vi.mock('../ai/providerFactory', () => ({
  getFastProvider: vi.fn(),
}))

import { getFastProvider } from '../ai/providerFactory'
import { analyzeSession } from '../insightsService'

describe('analyzeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateShort.mockResolvedValue('{"overall_sentiment":{"sentiment":"neutral"}}')
    vi.mocked(getFastProvider).mockResolvedValue({
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

  it('providerFactory source does not define hosted Pro providers', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.resolve(__dirname, '../ai/providerFactory.ts'), 'utf8')
    expect(src).not.toMatch(/export async function getProProvider/)
    expect(src).not.toMatch(/export async function getProFastProvider/)
    expect(src).not.toMatch(/export async function getProSystemProvider/)
    expect(src).not.toMatch(/backendProxyProvider/)
  })
})
