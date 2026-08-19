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

    expect(result).toEqual({ title: 'Untitled session', summary: '' })
    expect(mockGenerateShort).not.toHaveBeenCalled()
  })

  it('returns untitled for empty transcript', async () => {
    const result = await generateSessionSummary('', null)

    expect(result).toEqual({ title: 'Untitled session', summary: '' })
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

  it('handles malformed response gracefully', async () => {
    mockGenerateShort.mockResolvedValueOnce(
      'Here is some random text without the expected markers.'
    )

    const result = await generateSessionSummary(
      'This is a long enough transcript to pass the minimum length check easily',
      null,
    )

    expect(result.title).toBe('Untitled session')
    expect(result.summary).toBe('')
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
