import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockStoreGet } = vi.hoisted(() => ({
  mockStoreGet: vi.fn(),
}))

vi.mock('../../main/store', () => ({
  getStore: vi.fn(() => ({
    get: mockStoreGet,
  })),
  getSetting: vi.fn((key: string) => mockStoreGet(key)),
  getApiKey: vi.fn((key: string) => mockStoreGet(key, '')),
}))

vi.mock('../../main/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { getProvider, clearProviderCache, getProviderFromStore, getFastProvider } from '../services/ai/providerFactory'
import { AnthropicProvider } from '../services/ai/anthropicProvider'
import { OpenAIProvider } from '../services/ai/openaiProvider'

describe('providerFactory', () => {
  beforeEach(() => {
    clearProviderCache()
  })

  describe('getProvider', () => {
    it('creates AnthropicProvider for anthropic config', () => {
      const provider = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      })

      expect(provider).toBeInstanceOf(AnthropicProvider)
      expect(provider.name).toBe('anthropic')
    })

    it('creates OpenAIProvider for openai config', () => {
      const provider = getProvider({
        provider: 'openai',
        model: 'gpt-5.2',
        apiKey: 'sk-openai-test',
      })

      expect(provider).toBeInstanceOf(OpenAIProvider)
      expect(provider.name).toBe('openai')
    })

    it('throws for unknown provider', () => {
      expect(() =>
        getProvider({
          provider: 'gemini' as any,
          model: 'gemini-pro',
          apiKey: 'key',
        })
      ).toThrow('Unknown AI provider: gemini')
    })

    it('returns cached instance for same config', () => {
      const config = {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      }

      const first = getProvider(config)
      const second = getProvider(config)

      expect(first).toBe(second)
    })

    it('creates new instance when config changes', () => {
      const first = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      })

      const second = getProvider({
        provider: 'openai',
        model: 'gpt-5.2',
        apiKey: 'sk-openai-test',
      })

      expect(first).not.toBe(second)
      expect(first.name).toBe('anthropic')
      expect(second.name).toBe('openai')
    })

    it('creates new instance when model changes', () => {
      const first = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      })

      const second = getProvider({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        apiKey: 'sk-ant-test',
      })

      expect(first).not.toBe(second)
    })
  })

  describe('clearProviderCache', () => {
    it('forces re-creation on next getProvider call', () => {
      const config = {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-6',
        apiKey: 'sk-ant-test',
      }

      const first = getProvider(config)
      clearProviderCache()
      const second = getProvider(config)

      expect(first).not.toBe(second)
    })
  })

  describe('getProviderFromStore', () => {
    it('reads anthropic config from store and returns provider', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          anthropicApiKey: 'sk-ant-store-key',
        }
        return data[key] ?? defaultVal
      })

      const provider = await getProviderFromStore()

      expect(provider).toBeInstanceOf(AnthropicProvider)
      expect(provider.name).toBe('anthropic')
    })

    it('reads openai config from store and returns provider', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'openai',
          aiModel: 'gpt-5.2',
          openaiApiKey: 'sk-openai-store-key',
        }
        return data[key] ?? defaultVal
      })

      const provider = await getProviderFromStore()

      expect(provider).toBeInstanceOf(OpenAIProvider)
      expect(provider.name).toBe('openai')
    })

    it('throws when no API key is configured for anthropic', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          anthropicApiKey: '',
        }
        return data[key] ?? defaultVal
      })

      await expect(getProviderFromStore()).rejects.toThrow(
        'No API key configured for anthropic. Add it in Settings.'
      )
    })

    it('throws when no API key is configured for openai', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'openai',
          aiModel: 'gpt-5.2',
          openaiApiKey: '',
        }
        return data[key] ?? defaultVal
      })

      await expect(getProviderFromStore()).rejects.toThrow(
        'No API key configured for openai. Add it in Settings.'
      )
    })
  })

  describe('getFastProvider', () => {
    it('returns anthropic provider with fast model (claude-haiku-4-5)', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          anthropicApiKey: 'sk-ant-store-key',
        }
        return data[key] ?? defaultVal
      })

      const provider = await getFastProvider()

      expect(provider).toBeInstanceOf(AnthropicProvider)
      expect(provider.name).toBe('anthropic')
    })

    it('returns openai provider with fast model (gpt-5-mini)', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'openai',
          aiModel: 'gpt-5.2',
          openaiApiKey: 'sk-openai-store-key',
        }
        return data[key] ?? defaultVal
      })

      const provider = await getFastProvider()

      expect(provider).toBeInstanceOf(OpenAIProvider)
      expect(provider.name).toBe('openai')
    })

    it('uses fast model regardless of store aiModel setting', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          anthropicApiKey: 'sk-ant-key',
        }
        return data[key] ?? defaultVal
      })

      clearProviderCache()
      const fastProvider = await getFastProvider()

      clearProviderCache()
      const storeProvider = await getProviderFromStore()

      expect(fastProvider).not.toBe(storeProvider)
    })

    it('throws when no API key is configured', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          anthropicApiKey: '',
        }
        return data[key] ?? defaultVal
      })

      await expect(getFastProvider()).rejects.toThrow(
        'No API key configured for anthropic. Add it in Settings.'
      )
    })
  })
})
