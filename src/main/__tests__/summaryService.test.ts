import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGenerateShort } = vi.hoisted(() => ({
  mockGenerateShort: vi.fn(),
}))

vi.mock('../services/ai/providerFactory', () => ({
  getNotesProvider: vi.fn(() => ({
    generateShort: mockGenerateShort,
  })),
}))

vi.mock('../services/database', () => ({
  databaseService: { getMode: vi.fn() },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { generateSessionSummary } from '../services/summaryService'
import { getNotesProvider } from '../services/ai/providerFactory'
import { databaseService } from '../services/database'

describe('generateSessionSummary', () => {
  beforeEach(() => {
    mockGenerateShort.mockReset()
    vi.mocked(getNotesProvider).mockResolvedValue({
      generateShort: mockGenerateShort,
    } as any)
  })

  it('returns untitled for short transcripts', async () => {
    const result = await generateSessionSummary('short', null)

    expect(result).toEqual({ title: 'Untitled Session', summary: '' })
    expect(mockGenerateShort).not.toHaveBeenCalled()
  })

  it('returns untitled for empty transcript', async () => {
    const result = await generateSessionSummary('', null)

    expect(result).toEqual({ title: 'Untitled Session', summary: '' })
    expect(mockGenerateShort).not.toHaveBeenCalled()
  })

  it('parses TITLE and SUMMARY from response', async () => {
    mockGenerateShort.mockResolvedValueOnce(
      'TITLE: Team Standup\nSUMMARY:\n## Key Points\n- discussed roadmap'
    )

    const result = await generateSessionSummary(
      'This is a long enough transcript to pass the minimum length check easily',
      null,
    )

    expect(getNotesProvider).toHaveBeenCalled()
    expect(result.title).toBe('Team Standup')
    expect(result.summary).toContain('Key Points')
    expect(result.summary).toContain('discussed roadmap')
    expect(mockGenerateShort).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 2000 }),
    )
  })

  it('parses Title:/Summary: when the model ignores the uppercase labels', async () => {
    mockGenerateShort.mockResolvedValueOnce(
      'Title: Zara interview intro\nSummary:\n## What was said\n- Recruiter intro',
    )

    const result = await generateSessionSummary(
      'This is a long enough transcript to pass the minimum length check easily',
      null,
    )

    expect(result.title).toBe('Zara interview intro')
    expect(result.summary).toContain('Recruiter intro')
  })

  it('uses unmarked model text as the summary instead of leaving the session untitled', async () => {
    mockGenerateShort.mockResolvedValueOnce(
      'Here is some random text without the expected markers.'
    )

    const result = await generateSessionSummary(
      'This is a long enough transcript to pass the minimum length check easily',
      null,
    )

    expect(result.title).not.toBe('Untitled Session')
    expect(result.summary).toContain('random text without the expected markers')
  })

  it('throws when the notes model returns no text', async () => {
    mockGenerateShort.mockResolvedValueOnce('   ')

    await expect(
      generateSessionSummary(
        'This is a long enough transcript to pass the minimum length check easily',
        null,
      ),
    ).rejects.toThrow('Notes model returned no text')
  })

  it('rethrows notes-provider errors so session-end can retry later', async () => {
    mockGenerateShort.mockRejectedValueOnce(new Error('No API key configured for anthropic. Add it in Settings.'))

    await expect(
      generateSessionSummary(
        'This is a long enough transcript to pass the minimum length check easily',
        null,
      ),
    ).rejects.toThrow('No API key configured')
  })

  it('sends heading titles from the mode template, not instructions that invent a meeting', async () => {
    mockGenerateShort.mockResolvedValueOnce('TITLE: Demo\nSUMMARY:\n## What was said\n- YouTube')
    vi.mocked(databaseService.getMode).mockReturnValue({
      name: 'Meeting Notes',
      notesTemplate: [
        { id: 'meet-1', title: 'Overview', instructions: 'Purpose of the meeting and who attended.' },
      ],
    } as ReturnType<typeof databaseService.getMode>)

    await generateSessionSummary(
      'This is a long enough transcript to pass the minimum length check easily',
      'mode-1',
    )

    const prompt = mockGenerateShort.mock.calls[0][0].prompt as string
    expect(prompt).toContain('Overview')
    expect(prompt).toContain('Meeting Notes')
    expect(prompt).not.toContain('who attended')
  })
})
