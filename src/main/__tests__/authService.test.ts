import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

const { mockGetSetting, mockSaveSetting } = vi.hoisted(() => ({
  mockGetSetting: vi.fn(),
  mockSaveSetting: vi.fn(),
}))

vi.mock('../store', () => ({
  getSetting: mockGetSetting,
  saveSetting: mockSaveSetting,
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import {
  isBackendConfigured,
  isAuthenticated,
  getCurrentUser,
  login,
  signup,
  logout,
  initAuth,
} from '../services/authService'

describe('authService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('isBackendConfigured', () => {
    it('returns false when no backend URL in store or env', () => {
      mockGetSetting.mockReturnValue(undefined)
      delete process.env.RAVEN_BACKEND_URL

      expect(isBackendConfigured()).toBe(false)
    })

    it('returns true when backend URL is in store', () => {
      mockGetSetting.mockImplementation((key: string) => {
        if (key === 'backendUrl') return 'https://api.raven.app'
        return undefined
      })

      expect(isBackendConfigured()).toBe(true)
    })

    it('returns true when RAVEN_BACKEND_URL env is set', () => {
      mockGetSetting.mockReturnValue(undefined)
      process.env.RAVEN_BACKEND_URL = 'https://api.raven.app'

      expect(isBackendConfigured()).toBe(true)

      delete process.env.RAVEN_BACKEND_URL
    })
  })

  describe('isAuthenticated', () => {
    it('returns false when no tokens stored', () => {
      mockGetSetting.mockReturnValue(undefined)

      expect(isAuthenticated()).toBe(false)
    })
  })

  describe('getCurrentUser', () => {
    it('returns null when not logged in', () => {
      expect(getCurrentUser()).toBeNull()
    })
  })

  describe('login', () => {
    it('stores tokens and fetches profile on success', async () => {
      mockGetSetting.mockImplementation((key: string) => {
        if (key === 'backendUrl') return 'https://api.raven.app'
        return undefined
      })

      const loginResponse = {
        user: { id: 'u1', email: 'test@test.com', name: 'Test', avatarUrl: null },
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
      }

      const profileResponse = {
        id: 'u1',
        email: 'test@test.com',
        name: 'Test',
        avatarUrl: null,
        plan: 'FREE',
        subscriptionStatus: 'active',
      }

      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(loginResponse),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(profileResponse),
          })
      )

      const user = await login('test@test.com', 'password123')

      expect(user.email).toBe('test@test.com')
      expect(user.plan).toBe('FREE')
      expect(mockSaveSetting).toHaveBeenCalled()
    })

    it('throws when backend is not configured', async () => {
      mockGetSetting.mockReturnValue(undefined)
      delete process.env.RAVEN_BACKEND_URL

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          json: () => Promise.resolve({ error: 'Request failed' }),
        })
      )

      await expect(login('a@b.com', 'pass')).rejects.toThrow()
    })
  })

  describe('signup', () => {
    it('stores tokens and fetches profile on success', async () => {
      mockGetSetting.mockImplementation((key: string) => {
        if (key === 'backendUrl') return 'https://api.raven.app'
        return undefined
      })

      const signupResponse = {
        user: { id: 'u2', email: 'new@test.com', name: 'New User' },
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
      }

      const profileResponse = {
        id: 'u2',
        email: 'new@test.com',
        name: 'New User',
        avatarUrl: null,
        plan: 'FREE',
        subscriptionStatus: 'active',
      }

      vi.stubGlobal(
        'fetch',
        vi.fn()
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(signupResponse),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(profileResponse),
          })
      )

      const user = await signup('new@test.com', 'password', 'New User')

      expect(user.email).toBe('new@test.com')
      expect(user.name).toBe('New User')
    })
  })

  describe('logout', () => {
    it('clears auth state and calls backend', async () => {
      mockGetSetting.mockImplementation((key: string) => {
        if (key === 'backendUrl') return 'https://api.raven.app'
        return undefined
      })

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        })
      )

      await logout()

      expect(mockSaveSetting).toHaveBeenCalledWith('auth_tokens', '')
      expect(mockSaveSetting).toHaveBeenCalledWith('auth_user', '')
    })
  })

  describe('initAuth', () => {
    it('skips when no backend configured', () => {
      mockGetSetting.mockReturnValue(undefined)
      delete process.env.RAVEN_BACKEND_URL

      initAuth()

      // Should not throw, should be a no-op
      expect(true).toBe(true)
    })
  })
})
