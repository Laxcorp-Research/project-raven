import { describe, it, expect, vi } from 'vitest'

// meetingDetector imports electron/store/sessionManager/windowManager at module
// load; mock them so the pure evaluateDetection can be imported in node.
vi.mock('electron', () => ({ desktopCapturer: { getSources: vi.fn() } }))
vi.mock('../store', () => ({ getSetting: vi.fn() }))
vi.mock('../services/sessionManager', () => ({ sessionManager: { hasActiveSession: vi.fn() } }))
vi.mock('../windowManager', () => ({ getOverlayWindow: vi.fn(), showOverlayWindow: vi.fn() }))
vi.mock('../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { evaluateDetection } from '../meetingDetector'

describe('evaluateDetection', () => {
  it('does nothing when the mode is off', () => {
    const decision = evaluateDetection({
      mode: 'off',
      hasActiveSession: false,
      windowTitles: ['Zoom Meeting'],
      lastNotifiedPlatform: null,
    })
    expect(decision.action).toBe('none')
  })

  it('does nothing while a session is already active', () => {
    const decision = evaluateDetection({
      mode: 'prompt',
      hasActiveSession: true,
      windowTitles: ['Zoom Meeting'],
      lastNotifiedPlatform: null,
    })
    expect(decision.action).toBe('none')
  })

  it('notifies without auto-start in prompt mode when a new meeting appears', () => {
    const decision = evaluateDetection({
      mode: 'prompt',
      hasActiveSession: false,
      windowTitles: ['Zoom Meeting'],
      lastNotifiedPlatform: null,
    })
    expect(decision).toEqual({
      action: 'notify',
      platform: 'zoom',
      title: 'Zoom Meeting',
      autoStart: false,
      lastNotifiedPlatform: 'zoom',
    })
  })

  it('flags auto-start in auto mode', () => {
    const decision = evaluateDetection({
      mode: 'auto',
      hasActiveSession: false,
      windowTitles: ['Meet - abc-defg-hij'],
      lastNotifiedPlatform: null,
    })
    expect(decision.action).toBe('notify')
    expect(decision.platform).toBe('meet')
    expect(decision.autoStart).toBe(true)
  })

  it('snoozes: does not re-notify for the same platform already notified', () => {
    const decision = evaluateDetection({
      mode: 'prompt',
      hasActiveSession: false,
      windowTitles: ['Zoom Meeting'],
      lastNotifiedPlatform: 'zoom',
    })
    expect(decision.action).toBe('none')
    expect(decision.lastNotifiedPlatform).toBe('zoom')
  })

  it('resets the snooze latch when the meeting window disappears', () => {
    const decision = evaluateDetection({
      mode: 'prompt',
      hasActiveSession: false,
      windowTitles: ['Slack', 'VS Code'],
      lastNotifiedPlatform: 'zoom',
    })
    expect(decision.action).toBe('none')
    expect(decision.lastNotifiedPlatform).toBeNull()
  })

  it('re-notifies for a different platform than the one last notified', () => {
    const decision = evaluateDetection({
      mode: 'prompt',
      hasActiveSession: false,
      windowTitles: ['Meet - abc-defg-hij'],
      lastNotifiedPlatform: 'zoom',
    })
    expect(decision.action).toBe('notify')
    expect(decision.platform).toBe('meet')
  })
})
