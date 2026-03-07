import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockGenerateShort } = vi.hoisted(() => ({
  mockGenerateShort: vi.fn(),
}))

vi.mock('../services/ai/providerFactory', () => ({
  getProviderFromStore: vi.fn(() => ({
    generateShort: mockGenerateShort,
  })),
  getProFastProvider: vi.fn(() => ({
    generateShort: mockGenerateShort,
  })),
}))

vi.mock('../store', () => ({
  isProMode: vi.fn(() => false),
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
import { getProviderFromStore } from '../services/ai/providerFactory'

describe('generateSessionSummary', () => {
  beforeEach(() => {
    vi.mocked(getProviderFromStore).mockResolvedValue({
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

    expect(result.title).toBe('Team Standup')
    expect(result.summary).toContain('Key Points')
    expect(result.summary).toContain('discussed roadmap')
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
})
