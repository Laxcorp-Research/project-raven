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

function classify(title: string): MeetingPlatform | null {
  const t = title.trim()
  if (!t) return null
  const lower = t.toLowerCase()

  // Zoom: the in-meeting window is "Zoom Meeting" / "Zoom Webinar".
  // The main app window is "Zoom" / "Zoom Workplace", which must NOT match.
  if (lower === 'zoom meeting' || lower.startsWith('zoom meeting') || lower.startsWith('zoom webinar')) {
    return 'zoom'
  }

  // Microsoft Teams: require the word "meeting" alongside the app name so the
  // Chat/Calendar/Activity tabs ("... | Microsoft Teams") do not match.
  if (lower.includes('microsoft teams') && lower.includes('meeting')) {
    return 'teams'
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
