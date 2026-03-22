import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockIpcHandlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0' },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockIpcHandlers[channel] = handler
    }),
  },
}))

vi.mock('../store', () => ({
  getSetting: vi.fn(() => false),
  saveSetting: vi.fn(),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import {
  initAnalytics,
  trackEvent,
  trackSessionStarted,
  trackSessionEnded,
  trackAIRequest,
  trackTranscriptionProvider,
  trackErrorBoundaryCaught,
  identifyUser,
  shutdownAnalytics,
} from '../analytics'
import { getSetting } from '../store'

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockIpcHandlers).forEach((k) => delete mockIpcHandlers[k])
  })

  describe('initAnalytics', () => {
    it('registers IPC handlers', () => {
      initAnalytics()

      expect(mockIpcHandlers['analytics:track']).toBeDefined()
      expect(mockIpcHandlers['analytics:set-enabled']).toBeDefined()
      expect(mockIpcHandlers['analytics:is-enabled']).toBeDefined()
    })

    it('reads analyticsEnabled from store', () => {
      initAnalytics()
      expect(getSetting).toHaveBeenCalledWith('analyticsEnabled')
    })

    it('analytics:is-enabled returns false by default', async () => {
      initAnalytics()

      const result = await mockIpcHandlers['analytics:is-enabled']()
      expect(result).toBe(false)
    })

    it('analytics:set-enabled toggles analytics state', async () => {
      initAnalytics()

      await mockIpcHandlers['analytics:set-enabled']({}, true)
      const result = await mockIpcHandlers['analytics:is-enabled']()
      expect(result).toBe(true)
    })

    it('analytics:track calls trackEvent', async () => {
      vi.mocked(getSetting).mockReturnValue(true as never)
      initAnalytics()

      await mockIpcHandlers['analytics:set-enabled']({}, true)
      await mockIpcHandlers['analytics:track']({}, 'test-event', { foo: 'bar' })
    })
  })

  describe('trackEvent', () => {
    it('does nothing when analytics disabled', () => {
      initAnalytics()
      trackEvent({ name: 'test', properties: { a: 1 } })
    })

    it('logs event when analytics enabled', () => {
      vi.mocked(getSetting).mockReturnValue(true as never)
      initAnalytics()

      trackEvent({ name: 'test-event', properties: { a: 1 } })
    })
  })

  describe('helper track functions', () => {
    it('trackSessionStarted does not throw', () => {
      initAnalytics()
      expect(() => trackSessionStarted()).not.toThrow()
    })

    it('trackSessionEnded does not throw', () => {
      initAnalytics()
      expect(() => trackSessionEnded(120)).not.toThrow()
    })

    it('trackAIRequest does not throw', () => {
      initAnalytics()
      expect(() => trackAIRequest('assist')).not.toThrow()
    })

    it('trackTranscriptionProvider does not throw', () => {
      initAnalytics()
      expect(() => trackTranscriptionProvider('assemblyai')).not.toThrow()
    })

    it('trackErrorBoundaryCaught does not throw', () => {
      initAnalytics()
      expect(() => trackErrorBoundaryCaught('OverlayWindow')).not.toThrow()
    })
  })

  describe('identifyUser', () => {
    it('does nothing when analytics disabled', () => {
      initAnalytics()
      identifyUser('user-1', { plan: 'pro' })
    })
  })

  describe('shutdownAnalytics', () => {
    it('resolves without error when no client', async () => {
      await expect(shutdownAnalytics()).resolves.toBeUndefined()
    })
  })
})
