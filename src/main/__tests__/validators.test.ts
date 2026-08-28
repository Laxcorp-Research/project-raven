import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockCreate, mockNetFetch } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockNetFetch: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: mockCreate } }
  }),
}))

vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => mockNetFetch(...args) },
}))

import Anthropic from '@anthropic-ai/sdk'
import { validateDeepgramKey, validateAnthropicKey, validateOpenAIKey, validateBothKeys, validateKeys, validateAssemblyAIKey, validateRecallKey, VALIDATION_TIMEOUT_MS } from '../validators'

function setElectronVersion(value: string | undefined): void {
  Object.defineProperty(process.versions, 'electron', {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  })
}

const MockAnthropic = vi.mocked(Anthropic)

afterEach(() => {
  vi.unstubAllGlobals()
  mockCreate.mockReset()
  mockNetFetch.mockReset()
  setElectronVersion(undefined)
})

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
      error: 'Could not reach Deepgram (fetch failed).',
    })
  })
})

describe('validateAnthropicKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mockCreate.mockReset()
    mockNetFetch.mockReset()
    setElectronVersion(undefined)
  })

  it('returns valid on 200 from /v1/models (does not require a chat completion)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const result = await validateAnthropicKey('test-ant-placeholder')

    expect(result).toEqual({ valid: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-ant-placeholder',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns invalid for 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const result = await validateAnthropicKey('test-ant-bad')

    expect(result).toEqual({ valid: false, error: 'Invalid Anthropic API key.' })
  })

  it('returns a status message for 404 on /v1/models (not "invalid key")', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const result = await validateAnthropicKey('test-ant-placeholder')

    expect(result).toEqual({ valid: false, error: 'Anthropic returned status 404.' })
  })

  it('uses Electron net.fetch when running inside Electron', async () => {
    setElectronVersion('28.3.0')
    mockNetFetch.mockResolvedValue({ ok: true, status: 200 })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await validateAnthropicKey('test-ant-placeholder')

    expect(result).toEqual({ valid: true })
    expect(mockNetFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-ant-placeholder',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an authenticated SDK 404 as a valid key when the HTTP probe throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('not_found_error'), { status: 404 }))

    const result = await validateAnthropicKey('test-ant-placeholder')

    expect(result).toEqual({ valid: true })
    expect(mockCreate).toHaveBeenCalled()
  })

  it('treats an authenticated SDK 400 as a valid key when the HTTP probe throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('billing'), { status: 400 }))

    const result = await validateAnthropicKey('test-ant-placeholder')

    expect(result).toEqual({ valid: true })
  })

  it('still rejects a 401 from the SDK fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('authentication_error'), { status: 401 }))

    const result = await validateAnthropicKey('test-ant-bad')

    expect(result).toEqual({ valid: false, error: 'Invalid Anthropic API key.' })
  })

  it('bounds the SDK fallback (no retries + finite timeout) so it cannot hang', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')))
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] })

    const result = await validateAnthropicKey('test-ant-placeholder')

    expect(result).toEqual({ valid: true })
    expect(MockAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-ant-placeholder',
        maxRetries: 0,
        timeout: VALIDATION_TIMEOUT_MS,
      }),
    )
  })

  it('includes the thrown reason instead of a generic offline message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('unable to verify the first certificate')))
    mockCreate.mockRejectedValueOnce(new Error('unable to verify the first certificate'))

    const result = await validateAnthropicKey('test-ant-placeholder')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Could not reach Anthropic (unable to verify the first certificate).')
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

    const result = await validateBothKeys('dg-bad', 'test-ant-good')

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
      error: 'Could not reach OpenAI (network).',
    })
  })

  it('passes an abort signal so the probe can be cancelled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await validateOpenAIKey('sk-openai-test')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('times out with a friendly error instead of hanging when the request stalls (regression)', async () => {
    vi.useFakeTimers()
    try {
      // A fetch that never settles on its own and only rejects when aborted -
      // i.e. a stalled network. Before the deadline this awaited forever and
      // the Settings spinner "kept on loading".
      const fetchMock = vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const pending = validateOpenAIKey('sk-openai-stall')
      await vi.advanceTimersByTimeAsync(VALIDATION_TIMEOUT_MS + 50)
      const result = await pending

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Could not reach OpenAI')
      expect(result.error).toContain('timed out')
    } finally {
      vi.useRealTimers()
    }
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

    const result = await validateKeys('dg-key', 'anthropic', 'test-ant-key')

    expect(result).toEqual({ valid: true })
  })

  it('validates deepgram + openai keys together', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    const result = await validateKeys('dg-key', 'openai', 'sk-openai-key')

    expect(result).toEqual({ valid: true })
  })

  it('returns both errors when both fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    const result = await validateKeys('dg-bad', 'openai', 'sk-openai-bad')

    expect(result.valid).toBe(false)
    expect(result.deepgramError).toBeDefined()
    expect(result.aiError).toBeDefined()
    expect(result.error).toBe('Invalid Deepgram, OpenAI keys.')
  })

  it('returns only AI error when only AI key fails', async () => {
    const mockFetch = vi.fn()
      .mockImplementation((url: string) => {
        if (url.includes('deepgram')) {
          return Promise.resolve({ ok: true, status: 200 })
        }
        return Promise.resolve({ ok: false, status: 401 })
      })
    vi.stubGlobal('fetch', mockFetch)

    const result = await validateKeys('dg-good', 'openai', 'sk-openai-bad')

    expect(result.valid).toBe(false)
    expect(result.deepgramError).toBeUndefined()
    expect(result.aiError).toBeDefined()
    expect(result.error).toBe('Invalid OpenAI API key.')
  })

  it('skips Deepgram when the key is empty so Assembly-only setups can validate the LLM key', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', mockFetch)

    const result = await validateKeys('', 'anthropic', 'ant-key')

    expect(result.valid).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.any(Object),
    )
  })
})

describe('validateAssemblyAIKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns valid for 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    expect(await validateAssemblyAIKey('aai-key')).toEqual({ valid: true })
  })

  it('returns invalid for 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    expect(await validateAssemblyAIKey('bad')).toEqual({
      valid: false,
      error: 'Invalid AssemblyAI API key.',
    })
  })
})

describe('validateRecallKey', () => {
  it('always rejects (Recall is removed)', async () => {
    expect(await validateRecallKey('recall-key', 'https://us-east-1.recall.ai')).toEqual({
      valid: false,
      error: 'Recall is not available.',
    })
  })
})
