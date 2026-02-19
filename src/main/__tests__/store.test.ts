import { vi, describe, it, expect } from 'vitest'

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

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
  },
  app: {
    getPath: vi.fn(() => '/tmp/raven-store-test'),
  },
}))

import { getSetting, saveSetting, getAllSettings, saveApiKeys } from '../store'

describe('store', () => {
  it('getSetting delegates to store.get', () => {
    mockGet.mockReturnValue('dark')

    expect(getSetting('theme')).toBe('dark')
    expect(mockGet).toHaveBeenCalledWith('theme')
  })

  it('saveSetting delegates to store.set', () => {
    saveSetting('theme', 'light')

    expect(mockSet).toHaveBeenCalledWith('theme', 'light')
  })

  it('getAllSettings returns all fields', () => {
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
      accessToken: null,
      refreshToken: null,
    }
    mockGet.mockImplementation((key: string) => fakeData[key])

    const settings = getAllSettings()

    expect(settings.mode).toBe('pro')
    expect(settings.theme).toBe('dark')
    expect(settings.deepgramApiKey).toBe('dg-key')
    expect(settings.anthropicApiKey).toBe('ant-key')
    expect(settings.apiKeysConfigured).toBe(true)
  })

  it('saveApiKeys sets all three fields', () => {
    saveApiKeys('dg-key', 'ant-key')

    expect(mockSet).toHaveBeenCalledWith('deepgramApiKey', 'dg-key')
    expect(mockSet).toHaveBeenCalledWith('anthropicApiKey', 'ant-key')
    expect(mockSet).toHaveBeenCalledWith('apiKeysConfigured', true)
  })
})
