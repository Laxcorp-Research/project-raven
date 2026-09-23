import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }
  }),
}))

import { OpenAIProvider } from '../services/ai/openaiProvider'

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    provider = new OpenAIProvider('sk-openai-test', 'gpt-5.2')
  })

  it('has name "openai"', () => {
    expect(provider.name).toBe('openai')
  })

  // Issue #30: GPT-5.x returns 400 "Unsupported parameter: 'max_tokens' is
  // not supported with this model. Use 'max_completion_tokens' instead."
  // Every model in the catalog is GPT-5.x, so any request carrying the
  // legacy key fails for every OpenAI user.
  describe('never sends the legacy max_tokens parameter (issue #30)', () => {
    it('streamResponse sends max_completion_tokens and no max_tokens', async () => {
      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {},
      })

      await provider.streamResponse(
        { system: 'Test', messages: [{ role: 'user', content: 'Hi' }], maxTokens: 256 },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )

      const payload = mockCreate.mock.calls[0][0] as Record<string, unknown>
      expect(payload).not.toHaveProperty('max_tokens')
      expect(payload.max_completion_tokens).toBe(256)
    })

    it('generateShort sends max_completion_tokens and no max_tokens', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
      })

      await provider.generateShort({ prompt: 'title please' })

      const payload = mockCreate.mock.calls[0][0] as Record<string, unknown>
      expect(payload).not.toHaveProperty('max_tokens')
      expect(payload.max_completion_tokens).toBe(128000)
    })
  })

  describe('generateShort', () => {
    it('returns trimmed text from API response', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '  Generated text  ' } }],
      })

      const result = await provider.generateShort({
        prompt: 'Generate something',
      })

      expect(result).toBe('Generated text')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.2',
          max_completion_tokens: 128000,
          messages: [{ role: 'user', content: 'Generate something' }],
        })
      )
    })

    it('includes system message when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Response' } }],
      })

      await provider.generateShort({
        system: 'Be concise',
        prompt: 'Test',
        maxTokens: 200,
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: 128000,
          messages: [
            { role: 'system', content: 'Be concise' },
            { role: 'user', content: 'Test' },
          ],
        })
      )
    })

    it('returns empty string when no content', async () => {
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      })

      const result = await provider.generateShort({ prompt: 'Test' })

      expect(result).toBe('')
    })

    it('returns empty string when choices array is empty', async () => {
      mockCreate.mockResolvedValueOnce({ choices: [] })

      const result = await provider.generateShort({ prompt: 'Test' })

      expect(result).toBe('')
    })

    it('sends the selected reasoning_effort on generateShort with the model max output', async () => {
      const provider = new OpenAIProvider('sk-openai-test', 'gpt-5.6-sol', 'max')
      mockCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
      })
      await provider.generateShort({ prompt: 'summarize', maxTokens: 2000 })
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_completion_tokens: 128000,
          reasoning_effort: 'max',
        }),
      )
    })

    it('propagates API errors', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Quota exceeded'))

      await expect(
        provider.generateShort({ prompt: 'Test' })
      ).rejects.toThrow('Quota exceeded')
    })
  })

  describe('streamResponse', () => {
    it('calls onText for each chunk and onDone with full text', async () => {
      const onText = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      const chunks = [
        { choices: [{ delta: { content: 'Hello ' } }] },
        { choices: [{ delta: { content: 'World' } }] },
        { choices: [{ delta: { content: '' } }] },
      ]

      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk
          }
        },
      })

      await provider.streamResponse(
        {
          system: 'Test system',
          messages: [{ role: 'user', content: 'Hi' }],
        },
        { onText, onDone, onError }
      )

      expect(onText).toHaveBeenCalledWith('Hello ')
      expect(onText).toHaveBeenCalledWith('World')
      expect(onText).toHaveBeenCalledTimes(2) // empty content skipped
      expect(onDone).toHaveBeenCalledWith('Hello World')
      expect(onError).not.toHaveBeenCalled()
    })

    it('passes stream: true in API call', async () => {
      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {
          // empty stream
        },
      })

      await provider.streamResponse(
        {
          system: 'Test',
          messages: [{ role: 'user', content: 'Hi' }],
          maxTokens: 512,
        },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          max_completion_tokens: 512,
        })
      )
    })

    it('defaults omitted maxTokens to the official 128k model max', async () => {
      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {},
      })

      await provider.streamResponse(
        { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_completion_tokens: 128000 })
      )
    })

    it('sends the selected reasoning_effort on GPT-5.6', async () => {
      const provider = new OpenAIProvider('sk-openai-test', 'gpt-5.6-luna', 'xhigh')
      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {},
      })

      await provider.streamResponse(
        { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.6-luna',
          reasoning_effort: 'xhigh',
        })
      )
    })

    it('sends reasoning_effort on GPT-5.4 when the user set it', async () => {
      const provider = new OpenAIProvider('sk-openai-test', 'gpt-5.4-mini', 'none')
      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {},
      })

      await provider.streamResponse(
        { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )

      const args = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0]
      expect(args.reasoning_effort).toBe('none')
    })

    it('sends reasoning_effort on GPT-5.2', async () => {
      const provider = new OpenAIProvider('sk-openai-test', 'gpt-5.2', 'high')
      mockCreate.mockResolvedValueOnce({
        [Symbol.asyncIterator]: async function* () {},
      })

      await provider.streamResponse(
        { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )

      const args = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0]
      expect(args.reasoning_effort).toBe('high')
    })

    it('calls onError with friendly message on 401', async () => {
      const onError = vi.fn()

      mockCreate.mockRejectedValueOnce({ status: 401 })

      await expect(
        provider.streamResponse(
          { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
          { onText: vi.fn(), onDone: vi.fn(), onError }
        )
      ).rejects.toBeDefined()

      expect(onError).toHaveBeenCalledWith(
        'Invalid OpenAI API key. Check settings.'
      )
    })

    it('calls onError with friendly message on 429', async () => {
      const onError = vi.fn()

      mockCreate.mockRejectedValueOnce({ status: 429 })

      await expect(
        provider.streamResponse(
          { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
          { onText: vi.fn(), onDone: vi.fn(), onError }
        )
      ).rejects.toBeDefined()

      expect(onError).toHaveBeenCalledWith(
        'Rate limited. Wait a moment and try again.'
      )
    })

    it('includes error message for generic Error instances', async () => {
      const onError = vi.fn()

      mockCreate.mockRejectedValueOnce(new Error('Network error'))

      await expect(
        provider.streamResponse(
          { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
          { onText: vi.fn(), onDone: vi.fn(), onError }
        )
      ).rejects.toThrow('Network error')

      expect(onError).toHaveBeenCalledWith('AI error: Network error')
    })
  })
})
