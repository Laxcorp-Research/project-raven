import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  systemPreferences: { getMediaAccessStatus: vi.fn() },
}))

vi.mock('../store', () => ({
  getSetting: vi.fn(() => true),
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
  evaluateWindowsCaptureStart,
  evaluateWindowsCaptureStop,
  shouldNotifyWindowsCaptureDeath,
} from '../systemAudioNative'

describe('evaluateWindowsCaptureStart', () => {
  it('fails and asks to stop system capture when mic did not start', () => {
    expect(evaluateWindowsCaptureStart({ micStarted: false, systemStarted: true })).toEqual({
      ok: false,
      stopSystem: true,
    })
  })

  it('fails with nothing to roll back when both failed', () => {
    expect(evaluateWindowsCaptureStart({ micStarted: false, systemStarted: false })).toEqual({
      ok: false,
      stopSystem: false,
    })
  })

  it('succeeds when mic started even if system loopback failed', () => {
    expect(evaluateWindowsCaptureStart({ micStarted: true, systemStarted: false })).toEqual({
      ok: true,
      stopSystem: false,
    })
  })
})

describe('evaluateWindowsCaptureStop', () => {
  it('treats a mic-only stop as success (system was never started)', () => {
    expect(evaluateWindowsCaptureStop({ systemStopped: false, micStopped: true })).toBe(true)
  })

  it('fails only when neither stream stopped', () => {
    expect(evaluateWindowsCaptureStop({ systemStopped: false, micStopped: false })).toBe(false)
  })
})

describe('shouldNotifyWindowsCaptureDeath', () => {
  it('notifies when system loopback was running and isCapturing flips false', () => {
    expect(shouldNotifyWindowsCaptureDeath({
      systemWasStarted: true,
      expectingStop: false,
      isStillCapturing: false,
    })).toBe(true)
  })

  it('does not notify on a user stop', () => {
    expect(shouldNotifyWindowsCaptureDeath({
      systemWasStarted: true,
      expectingStop: true,
      isStillCapturing: false,
    })).toBe(false)
  })

  it('does not notify for mic-only sessions (no system thread to poll)', () => {
    expect(shouldNotifyWindowsCaptureDeath({
      systemWasStarted: false,
      expectingStop: false,
      isStillCapturing: false,
    })).toBe(false)
  })
})
