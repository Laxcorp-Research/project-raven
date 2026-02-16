import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: mockCreate } }
  }),
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

import Anthropic from '@anthropic-ai/sdk'
import { generateSessionSummary } from '../services/summaryService'

const MockAnthropic = vi.mocked(Anthropic)

describe('generateSessionSummary', () => {
  beforeEach(() => {
    // Re-setup after global mockReset clears implementations
    MockAnthropic.mockImplementation(function () {
      return { messages: { create: mockCreate } } as any
    })
  })

  it('returns untitled for short transcripts', async () => {
    const result = await generateSessionSummary('short', null, 'sk-test')

    expect(result).toEqual({ title: 'Untitled session', summary: '' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns untitled for empty transcript', async () => {
    const result = await generateSessionSummary('', null, 'sk-test')

    expect(result).toEqual({ title: 'Untitled session', summary: '' })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('parses TITLE and SUMMARY from response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'TITLE: Team Standup\nSUMMARY:\n## Key Points\n- discussed roadmap',
        },
      ],
    })

    const result = await generateSessionSummary(
      'This is a long enough transcript to pass the minimum length check easily',
      null,
      'sk-test'
    )

    expect(result.title).toBe('Team Standup')
    expect(result.summary).toContain('Key Points')
    expect(result.summary).toContain('discussed roadmap')
  })

  it('handles malformed response gracefully', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: 'Here is some random text without the expected markers.',
        },
      ],
    })

    const result = await generateSessionSummary(
      'This is a long enough transcript to pass the minimum length check easily',
      null,
      'sk-test'
    )

    expect(result.title).toBe('Untitled session')
    expect(result.summary).toBe('')
  })
})
