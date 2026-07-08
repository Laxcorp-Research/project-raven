import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock electron because clientEvents.ts imports `app` and `ipcMain`
// at module top level - in a test environment we don't want either
// to do anything real.
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test' },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    },
  },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// vi.hoisted lets the spies survive vi.mock's hoist-to-top semantics.
// Without it, the mock factory below runs before the top-level `const`
// declarations and the closures it produces capture `undefined` for
// isAuthenticated etc., which manifested as flush() seeing
// isAuthenticated()=false even when the test mocked it to return true.
const { isProModeSpy, isAuthenticatedSpy, apiRequestSpy } = vi.hoisted(() => {
  return {
    isProModeSpy: vi.fn().mockReturnValue(false),
    isAuthenticatedSpy: vi.fn().mockReturnValue(false),
    apiRequestSpy: vi.fn().mockResolvedValue({ accepted: 0 }),
  }
})

vi.mock('../store', () => ({
  isProMode: () => isProModeSpy(),
}))

vi.mock('../../pro/main/authService', () => ({
  isAuthenticated: () => isAuthenticatedSpy(),
  _apiRequest: (path: string, init: RequestInit) => apiRequestSpy(path, init),
}))

import {
  trackEvent,
  _getBufferForTests,
  _resetForTests,
  _flushForTests,
} from '../services/clientEvents'

beforeEach(() => {
  vi.clearAllMocks()
  isProModeSpy.mockReturnValue(false)
  isAuthenticatedSpy.mockReturnValue(false)
  apiRequestSpy.mockResolvedValue({ accepted: 0 })
  _resetForTests()
  ipcHandlers.clear()
})

describe('clientEvents - trackEvent buffering contract', () => {
  // Regression test for the 2026-06-03 bug where renderer-fired
  // events (notably `onboarding_started` from Onboarding.tsx) were
  // silently dropped if they arrived at trackEvent during the brief
  // window between renderer-side auth completion and main-process
  // isProMode() flipping to true. The fix: trackEvent always
  // buffers; the gate moved to flush-time via isAuthenticated().
  //
  // This test would FAIL if someone re-adds the `if (!isProMode())
  // return` guard at the top of trackEvent.
  it('buffers the event even when isProMode() returns false at call time (post-auth-pre-store-propagation race)', () => {
    isProModeSpy.mockReturnValue(false)

    trackEvent('onboarding_started')

    const buffered = _getBufferForTests()
    expect(buffered).toHaveLength(1)
    expect(buffered[0]).toMatchObject({ name: 'onboarding_started' })
  })

  it('also buffers when isProMode() returns true (the happy path)', () => {
    isProModeSpy.mockReturnValue(true)

    trackEvent('app_launched', { metadata: { platform: 'darwin' } })

    const buffered = _getBufferForTests()
    expect(buffered).toHaveLength(1)
    expect(buffered[0]).toMatchObject({
      name: 'app_launched',
      metadata: { platform: 'darwin' },
    })
  })

  it('respects MAX_BUFFER (200) and FIFO-drops oldest when overflowing', () => {
    // Pump past the cap with a stable name. The exact MAX_BUFFER
    // value is hardcoded in clientEvents.ts; if it changes this
    // test will need to be updated, which is the intended forcing
    // function (a buffer cap is a memory-safety contract).
    isProModeSpy.mockReturnValue(true)

    for (let i = 0; i < 250; i++) {
      trackEvent('app_launched', { metadata: { idx: i } })
    }

    const buffered = _getBufferForTests()
    expect(buffered).toHaveLength(200)
    // Oldest 50 should have been evicted; newest should be at the
    // end.
    expect(buffered[0].metadata).toEqual({ idx: 50 })
    expect(buffered[199].metadata).toEqual({ idx: 249 })
  })

  it('passes through sessionId + metadata args verbatim into the buffered entry', () => {
    isProModeSpy.mockReturnValue(true)

    trackEvent('recording_started', {
      sessionId: 'sess-xyz',
      metadata: { reason: 'mic_unavailable', attemptNumber: 2 },
    })

    const buffered = _getBufferForTests()
    expect(buffered[0]).toEqual({
      name: 'recording_started',
      sessionId: 'sess-xyz',
      metadata: { reason: 'mic_unavailable', attemptNumber: 2 },
    })
  })
})

describe('clientEvents - flush() send-side guard removal (regression)', () => {
  // Regression test for the parallel half of the 2026-06-03 bug
  // class: flush() used to early-return on `!isProMode()` even
  // when there were buffered events to send. That meant a
  // transient false-flip during the post-auth-pre-store-propagation
  // window skipped a send cycle, deferring the event by up to
  // FLUSH_INTERVAL_MS at minimum and dropping it entirely if the
  // app quit before the next flush. The fix moves the gate to
  // the dynamic-import + isAuthenticated() pair below.
  //
  // We assert this STRUCTURALLY (against the source text) because
  // vi.mock can't reliably intercept the `/* @vite-ignore */`
  // dynamic import that flush() uses to load the pro authService -
  // a behavior-level test of flush() would either pass spuriously
  // when the mock misses or be brittle in unrelated ways.  A
  // grep-based check is unambiguous and would fail loudly the
  // moment someone re-adds `if (!isProMode()) return` anywhere in
  // flush().
  it('flush() source does not contain `if (!isProMode())` early-return', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sourcePath = path.resolve(__dirname, '../services/clientEvents.ts')
    // Normalize CRLF -> LF first. On a Windows (autocrlf) checkout the
    // per-line comment strip below splits on '\n', leaving a trailing
    // '\r' on each line; `/\/\/.*$/` then can't reach end-of-line
    // (`.` and `$` don't span `\r`), so the explanatory comment that
    // intentionally writes `if (!isProMode()) return` survives the
    // strip and false-trips the assertion. This check is about code,
    // not line endings.
    const src = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')

    // Slice out just the flush() function body so a re-added
    // isProMode guard elsewhere (e.g., legitimately in
    // initClientEvents) doesn't false-positive.
    const flushMatch = src.match(/async function flush\b[\s\S]+?^\}/m)
    expect(flushMatch).not.toBeNull()
    let flushBody = flushMatch![0]

    // Strip line comments + block comments before pattern-matching,
    // so the source can carry an explanatory comment that mentions
    // the bad pattern (as a "don't re-add this" warning) without the
    // test false-positiving on its own warning text.
    flushBody = flushBody.replace(/\/\*[\s\S]*?\*\//g, '')
    flushBody = flushBody
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')

    expect(flushBody).not.toMatch(/if\s*\(\s*!\s*isProMode\s*\(\s*\)\s*\)\s*return/)
  })
})
