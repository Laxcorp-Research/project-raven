import { describe, it, expect, vi, afterEach } from 'vitest'
import type { BrowserWindow } from 'electron'
import { applyOverlayToolWindowStyle } from '../windowsOverlayStyle'

// Logger is noisy and irrelevant here; silence it.
vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('applyOverlayToolWindowStyle (issue #7: keep the focusable overlay out of Alt-Tab)', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  it('is a no-op on non-Windows and never touches the window', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    const getNativeWindowHandle = vi.fn()
    const win = { getNativeWindowHandle } as unknown as BrowserWindow

    expect(applyOverlayToolWindowStyle(win)).toBe(false)
    // Must not even attempt native work off-Windows.
    expect(getNativeWindowHandle).not.toHaveBeenCalled()
  })

  it('never throws on Windows regardless of native-module availability (returns a boolean)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    const win = {
      getNativeWindowHandle: () => Buffer.alloc(8),
    } as unknown as BrowserWindow

    // Whether the .node is missing, an older build without the function, or a
    // current build invoked with a zero handle, the contract is the same:
    // best-effort, no throw, boolean result. It must never block overlay
    // creation.
    expect(() => applyOverlayToolWindowStyle(win)).not.toThrow()
    expect(typeof applyOverlayToolWindowStyle(win)).toBe('boolean')
  })
})
