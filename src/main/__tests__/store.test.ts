import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGet, mockSet, mockClear } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSet: vi.fn(),
  mockClear: vi.fn(),
}))

vi.mock('electron-store', () => ({
  default: vi.fn(function () {
    return {
      get: mockGet,
      set: mockSet,
      clear: mockClear,
    }
  }),
}))

const mockIsEncryptionAvailable = vi.hoisted(() => vi.fn(() => false))
const mockEncryptString = vi.hoisted(() => vi.fn((val: string) => Buffer.from(`enc-${val}`)))
const mockDecryptString = vi.hoisted(() => vi.fn((buf: Buffer) => buf.toString().replace('enc-', '')))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString,
  },
  app: {
    getPath: vi.fn(() => '/tmp/raven-store-test'),
  },
}))

import {
  getSetting,
  saveSetting,
  getAllSettings,
  saveApiKeys,
  saveSettings,
  hasApiKeys,
  clearApiKeys,
  isFreeMode,
  isProMode,
  resetAll,
  getApiKey,
  getStore,
} from '../store'

describe('store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEncryptionAvailable.mockReturnValue(false)
  })

  describe('getStore', () => {
    it('returns the store instance', () => {
      const store = getStore()
      expect(store).toBeDefined()
      expect(store.get).toBeDefined()
    })
  })

  describe('getSetting', () => {
    it('delegates to store.get for non-API-key fields', () => {
      mockGet.mockReturnValue('dark')

      expect(getSetting('theme')).toBe('dark')
      expect(mockGet).toHaveBeenCalledWith('theme')
    })

    it('decrypts API key fields', () => {
      mockGet.mockReturnValue('raw-encrypted-val')
      mockIsEncryptionAvailable.mockReturnValue(false)

      const result = getSetting('deepgramApiKey')
      expect(result).toBe('raw-encrypted-val')
    })

    it('decrypts API keys with safeStorage when available', () => {
      mockIsEncryptionAvailable.mockReturnValue(true)
      const encrypted = Buffer.from('test-key').toString('base64')
      mockGet.mockReturnValue(encrypted)
      mockDecryptString.mockReturnValue('test-key')

      const result = getSetting('deepgramApiKey')
      expect(result).toBe('test-key')
    })
  })

  describe('saveSetting', () => {
    it('delegates to store.set for non-API-key fields', () => {
      saveSetting('theme', 'light')

      expect(mockSet).toHaveBeenCalledWith('theme', 'light')
    })

    it('encrypts API key fields when safeStorage available', () => {
      mockIsEncryptionAvailable.mockReturnValue(true)

      saveSetting('deepgramApiKey', 'dg-key-123')

      expect(mockEncryptString).toHaveBeenCalledWith('dg-key-123')
      expect(mockSet).toHaveBeenCalledWith('deepgramApiKey', expect.any(String))
    })

    it('stores API key as-is when safeStorage unavailable', () => {
      mockIsEncryptionAvailable.mockReturnValue(false)

      saveSetting('anthropicApiKey', 'ant-key-123')

      expect(mockSet).toHaveBeenCalledWith('anthropicApiKey', 'ant-key-123')
    })
  })

  describe('saveSettings', () => {
    it('sets multiple settings at once', () => {
      saveSettings({ theme: 'dark', stealthEnabled: true })

      expect(mockSet).toHaveBeenCalledWith('theme', 'dark')
      expect(mockSet).toHaveBeenCalledWith('stealthEnabled', true)
    })
  })

  describe('getAllSettings', () => {
    it('returns all fields', () => {
      const fakeData: Record<string, unknown> = {
        mode: 'pro',
        theme: 'dark',
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        apiKeysConfigured: true,
        onboardingComplete: false,
        dashboardBounds: null,
        overlayBounds: null,
        stealthEnabled: true,
        openOnLogin: false,
        transcriptionLanguage: 'en',
        outputLanguage: 'en',
        aiProvider: 'anthropic',
        aiModel: 'claude-sonnet-4-6',
        openaiApiKey: '',
        activeModeId: null,
        displayName: '',
        profilePicturePath: '',
        proOnboardingComplete: false,
        proOnboardingStep: '',
        cachedUserProfile: null,
        cachedSubscription: null,
      }
      mockGet.mockImplementation((key: string) => fakeData[key])

      const settings = getAllSettings()

      expect(settings.mode).toBe('pro')
      expect(settings.theme).toBe('dark')
      expect(settings.apiKeysConfigured).toBe(true)
    })
  })

  describe('saveApiKeys', () => {
    it('saves deepgram and anthropic keys', () => {
      saveApiKeys('dg-key', 'ant-key')

      expect(mockSet).toHaveBeenCalledWith('deepgramApiKey', 'dg-key')
      expect(mockSet).toHaveBeenCalledWith('anthropicApiKey', 'ant-key')
      expect(mockSet).toHaveBeenCalledWith('apiKeysConfigured', true)
    })

    it('saves optional openai key', () => {
      saveApiKeys('dg-key', 'ant-key', 'openai-key')

      expect(mockSet).toHaveBeenCalledWith('openaiApiKey', 'openai-key')
    })

    it('does not set openai key when undefined', () => {
      saveApiKeys('dg-key', 'ant-key')

      const openaiCall = mockSet.mock.calls.find(
        (c: unknown[]) => c[0] === 'openaiApiKey',
      )
      expect(openaiCall).toBeUndefined()
    })

    it('encrypts keys when safeStorage available', () => {
      mockIsEncryptionAvailable.mockReturnValue(true)

      saveApiKeys('dg-key', 'ant-key')

      expect(mockEncryptString).toHaveBeenCalled()
    })
  })

  describe('hasApiKeys', () => {
    it('returns true when deepgram and anthropic keys exist', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'deepgramApiKey') return 'dg-key'
        if (key === 'anthropicApiKey') return 'ant-key'
        if (key === 'aiProvider') return 'anthropic'
        return ''
      })

      expect(hasApiKeys()).toBe(true)
    })

    it('returns false when deepgram key missing', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'anthropicApiKey') return 'ant-key'
        if (key === 'aiProvider') return 'anthropic'
        return ''
      })

      expect(hasApiKeys()).toBe(false)
    })

    it('checks openai key when aiProvider is openai', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'deepgramApiKey') return 'dg-key'
        if (key === 'openaiApiKey') return 'openai-key'
        if (key === 'aiProvider') return 'openai'
        return ''
      })

      expect(hasApiKeys()).toBe(true)
    })

    it('returns false when openai key missing and aiProvider is openai', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'deepgramApiKey') return 'dg-key'
        if (key === 'aiProvider') return 'openai'
        return ''
      })

      expect(hasApiKeys()).toBe(false)
    })
  })

  describe('clearApiKeys', () => {
    it('clears all API keys and sets apiKeysConfigured to false', () => {
      clearApiKeys()

      expect(mockSet).toHaveBeenCalledWith('deepgramApiKey', '')
      expect(mockSet).toHaveBeenCalledWith('anthropicApiKey', '')
      expect(mockSet).toHaveBeenCalledWith('openaiApiKey', '')
      expect(mockSet).toHaveBeenCalledWith('apiKeysConfigured', false)
    })
  })

  describe('isFreeMode / isProMode', () => {
    it('isFreeMode returns true when mode is free', () => {
      mockGet.mockReturnValue('free')
      expect(isFreeMode()).toBe(true)
    })

    it('isFreeMode returns false when mode is pro', () => {
      mockGet.mockReturnValue('pro')
      expect(isFreeMode()).toBe(false)
    })

    it('isProMode returns true when mode is pro', () => {
      mockGet.mockReturnValue('pro')
      expect(isProMode()).toBe(true)
    })

    it('isProMode returns false when mode is free', () => {
      mockGet.mockReturnValue('free')
      expect(isProMode()).toBe(false)
    })
  })

  describe('resetAll', () => {
    it('clears all store data', () => {
      resetAll()
      expect(mockClear).toHaveBeenCalled()
    })
  })

  describe('getApiKey', () => {
    it('returns decrypted value when safeStorage available', () => {
      mockIsEncryptionAvailable.mockReturnValue(true)
      const encrypted = Buffer.from('my-key').toString('base64')
      mockGet.mockReturnValue(encrypted)
      mockDecryptString.mockReturnValue('my-key')

      const result = getApiKey('deepgramApiKey')
      expect(result).toBe('my-key')
    })

    it('returns raw value when safeStorage unavailable', () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      mockGet.mockReturnValue('raw-key')

      const result = getApiKey('anthropicApiKey')
      expect(result).toBe('raw-key')
    })

    it('returns empty string for empty stored value', () => {
      mockGet.mockReturnValue('')

      const result = getApiKey('openaiApiKey')
      expect(result).toBe('')
    })
  })
})
