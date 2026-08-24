/**
 * Meeting auto-start detector.
 *
 * Polls the list of open window titles and, when a Zoom/Meet/Teams/Webex
 * meeting window appears, either prompts the user to start a Raven session
 * ('prompt') or starts one automatically ('auto'). No meeting bot is involved;
 * capture stays local. Fully gated behind the `meetingAutoStart` setting
 * (default 'prompt') and disabled while a session is already active.
 *
 * The decision logic (evaluateDetection) is a pure function so it can be unit
 * tested without Electron; poll() wraps it with the real side effects.
 */

import { desktopCapturer } from 'electron'
import { getSetting } from './store'
import { sessionManager } from './services/sessionManager'
import { getOverlayWindow, showOverlayWindow } from './windowManager'
import { detectMeetingFromWindows, type MeetingPlatform } from '../shared/meetingDetection'
import { createLogger } from './logger'

const log = createLogger('MeetingDetector')

const POLL_INTERVAL_MS = 10_000

export interface DetectionState {
  mode: string
  hasActiveSession: boolean
  windowTitles: string[]
  lastNotifiedPlatform: MeetingPlatform | null
}

export interface DetectionDecision {
  action: 'none' | 'notify'
  platform?: MeetingPlatform
  title?: string
  autoStart?: boolean
  lastNotifiedPlatform: MeetingPlatform | null
}

/**
 * Pure decision function. Notifies at most once per continuous presence of a
 * given platform's meeting window (snooze): once notified we stay quiet until
 * that platform's window disappears (match clears), which resets the latch.
 */
export function evaluateDetection(state: DetectionState): DetectionDecision {
  if (state.mode !== 'prompt' && state.mode !== 'auto') {
    return { action: 'none', lastNotifiedPlatform: state.lastNotifiedPlatform }
  }
  if (state.hasActiveSession) {
    return { action: 'none', lastNotifiedPlatform: state.lastNotifiedPlatform }
  }

  const match = detectMeetingFromWindows(state.windowTitles)
  if (!match) {
    // No meeting on screen — clear the latch so the next meeting re-notifies.
    return { action: 'none', lastNotifiedPlatform: null }
  }
  if (match.platform === state.lastNotifiedPlatform) {
    return { action: 'none', lastNotifiedPlatform: state.lastNotifiedPlatform }
  }

  return {
    action: 'notify',
    platform: match.platform,
    title: match.title,
    autoStart: state.mode === 'auto',
    lastNotifiedPlatform: match.platform,
  }
}

let timer: NodeJS.Timeout | null = null
let lastNotifiedPlatform: MeetingPlatform | null = null

async function poll(): Promise<void> {
  try {
    const mode = getSetting('meetingAutoStart') as string
    // Cheap early-out so an 'off' user does no window enumeration at all.
    if (mode !== 'prompt' && mode !== 'auto') return
    if (sessionManager.hasActiveSession()) return

    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    })

    const windowTitles = sources.map((s) => s.name)
    // Debug-only aid for tuning platform matchers against real window titles
    // (e.g. Teams 1:1 call windows, which vary by client version). Never logged
    // at info level — titles can contain sensitive document/meeting names.
    const candidates = windowTitles.filter((n) => /teams|zoom|meet|webex/i.test(n || ''))
    if (candidates.length) log.debug('Meeting detect candidates:', candidates)

    const decision = evaluateDetection({
      mode,
      hasActiveSession: sessionManager.hasActiveSession(),
      windowTitles,
      lastNotifiedPlatform,
    })
    lastNotifiedPlatform = decision.lastNotifiedPlatform

    if (decision.action !== 'notify') return

    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return

    showOverlayWindow()
    overlay.webContents.send('meeting:detected', {
      platform: decision.platform,
      title: decision.title,
      autoStart: decision.autoStart,
    })
    log.info(`Meeting detected (${decision.platform}); mode=${mode}`)
  } catch (err) {
    // Never let a detection failure take down the app. On macOS without
    // Screen Recording permission, getSources yields no usable titles — we
    // simply detect nothing.
    log.debug('Meeting detection poll failed (non-fatal):', err)
  }
}

export function startMeetingDetector(): void {
  if (timer) return
  timer = setInterval(() => {
    void poll()
  }, POLL_INTERVAL_MS)
  log.info('Meeting detector started')
}

export function stopMeetingDetector(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  lastNotifiedPlatform = null
}
