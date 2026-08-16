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
    provider = new AnthropicProvider('test-ant-placeholder', 'claude-sonnet-4-6')
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

  describe('user-selected effort', () => {
    function makeProviderForModel(model: string, effort?: string): AnthropicProvider {
      const provider = new AnthropicProvider('test-ant-placeholder', model, effort)
      const noopStream = {
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockResolvedValue({}),
      }
      mockStream.mockReturnValueOnce(noopStream)
      return provider
    }

    it('sends the selected effort on claude-sonnet-5 without forcing thinking off', async () => {
      const provider = makeProviderForModel('claude-sonnet-5', 'high')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      const args = mockStream.mock.calls[mockStream.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toEqual({ effort: 'high' })
    })

    it('sends the selected effort on claude-opus-5', async () => {
      const provider = makeProviderForModel('claude-opus-5', 'max')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      const args = mockStream.mock.calls[mockStream.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toEqual({ effort: 'max' })
    })

    it('sends effort on claude-fable-5 (thinking cannot be disabled)', async () => {
      const provider = makeProviderForModel('claude-fable-5', 'low')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      const args = mockStream.mock.calls[mockStream.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toEqual({ effort: 'low' })
    })

    it('sends the selected effort on claude-opus-4-7', async () => {
      const provider = makeProviderForModel('claude-opus-4-7', 'high')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      const args = mockStream.mock.calls[mockStream.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toEqual({ effort: 'high' })
    })

    it('sends low effort on claude-opus-4-7 instead of omitting it', async () => {
      const provider = makeProviderForModel('claude-opus-4-7', 'low')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      const args = mockStream.mock.calls[mockStream.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toEqual({ effort: 'low' })
    })

    it('attaches no thinking params on haiku-4-5', async () => {
      const provider = makeProviderForModel('claude-haiku-4-5')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      const args = mockStream.mock.calls[mockStream.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toBeUndefined()
    })

    it('defaults stream max_tokens to the official model max (128k for Sonnet 5)', async () => {
      const provider = makeProviderForModel('claude-sonnet-5')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      expect(mockStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ max_tokens: 128000 })
      )
    })

    it('defaults stream max_tokens to 64k for Haiku 4.5', async () => {
      const provider = makeProviderForModel('claude-haiku-4-5')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      expect(mockStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ max_tokens: 64000 })
      )
    })

    it('does NOT attach thinking params to generateShort', async () => {
      const provider = new AnthropicProvider('test-ant-placeholder', 'claude-sonnet-5')
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'short answer' }],
      })
      await provider.generateShort({ prompt: 'one-liner please' })
      const args = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toBeUndefined()
      expect(args.max_tokens).toBe(60)
    })
  })
})
