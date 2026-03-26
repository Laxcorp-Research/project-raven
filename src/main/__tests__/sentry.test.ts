import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { initSentry, captureException, isSentryInitialized } from '../sentry'

describe('sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initSentry does not throw when DSN is empty', () => {
    expect(() => initSentry()).not.toThrow()
  })

  it('isSentryInitialized returns false when DSN is empty', () => {
    initSentry()
    expect(isSentryInitialized()).toBe(false)
  })

  it('captureException does not throw when not initialized', () => {
    expect(() => captureException(new Error('test'))).not.toThrow()
  })
})
