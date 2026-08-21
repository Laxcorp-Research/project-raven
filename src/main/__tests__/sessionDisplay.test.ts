import { describe, expect, it } from 'vitest'
import {
  isPlaceholderSessionTitle,
  shouldShowSessionNotesGenerating,
  SESSION_NOTES_PROCESSING_MS,
} from '../../shared/sessionDisplay'

describe('isPlaceholderSessionTitle', () => {
  it('treats empty, DB default, and lowercase summary fallback as untitled', () => {
    expect(isPlaceholderSessionTitle('')).toBe(true)
    expect(isPlaceholderSessionTitle(null)).toBe(true)
    expect(isPlaceholderSessionTitle('Untitled Session')).toBe(true)
    expect(isPlaceholderSessionTitle('Untitled session')).toBe(true)
  })

  it('does not treat a real title as untitled', () => {
    expect(isPlaceholderSessionTitle('CiaraAI workflow')).toBe(false)
  })
})

describe('shouldShowSessionNotesGenerating', () => {
  const now = 1_000_000

  it('shows processing while notes generation is in flight even after 12 hours', () => {
    expect(
      shouldShowSessionNotesGenerating({
        isActive: false,
        title: 'Untitled session',
        durationSeconds: 3600,
        updatedAt: now - 12 * 60 * 60 * 1000,
        now,
        pending: true,
        hasSummary: false,
      }),
    ).toBe(true)
  })

  it('does not show processing for a 12-hour-old untitled session that is not generating', () => {
    expect(
      shouldShowSessionNotesGenerating({
        isActive: false,
        title: 'Untitled session',
        durationSeconds: 3600,
        updatedAt: now - 12 * 60 * 60 * 1000,
        now,
        pending: false,
        hasSummary: false,
      }),
    ).toBe(false)
  })

  it('treats lowercase Untitled session as processing within the recent window', () => {
    expect(
      shouldShowSessionNotesGenerating({
        isActive: false,
        title: 'Untitled session',
        durationSeconds: 90,
        updatedAt: now - 30_000,
        now,
        pending: false,
        hasSummary: false,
      }),
    ).toBe(true)
  })

  it('does not treat Untitled Session with a capital S as done while recently ended', () => {
    expect(
      shouldShowSessionNotesGenerating({
        isActive: false,
        title: 'Untitled Session',
        durationSeconds: 90,
        updatedAt: now - 30_000,
        now,
        pending: false,
      }),
    ).toBe(true)
  })

  it('stops the optimistic spinner after SESSION_NOTES_PROCESSING_MS', () => {
    expect(
      shouldShowSessionNotesGenerating({
        isActive: false,
        title: 'Untitled Session',
        durationSeconds: 90,
        updatedAt: now - SESSION_NOTES_PROCESSING_MS - 1,
        now,
        pending: false,
        hasSummary: false,
      }),
    ).toBe(false)
  })

  it('does not animate the live recording row', () => {
    expect(
      shouldShowSessionNotesGenerating({
        isActive: true,
        title: 'Untitled Session',
        durationSeconds: 30,
        updatedAt: now,
        now,
        pending: true,
        hasSummary: false,
      }),
    ).toBe(false)
  })
})
