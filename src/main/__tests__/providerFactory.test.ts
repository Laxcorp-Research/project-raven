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

import { getProvider, clearProviderCache, getProviderFromStore, getFastProvider, getMemoryProvider, getNotesProvider } from '../services/ai/providerFactory'
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
        apiKey: 'test-ant-placeholder',
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
        apiKey: 'test-ant-placeholder',
      }

      const first = getProvider(config)
      const second = getProvider(config)

      expect(first).toBe(second)
    })

    it('creates new instance when config changes', () => {
      const first = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: 'test-ant-placeholder',
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
        apiKey: 'test-ant-placeholder',
      })

      const second = getProvider({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        apiKey: 'test-ant-placeholder',
      })

      expect(first).not.toBe(second)
    })

    it('creates new instance when effort changes', () => {
      const first = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKey: 'test-ant-placeholder',
        effort: 'low',
      })

      const second = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKey: 'test-ant-placeholder',
        effort: 'max',
      })

      expect(first).not.toBe(second)
    })
  })

  describe('clearProviderCache', () => {
    it('forces re-creation on next getProvider call', () => {
      const config = {
        provider: 'anthropic' as const,
        model: 'claude-sonnet-4-6',
        apiKey: 'test-ant-placeholder',
      }

      const first = getProvider(config)
      clearProviderCache()
      const second = getProvider(config)

      expect(first).not.toBe(second)
    })
  })

  describe('getProviderFromStore', () => {
    it('reads anthropic config including effort from store', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          anthropicApiKey: 'test-ant-store-key',
        }
        return data[key] ?? defaultVal
      })

      const provider = await getProviderFromStore()

      expect(provider).toBeInstanceOf(AnthropicProvider)
      expect(provider.name).toBe('anthropic')
    })

    it('applies store aiEffort so Assist uses the Settings value', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-5',
          aiEffort: 'max',
          anthropicApiKey: 'test-ant-store-key',
        }
        return data[key] ?? defaultVal
      })

      const fromStore = await getProviderFromStore()
      const sameEffort = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKey: 'test-ant-store-key',
        effort: 'max',
      })
      const otherEffort = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKey: 'test-ant-store-key',
        effort: 'low',
      })

      expect(fromStore).toBe(sameEffort)
      expect(fromStore).not.toBe(otherEffort)
    })

    it('does not use notesModel — live assist stays on aiModel', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-haiku-4-5',
          notesProvider: 'anthropic',
          notesModel: 'claude-sonnet-5',
          anthropicApiKey: 'test-ant-store-key',
        }
        return data[key] ?? defaultVal
      })

      const fromStore = await getProviderFromStore()
      const asAssist = getProvider({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        apiKey: 'test-ant-store-key',
        effort: 'low',
      })
      const asNotes = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKey: 'test-ant-store-key',
        effort: 'low',
      })

      expect(fromStore).toBe(asAssist)
      expect(fromStore).not.toBe(asNotes)
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

  describe('getMemoryProvider', () => {
    it('returns anthropic Haiku when Live assist is Anthropic, ignoring aiModel', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          anthropicApiKey: 'test-ant-store-key',
        }
        return data[key] ?? defaultVal
      })

      const provider = await getMemoryProvider()
      const asHaiku = getProvider({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        apiKey: 'test-ant-store-key',
        effort: 'low',
      })

      expect(provider).toBeInstanceOf(AnthropicProvider)
      expect(provider).toBe(asHaiku)
    })

    it('returns OpenAI Luna when Live assist is OpenAI, ignoring aiModel', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'openai',
          aiModel: 'gpt-5.2',
          openaiApiKey: 'sk-openai-store-key',
        }
        return data[key] ?? defaultVal
      })

      const provider = await getMemoryProvider()
      const asLuna = getProvider({
        provider: 'openai',
        model: 'gpt-5.6-luna',
        apiKey: 'sk-openai-store-key',
        effort: 'low',
      })

      expect(provider).toBeInstanceOf(OpenAIProvider)
      expect(provider).toBe(asLuna)
    })

    it('does not use notesModel or notesProvider — memory is not a Settings slot', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-opus-5',
          notesProvider: 'openai',
          notesModel: 'gpt-5.2',
          notesEffort: 'max',
          anthropicApiKey: 'test-ant-key',
          openaiApiKey: 'sk-openai-notes-key',
        }
        return data[key] ?? defaultVal
      })

      const memory = await getMemoryProvider()
      const asHaiku = getProvider({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        apiKey: 'test-ant-key',
        effort: 'low',
      })
      const asNotes = getProvider({
        provider: 'openai',
        model: 'gpt-5.2',
        apiKey: 'sk-openai-notes-key',
        effort: 'max',
      })

      expect(memory).toBe(asHaiku)
      expect(memory).not.toBe(asNotes)
    })

    it('throws when no API key is configured for the Live assist vendor', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          anthropicApiKey: '',
        }
        return data[key] ?? defaultVal
      })

      await expect(getMemoryProvider()).rejects.toThrow(
        'No API key configured for anthropic. Add it in Settings.'
      )
    })

    it('getFastProvider is an alias of getMemoryProvider', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          anthropicApiKey: 'test-ant-key',
        }
        return data[key] ?? defaultVal
      })

      const memory = await getMemoryProvider()
      const fast = await getFastProvider()
      expect(fast).toBe(memory)
    })
  })

  describe('getNotesProvider', () => {
    it('falls back to FAST_MODELS when notesModel is unset, ignoring aiModel', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          anthropicApiKey: 'test-ant-key',
        }
        return data[key] ?? defaultVal
      })

      clearProviderCache()
      const notesProvider = await getNotesProvider()

      clearProviderCache()
      const storeProvider = await getProviderFromStore()

      expect(notesProvider).not.toBe(storeProvider)
    })

    it('uses notesModel when set, even if aiModel is a different catalog id', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-haiku-4-5',
          notesProvider: 'anthropic',
          notesModel: 'claude-sonnet-4-6',
          anthropicApiKey: 'test-ant-key',
        }
        return data[key] ?? defaultVal
      })

      const notes = await getNotesProvider()
      const asNotesModel = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        apiKey: 'test-ant-key',
        effort: 'low',
      })

      expect(notes).toBe(asNotesModel)
    })

    it('uses notesProvider when it differs from aiProvider', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-sonnet-4-6',
          notesProvider: 'openai',
          notesModel: 'gpt-5.6-luna',
          anthropicApiKey: 'test-ant-key',
          openaiApiKey: 'sk-openai-notes-key',
        }
        return data[key] ?? defaultVal
      })

      const provider = await getNotesProvider()

      expect(provider).toBeInstanceOf(OpenAIProvider)
      expect(provider.name).toBe('openai')
    })

    it('applies notesEffort so summaries use the Models tab value', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          aiModel: 'claude-haiku-4-5',
          notesProvider: 'anthropic',
          notesModel: 'claude-sonnet-5',
          notesEffort: 'max',
          anthropicApiKey: 'test-ant-key',
        }
        return data[key] ?? defaultVal
      })

      const notes = await getNotesProvider()
      const sameEffort = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKey: 'test-ant-key',
        effort: 'max',
      })
      const otherEffort = getProvider({
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        apiKey: 'test-ant-key',
        effort: 'low',
      })

      expect(notes).toBe(sameEffort)
      expect(notes).not.toBe(otherEffort)
    })

    it('throws when notesProvider is openai but no OpenAI key is configured', async () => {
      mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
        const data: Record<string, unknown> = {
          aiProvider: 'anthropic',
          notesProvider: 'openai',
          notesModel: 'gpt-5.6-luna',
          anthropicApiKey: 'test-ant-key',
          openaiApiKey: '',
        }
        return data[key] ?? defaultVal
      })

      await expect(getNotesProvider()).rejects.toThrow(
        'No API key configured for openai. Add it in Settings.'
      )
    })
  })
})
