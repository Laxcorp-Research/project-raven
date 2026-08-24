import { describe, it, expect } from 'vitest'
import { detectMeetingFromWindows } from '../../shared/meetingDetection'

describe('detectMeetingFromWindows', () => {
  it('detects an active Zoom meeting window but not the main Zoom app', () => {
    expect(detectMeetingFromWindows(['Zoom Meeting'])?.platform).toBe('zoom')
    expect(detectMeetingFromWindows(['Zoom Webinar'])?.platform).toBe('zoom')
    expect(detectMeetingFromWindows(['Zoom'])).toBeNull()
    expect(detectMeetingFromWindows(['Zoom Workplace'])).toBeNull()
  })

  it('detects a Teams meeting window but not the Chat/Calls/Calendar tabs', () => {
    expect(detectMeetingFromWindows(['Meeting in Design Sync | Microsoft Teams'])?.platform).toBe('teams')
    expect(detectMeetingFromWindows(['Chat | Microsoft Teams'])).toBeNull()
    expect(detectMeetingFromWindows(['Calls | Microsoft Teams'])).toBeNull()
    expect(detectMeetingFromWindows(['Calendar | Microsoft Teams'])).toBeNull()
  })

  it('detects a Google Meet call by its room code but not the landing page', () => {
    expect(detectMeetingFromWindows(['Meet - abc-defg-hij - Google Chrome'])?.platform).toBe('meet')
    expect(detectMeetingFromWindows(['Google Meet'])).toBeNull()
    expect(detectMeetingFromWindows(['Google Meet - Google Chrome'])).toBeNull()
  })

  it('detects a Webex meeting but not the main Webex app', () => {
    expect(detectMeetingFromWindows(['Cisco Webex Meeting'])?.platform).toBe('webex')
    expect(detectMeetingFromWindows(['Webex'])).toBeNull()
  })

  it('returns the first meeting found and ignores empty/null titles', () => {
    const result = detectMeetingFromWindows([null, '', 'Some Doc - Notes', 'Zoom Meeting', 'Meet - abc-defg-hij'])
    expect(result).toEqual({ platform: 'zoom', title: 'Zoom Meeting' })
  })

  it('returns null when no meeting windows are present', () => {
    expect(detectMeetingFromWindows(['Slack', 'VS Code', 'Safari'])).toBeNull()
    expect(detectMeetingFromWindows([])).toBeNull()
  })
})
