import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: mockCreate } }
  }),
}))

import Anthropic from '@anthropic-ai/sdk'
import { validateDeepgramKey, validateAnthropicKey, validateOpenAIKey, validateBothKeys, validateKeys } from '../validators'

const MockAnthropic = vi.mocked(Anthropic)

describe('validateDeepgramKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns valid for 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await validateDeepgramKey('dg-test-key')

    expect(result).toEqual({ valid: true })
  })

  it('returns invalid for 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const result = await validateDeepgramKey('dg-bad-key')

    expect(result).toEqual({ valid: false, error: 'Invalid Deepgram API key.' })
  })

  it('handles network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))

    const result = await validateDeepgramKey('dg-key')

    expect(result).toEqual({
      valid: false,
      error: 'Could not reach Deepgram. Check your internet connection.',
    })
  })
})

describe('validateAnthropicKey', () => {
  beforeEach(() => {
    MockAnthropic.mockImplementation(function () {
      return { messages: { create: mockCreate } } as any
    })
  })

  it('returns valid on success', async () => {
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hi' }] })

    const result = await validateAnthropicKey('sk-ant-test')

    expect(result).toEqual({ valid: true })
  })

  it('returns invalid for 401', async () => {
    mockCreate.mockRejectedValueOnce({ status: 401 })

    const result = await validateAnthropicKey('sk-ant-bad')

    expect(result).toEqual({ valid: false, error: 'Invalid Anthropic API key.' })
  })
})

describe('validateBothKeys', () => {
  beforeEach(() => {
    MockAnthropic.mockImplementation(function () {
      return { messages: { create: mockCreate } } as any
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns first failure when Deepgram is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hi' }] })

    const result = await validateBothKeys('dg-bad', 'sk-ant-good')

    expect(result).toEqual({ valid: false, error: 'Invalid Deepgram API key.' })
  })
})

describe('validateOpenAIKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns valid for 200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await validateOpenAIKey('sk-openai-test')

    expect(result).toEqual({ valid: true })
  })

  it('returns invalid for 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const result = await validateOpenAIKey('sk-openai-bad')

    expect(result).toEqual({ valid: false, error: 'Invalid OpenAI API key.' })
  })

  it('returns invalid for 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))

    const result = await validateOpenAIKey('sk-openai-noperm')

    expect(result).toEqual({ valid: false, error: 'OpenAI key does not have permission. Check your plan.' })
  })

  it('returns status message for other errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const result = await validateOpenAIKey('sk-openai-key')

    expect(result).toEqual({ valid: false, error: 'OpenAI returned status 500.' })
  })

  it('handles network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    const result = await validateOpenAIKey('sk-openai-key')

    expect(result).toEqual({
      valid: false,
      error: 'Could not reach OpenAI. Check your internet connection.',
    })
  })
})

describe('validateKeys', () => {
  beforeEach(() => {
    MockAnthropic.mockImplementation(function () {
      return { messages: { create: mockCreate } } as any
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('validates deepgram + anthropic keys together', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Hi' }] })

    const result = await validateKeys('dg-key', 'anthropic', 'sk-ant-key')

    expect(result).toEqual({ valid: true })
  })

  it('validates deepgram + openai keys together', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await validateKeys('dg-key', 'openai', 'sk-openai-key')

    expect(result).toEqual({ valid: true })
  })

  it('returns deepgram error first when both fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const result = await validateKeys('dg-bad', 'openai', 'sk-openai-bad')

    expect(result).toEqual({ valid: false, error: 'Invalid Deepgram API key.' })
  })

  it('returns AI key error when only AI key fails', async () => {
    const mockFetch = vi.fn()
      .mockImplementation((url: string) => {
        if (url.includes('deepgram')) {
          return Promise.resolve({ ok: true, status: 200 })
        }
        return Promise.resolve({ ok: false, status: 401 })
      })
    vi.stubGlobal('fetch', mockFetch)

    const result = await validateKeys('dg-good', 'openai', 'sk-openai-bad')

    expect(result).toEqual({ valid: false, error: 'Invalid OpenAI API key.' })
  })
})
