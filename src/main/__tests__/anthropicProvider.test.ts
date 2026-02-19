import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockCreate, mockStream } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockStream: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return {
      messages: {
        create: mockCreate,
        stream: mockStream,
      },
    }
  }),
}))

import { AnthropicProvider } from '../services/ai/anthropicProvider'

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    provider = new AnthropicProvider('sk-ant-test', 'claude-sonnet-4-6')
  })

  it('has name "anthropic"', () => {
    expect(provider.name).toBe('anthropic')
  })

  describe('generateShort', () => {
    it('returns trimmed text from API response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '  Hello World  ' }],
      })

      const result = await provider.generateShort({
        prompt: 'Say hello',
      })

      expect(result).toBe('Hello World')
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-6',
          max_tokens: 60,
          messages: [{ role: 'user', content: 'Say hello' }],
        })
      )
    })

    it('passes system prompt when provided', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Response' }],
      })

      await provider.generateShort({
        system: 'You are helpful',
        prompt: 'Test',
        maxTokens: 100,
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful',
          max_tokens: 100,
        })
      )
    })

    it('returns empty string when no text in response', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '' }],
      })

      const result = await provider.generateShort({ prompt: 'Test' })

      expect(result).toBe('')
    })

    it('propagates API errors', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API rate limit'))

      await expect(
        provider.generateShort({ prompt: 'Test' })
      ).rejects.toThrow('API rate limit')
    })
  })

  describe('streamResponse', () => {
    it('calls onText for each chunk and onDone with full text', async () => {
      const onText = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      const mockStreamInstance = {
        on: vi.fn((event: string, callback: (text: string) => void) => {
          if (event === 'text') {
            callback('Hello ')
            callback('World')
          }
          return mockStreamInstance
        }),
        finalMessage: vi.fn().mockResolvedValue({}),
      }
      mockStream.mockReturnValueOnce(mockStreamInstance)

      await provider.streamResponse(
        {
          system: 'Test system',
          messages: [{ role: 'user', content: 'Hi' }],
        },
        { onText, onDone, onError }
      )

      expect(onText).toHaveBeenCalledWith('Hello ')
      expect(onText).toHaveBeenCalledWith('World')
      expect(onDone).toHaveBeenCalledWith('Hello World')
      expect(onError).not.toHaveBeenCalled()
    })

    it('calls onError with friendly message on 401', async () => {
      const onText = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      mockStream.mockReturnValueOnce({
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockRejectedValue({ status: 401 }),
      })

      await expect(
        provider.streamResponse(
          { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
          { onText, onDone, onError }
        )
      ).rejects.toBeDefined()

      expect(onError).toHaveBeenCalledWith(
        'Invalid Anthropic API key. Check settings.'
      )
    })

    it('calls onError with friendly message on 429', async () => {
      const onError = vi.fn()

      mockStream.mockReturnValueOnce({
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockRejectedValue({ status: 429 }),
      })

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

    it('calls onError with friendly message on 529 (overloaded)', async () => {
      const onError = vi.fn()

      mockStream.mockReturnValueOnce({
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockRejectedValue({ status: 529 }),
      })

      await expect(
        provider.streamResponse(
          { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
          { onText: vi.fn(), onDone: vi.fn(), onError }
        )
      ).rejects.toBeDefined()

      expect(onError).toHaveBeenCalledWith(
        'Claude is overloaded. Try again shortly.'
      )
    })

    it('includes error message for generic Error instances', async () => {
      const onError = vi.fn()

      mockStream.mockReturnValueOnce({
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockRejectedValue(new Error('Connection timeout')),
      })

      await expect(
        provider.streamResponse(
          { system: 'Test', messages: [{ role: 'user', content: 'Hi' }] },
          { onText: vi.fn(), onDone: vi.fn(), onError }
        )
      ).rejects.toThrow('Connection timeout')

      expect(onError).toHaveBeenCalledWith('AI error: Connection timeout')
    })
  })
})
