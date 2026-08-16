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

import {
  initSentry,
  captureException,
  captureMessage,
  addBreadcrumb,
  isSentryInitialized,
  _isShutdownRaceError,
} from '../sentry'

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

  it('captureMessage does not throw when not initialized', () => {
    expect(() => captureMessage('test message')).not.toThrow()
    expect(() =>
      captureMessage('with opts', { level: 'warning', tags: { kind: 'auth' } }),
    ).not.toThrow()
  })

  it('addBreadcrumb does not throw when not initialized', () => {
    expect(() => addBreadcrumb('auth', 'refresh-attempt')).not.toThrow()
    expect(() =>
      addBreadcrumb('auth', 'refresh-attempt', { attempt: 1 }, 'warning'),
    ).not.toThrow()
  })

  // Regression coverage for Sentry issue 26944317 from the v2.2.1
  // install on 2026-05-08: a TCP socket write completed late, after
  // app.before-quit had fired and the owning code already returned,
  // surfacing as `Error: write EPIPE` with all-internal Node frames
  // (net.Socket._writeGeneric -> writable.doWrite -> stream_base
  // afterWriteDispatched). Our process.uncaughtException handler
  // forwarded it to Sentry. The fix is a guarded suppression: only
  // EPIPE/ECONNRESET/EPROTO, only during the quit window. Same
  // errors OUTSIDE the quit window are real network failures and
  // must still reach Sentry.
  describe('_isShutdownRaceError (Sentry issue 26944317 quit-time EPIPE suppression)', () => {
    it('suppresses EPIPE during quit (the actual shutdown-race)', () => {
      const err = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
      expect(_isShutdownRaceError(err, true)).toBe(true)
    })

    it('suppresses ECONNRESET during quit (sibling teardown-race code)', () => {
      const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
      expect(_isShutdownRaceError(err, true)).toBe(true)
    })

    it('suppresses EPROTO during quit (TLS-layer teardown variant)', () => {
      const err = Object.assign(new Error('write EPROTO'), { code: 'EPROTO' })
      expect(_isShutdownRaceError(err, true)).toBe(true)
    })

    it('falls back to the error message when .code is missing (third-party errors that wrap Node net codes in their text)', () => {
      const err = new Error('write EPIPE') // no .code
      expect(_isShutdownRaceError(err, true)).toBe(true)
    })

    it('does NOT suppress EPIPE OUTSIDE the quit window (legit runtime failure on a long-lived socket; should reach Sentry)', () => {
      const err = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
      expect(_isShutdownRaceError(err, false)).toBe(false)
    })

    it('does NOT suppress unrelated network errors during quit (DNS / timeout - those ARE real bugs we want to know about)', () => {
      const dns = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
      const timeout = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' })
      expect(_isShutdownRaceError(dns, true)).toBe(false)
      expect(_isShutdownRaceError(timeout, true)).toBe(false)
    })

    it('does NOT suppress non-network errors during quit (TypeError, ReferenceError, etc. - quit-time bugs are still bugs)', () => {
      const tpe = new TypeError("Cannot read properties of undefined (reading 'foo')")
      const ref = new ReferenceError('bar is not defined')
      expect(_isShutdownRaceError(tpe, true)).toBe(false)
      expect(_isShutdownRaceError(ref, true)).toBe(false)
    })

    it('handles plain-string and null/undefined rejections without throwing (process.unhandledRejection can fire with non-Error values)', () => {
      expect(_isShutdownRaceError('write EPIPE', true)).toBe(true)
      expect(_isShutdownRaceError('user-cancelled flow', true)).toBe(false)
      expect(_isShutdownRaceError(null, true)).toBe(false)
      expect(_isShutdownRaceError(undefined, true)).toBe(false)
    })

    it('does NOT match codes that contain EPIPE as a substring of a longer identifier (defends against false positives like SOMETHING_EPIPELY_NAMED)', () => {
      // \bEPIPE\b in the regex enforces word-boundary on both sides.
      const err = Object.assign(new Error('SOMEEPIPETHING'), { code: 'SOMEEPIPETHING' })
      expect(_isShutdownRaceError(err, true)).toBe(false)
    })
  })
})
