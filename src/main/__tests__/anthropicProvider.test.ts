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

  describe('adaptive thinking wiring (Opus 4.7 + xhigh effort)', () => {
    function makeProviderForModel(model: string): AnthropicProvider {
      const provider = new AnthropicProvider('test-ant-placeholder', model)
      const noopStream = {
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockResolvedValue({}),
      }
      mockStream.mockReturnValueOnce(noopStream)
      return provider
    }

    it('attaches thinking + xhigh output_config on claude-opus-4-7', async () => {
      const provider = makeProviderForModel('claude-opus-4-7')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      // Locks in the contract: thinking is required on Opus 4.7 (manual
      // `enabled` is rejected with 400) and xhigh effort is exclusive to
      // Opus 4.7 for coding/agentic workloads.
      expect(mockStream).toHaveBeenLastCalledWith(
        expect.objectContaining({
          model: 'claude-opus-4-7',
          thinking: { type: 'adaptive' },
          output_config: { effort: 'xhigh' },
        })
      )
    })

    it('attaches thinking but NOT xhigh on claude-sonnet-4-6 (xhigh is 4.7-only)', async () => {
      const provider = makeProviderForModel('claude-sonnet-4-6')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      const args = mockStream.mock.calls[mockStream.mock.calls.length - 1][0]
      expect(args.thinking).toEqual({ type: 'adaptive' })
      // xhigh on Sonnet 4.6 returns 400; if a future provider revision starts
      // sending it, this assertion will fail and force a deliberate review.
      expect(args.output_config).toBeUndefined()
    })

    it('attaches no thinking params on non-thinking models (e.g. haiku-4-5)', async () => {
      const provider = makeProviderForModel('claude-haiku-4-5')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      const args = mockStream.mock.calls[mockStream.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toBeUndefined()
    })

    it('bumps default max_tokens to 16384 on thinking-capable models', async () => {
      const provider = makeProviderForModel('claude-opus-4-7')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      // Adaptive thinking emits reasoning blocks BEFORE the final answer.
      // 1024 (the old default) gets truncated on hard problems; this lift
      // is what makes the Coding Interview mode actually return full code.
      expect(mockStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ max_tokens: 16384 })
      )
    })

    it('keeps default max_tokens at 1024 on non-thinking models', async () => {
      const provider = makeProviderForModel('claude-haiku-4-5')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      expect(mockStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ max_tokens: 1024 })
      )
    })

    it('respects caller-supplied maxTokens on thinking models', async () => {
      const provider = makeProviderForModel('claude-opus-4-7')
      await provider.streamResponse(
        { system: 'sys', messages: [{ role: 'user', content: 'hi' }], maxTokens: 32768 },
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      )
      expect(mockStream).toHaveBeenLastCalledWith(
        expect.objectContaining({ max_tokens: 32768 })
      )
    })

    it('does NOT attach thinking params to generateShort even on Opus 4.7', async () => {
      const provider = new AnthropicProvider('test-ant-placeholder', 'claude-opus-4-7')
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'short answer' }],
      })
      await provider.generateShort({ prompt: 'one-liner please' })
      // generateShort is for titles / summaries (60-token cap). Thinking
      // would dominate the response and waste tokens; the path is
      // deliberately non-thinking.
      const args = mockCreate.mock.calls[mockCreate.mock.calls.length - 1][0]
      expect(args.thinking).toBeUndefined()
      expect(args.output_config).toBeUndefined()
      expect(args.max_tokens).toBe(60)
    })
  })
})
