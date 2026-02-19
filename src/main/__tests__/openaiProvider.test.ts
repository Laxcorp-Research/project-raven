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
          max_tokens: 60,
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
          max_tokens: 200,
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
          max_tokens: 512,
        })
      )
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
