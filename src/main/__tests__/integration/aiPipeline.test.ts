/**
 * Integration test: Store config -> ProviderFactory -> AI Provider -> generateShort
 *
 * Tests the exact code path that caused the "No API key configured" bug
 * when new Store() was used instead of getStore().
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockStoreGet, mockAnthropicCreate, mockOpenAICreate } = vi.hoisted(() => ({
  mockStoreGet: vi.fn(),
  mockAnthropicCreate: vi.fn(),
  mockOpenAICreate: vi.fn(),
}))

vi.mock('../../store', () => ({
  getStore: vi.fn(() => ({
    get: mockStoreGet,
  })),
  getSetting: vi.fn((key: string) => mockStoreGet(key)),
  getApiKey: vi.fn((key: string) => mockStoreGet(key, '')),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: mockAnthropicCreate } }
  }),
}))

vi.mock('openai', () => ({
  default: vi.fn(function () {
    return {
      chat: {
        completions: { create: mockOpenAICreate },
      },
    }
  }),
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { clearProviderCache, getProviderFromStore } from '../../services/ai/providerFactory'

describe('AI Pipeline Integration', () => {
  beforeEach(() => {
    clearProviderCache()
  })

  it('reads Anthropic config from store and generates text end-to-end', async () => {
    mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
      const data: Record<string, unknown> = {
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-6',
        anthropicApiKey: 'test-ant-integration',
      }
      return data[key] ?? defaultVal
    })

    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Integration test response' }],
    })

    const provider = await getProviderFromStore()
    const result = await provider.generateShort({
      system: 'Be brief',
      prompt: 'Say hello',
    })

    expect(result).toBe('Integration test response')
    expect(provider.name).toBe('anthropic')
  })

  it('reads OpenAI config from store and generates text end-to-end', async () => {
    mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
      const data: Record<string, unknown> = {
        aiProvider: 'openai',
        aiModel: 'gpt-5.2',
        openaiApiKey: 'sk-openai-integration-test',
      }
      return data[key] ?? defaultVal
    })

    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'OpenAI integration response' } }],
    })

    const provider = await getProviderFromStore()
    const result = await provider.generateShort({
      prompt: 'Say hello',
    })

    expect(result).toBe('OpenAI integration response')
    expect(provider.name).toBe('openai')
  })

  it('switching provider in store after cache clear uses new provider', async () => {
    // First: Anthropic
    mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
      const data: Record<string, unknown> = {
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-6',
        anthropicApiKey: 'test-ant-key',
      }
      return data[key] ?? defaultVal
    })

    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'From Claude' }],
    })

    const provider1 = await getProviderFromStore()
    const result1 = await provider1.generateShort({ prompt: 'Test' })
    expect(result1).toBe('From Claude')
    expect(provider1.name).toBe('anthropic')

    // Switch to OpenAI
    clearProviderCache()
    mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
      const data: Record<string, unknown> = {
        aiProvider: 'openai',
        aiModel: 'gpt-5.2',
        openaiApiKey: 'sk-openai-key',
      }
      return data[key] ?? defaultVal
    })

    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'From GPT' } }],
    })

    const provider2 = await getProviderFromStore()
    const result2 = await provider2.generateShort({ prompt: 'Test' })
    expect(result2).toBe('From GPT')
    expect(provider2.name).toBe('openai')
  })

  it('throws descriptive error when API key is missing from store', async () => {
    mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
      const data: Record<string, unknown> = {
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-6',
        anthropicApiKey: '',
      }
      return data[key] ?? defaultVal
    })

    await expect(getProviderFromStore()).rejects.toThrow(
      'No API key configured for anthropic'
    )
  })

  it('caches provider across multiple getProviderFromStore calls', async () => {
    mockStoreGet.mockImplementation((key: string, defaultVal?: unknown) => {
      const data: Record<string, unknown> = {
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-6',
        anthropicApiKey: 'test-ant-key',
      }
      return data[key] ?? defaultVal
    })

    const provider1 = await getProviderFromStore()
    const provider2 = await getProviderFromStore()

    expect(provider1).toBe(provider2)
  })
})
