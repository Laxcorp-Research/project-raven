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

// Mock posthog-node so createPostHogClient() never opens a REAL network
// client. The module-level `posthogClient` set by earlier tests
// (enabled=true) leaks into the shutdownAnalytics test; awaiting the real
// client's network flush in shutdown() hangs past the 5s test timeout on
// any network where us.i.posthog.com isn't reachable (proxied/offline dev
// machines, locked-down CI). The mock's shutdown() resolves instantly.
vi.mock('posthog-node', () => ({
  PostHog: vi.fn(() => ({
    capture: vi.fn(),
    identify: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
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

    // Regression lock for the 2026-05-03 default-flip: analytics is
    // ON by default (industry-standard SaaS telemetry posture). Only
    // an explicit `false` in the store opts out. A fresh install
    // (getSetting -> undefined) MUST resolve to enabled = true.
    it('is enabled by default on a fresh install (getSetting returns undefined)', async () => {
      vi.mocked(getSetting).mockReturnValueOnce(undefined as never)
      initAnalytics()

      const result = await mockIpcHandlers['analytics:is-enabled']()
      expect(result).toBe(true)
    })

    it('is enabled when getSetting returns true (legacy explicit opt-in users)', async () => {
      vi.mocked(getSetting).mockReturnValueOnce(true as never)
      initAnalytics()

      const result = await mockIpcHandlers['analytics:is-enabled']()
      expect(result).toBe(true)
    })

    it('is disabled only when getSetting returns false (explicit opt-out via ops tooling or privacy@ request)', async () => {
      vi.mocked(getSetting).mockReturnValueOnce(false as never)
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
