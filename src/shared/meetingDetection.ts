/**
 * Meeting detection from window titles (as returned by
 * desktopCapturer.getSources). Deliberately conservative: it should fire on an
 * active meeting window, not on the app's main/landing window, to avoid
 * nagging users with false prompts. Pure + string-only so it is fully unit
 * tested without Electron.
 */

export type MeetingPlatform = 'zoom' | 'teams' | 'meet' | 'webex'

export interface DetectedMeeting {
  platform: MeetingPlatform
  title: string
}

// Google Meet room code, e.g. "abc-defg-hij".
const MEET_CODE = /[a-z]{3}-[a-z]{4}-[a-z]{3}/i

// Microsoft Teams section tabs. Their window title is "<Section> | Microsoft
// Teams" and they are NOT a call/meeting, so they must never trigger a prompt.
// Anything else in that "<context> | Microsoft Teams" slot (a meeting subject,
// or the person on a 1:1 call) IS treated as a meeting.
const TEAMS_NON_MEETING = new Set([
  'chat', 'calls', 'calendar', 'activity', 'files', 'teams', 'store',
  'help', 'apps', 'tasks', 'shifts', 'communities', 'settings', 'more',
])

function classify(title: string): MeetingPlatform | null {
  const t = title.trim()
  if (!t) return null
  const lower = t.toLowerCase()

  // Zoom: the in-meeting window is "Zoom Meeting" / "Zoom Webinar".
  // The main app window is "Zoom" / "Zoom Workplace", which must NOT match.
  if (lower === 'zoom meeting' || lower.startsWith('zoom meeting') || lower.startsWith('zoom webinar')) {
    return 'zoom'
  }

  // Microsoft Teams. The old rule required the literal word "meeting", which
  // silently missed 1:1 calls (their window title is just the callee's name or
  // subject). Instead: treat any Teams window as a meeting unless it is a known
  // section tab (Chat/Calls/Calendar/...). For titles without the "| Microsoft
  // Teams" separator we keep a keyword gate so notification/preview windows
  // don't nag.
  if (lower.includes('microsoft teams')) {
    // Teams prepends an unread badge like "(3) " to the title.
    const stripped = lower.replace(/^\(\d+\)\s*/, '').trim()
    if (stripped === 'microsoft teams') return null
    if (stripped.includes('|')) {
      const parts = stripped.split('|').map((p) => p.trim())
      const context = parts.find((p) => p && p !== 'microsoft teams') ?? ''
      const section = context.replace(/\s*\(\d+\)\s*$/, '').trim()
      if (!section) return null
      if (TEAMS_NON_MEETING.has(section)) return null
      return 'teams'
    }
    if (/\b(meeting|call|calling|huddle)\b/.test(stripped)) return 'teams'
    return null
  }

  // Google Meet: require the room-code pattern so the meet.google.com landing
  // page ("Google Meet") does not trigger a prompt. In-call tabs are titled
  // like "Meet - abc-defg-hij".
  if (lower.includes('meet') && MEET_CODE.test(lower)) {
    return 'meet'
  }

  // Cisco Webex meeting window.
  if (lower.includes('webex') && lower.includes('meeting')) {
    return 'webex'
  }

  return null
}

/**
 * Scan a list of window titles and return the first detected meeting, or null.
 */
export function detectMeetingFromWindows(
  windowTitles: Array<string | null | undefined>,
): DetectedMeeting | null {
  for (const raw of windowTitles) {
    if (!raw) continue
    const platform = classify(raw)
    if (platform) return { platform, title: raw.trim() }
  }
  return null
}
