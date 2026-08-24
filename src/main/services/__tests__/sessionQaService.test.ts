import { describe, it, expect, vi, beforeEach } from 'vitest'

const { embedText, cosineSimilarity, getNotesProvider, generateShort, db } = vi.hoisted(() => ({
  embedText: vi.fn(),
  cosineSimilarity: vi.fn(),
  getNotesProvider: vi.fn(),
  generateShort: vi.fn(),
  db: {
    getAllSessionChunks: vi.fn(),
    getSessionMeta: vi.fn(),
  },
}))

vi.mock('../ragService', () => ({ embedText, cosineSimilarity }))
vi.mock('../ai/providerFactory', () => ({ getNotesProvider }))
vi.mock('../database', () => ({ databaseService: db }))
vi.mock('../../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import {
  buildQaPrompt,
  askQuestion,
  invalidateSessionQaCache,
  buildSessionScopedQaPrompt,
  askSessionScoped,
  budgetHistory,
  compactForAsk,
  summarizeConversation,
} from '../sessionQaService'

type FakeProvider = Awaited<ReturnType<typeof getNotesProvider>>
const makeProvider = (): FakeProvider =>
  ({ name: 'anthropic', generateShort, streamResponse: vi.fn() } as unknown as FakeProvider)

describe('budgetHistory', () => {
  const turn = (n: number, size = 100) => ({
    question: `q${n}`,
    answer: `a${n}`.padEnd(size, 'x'),
  })

  it('keeps everything when under budget, in chronological order', () => {
    const history = [turn(1), turn(2), turn(3)]
    expect(budgetHistory(history, 10_000)).toEqual(history)
  })

  it('drops the OLDEST turns when over budget, keeping the most recent', () => {
    // Each turn ~200 chars; budget 450 keeps the 2 newest (turns 4 and 5).
    const history = [turn(1, 200), turn(2, 200), turn(3, 200), turn(4, 200), turn(5, 200)]
    const kept = budgetHistory(history, 450)
    expect(kept.map((t) => t.question)).toEqual(['q4', 'q5'])
  })

  it('always keeps the newest turn even if it alone exceeds the budget', () => {
    const history = [turn(1, 100), turn(2, 5000)]
    const kept = budgetHistory(history, 500)
    expect(kept.map((t) => t.question)).toEqual(['q2'])
  })

  it('handles empty history', () => {
    expect(budgetHistory([], 1000)).toEqual([])
  })
})

describe('buildQaPrompt', () => {
  it('embeds the question and cites each excerpt with its session title and date', () => {
    const prompt = buildQaPrompt('what about pricing?', [
      { index: 1, title: 'Acme call', date: 'Aug 20, 2026', text: 'We agreed on $20/mo' },
      { index: 2, title: 'Beta sync', date: 'Aug 21, 2026', text: 'Pricing tiers discussed' },
    ])
    expect(prompt).toContain('what about pricing?')
    expect(prompt).toContain('[1] (from "Acme call", Aug 20, 2026)')
    expect(prompt).toContain('We agreed on $20/mo')
    expect(prompt).toContain('[2] (from "Beta sync", Aug 21, 2026)')
    expect(prompt).toContain('Cite the meeting(s)')
  })
})

describe('askQuestion', () => {
  beforeEach(() => {
    invalidateSessionQaCache()
    embedText.mockReset()
    cosineSimilarity.mockReset()
    generateShort.mockReset()
    db.getAllSessionChunks.mockReset()
    db.getSessionMeta.mockReset()
    vi.mocked(getNotesProvider).mockResolvedValue({
      name: 'anthropic',
      generateShort,
      streamResponse: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof getNotesProvider>>)
  })

  it('returns an error for a blank question without hitting the model', async () => {
    const result = await askQuestion('   ')
    expect(result).toEqual({ error: 'Ask a question first.' })
    expect(getNotesProvider).not.toHaveBeenCalled()
  })

  it('returns an error when no sessions have been indexed', async () => {
    db.getAllSessionChunks.mockReturnValue([])
    const result = await askQuestion('anything?')
    expect('error' in result).toBe(true)
    expect(generateShort).not.toHaveBeenCalled()
  })

  it('answers using the top chunks and returns deduped session sources', async () => {
    db.getAllSessionChunks.mockReturnValue([
      { sessionId: 's1', chunkText: 'pricing is $20', embeddingJson: '[0.1]' },
      { sessionId: 's1', chunkText: 'second chunk same session', embeddingJson: '[0.2]' },
      { sessionId: 's2', chunkText: 'unrelated', embeddingJson: '[0.9]' },
    ])
    // Rank: s1 chunks highest, then s2.
    cosineSimilarity.mockImplementation((_q: number[], e: number[]) => (e[0] < 0.5 ? 0.9 : 0.1))
    embedText.mockResolvedValue([0.1])
    db.getSessionMeta.mockImplementation((id: string) =>
      id === 's1'
        ? { id: 's1', title: 'Pricing call', startedAt: 1000 }
        : { id: 's2', title: 'Other', startedAt: 2000 },
    )
    generateShort.mockResolvedValue('It was $20/mo [1].')

    const result = await askQuestion('what pricing did we agree?')

    expect('answer' in result).toBe(true)
    if ('answer' in result) {
      expect(result.answer).toBe('It was $20/mo [1].')
      // s1 appears twice among chunks but is a single source; s2 also cited.
      const sourceIds = result.sources.map((s) => s.sessionId)
      expect(sourceIds).toContain('s1')
      expect(new Set(sourceIds).size).toBe(sourceIds.length)
    }
    // The prompt sent to the model includes the retrieved chunk text.
    expect(generateShort).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('pricing is $20') }),
    )
  })

  it('returns an error (not a throw) when the provider is unavailable', async () => {
    db.getAllSessionChunks.mockReturnValue([
      { sessionId: 's1', chunkText: 'x', embeddingJson: '[0.1]' },
    ])
    vi.mocked(getNotesProvider).mockRejectedValueOnce(new Error('No API key configured'))

    const result = await askQuestion('q?')
    expect(result).toEqual({ error: 'No API key configured' })
  })

  it('returns an error (not a throw) when generation fails', async () => {
    db.getAllSessionChunks.mockReturnValue([
      { sessionId: 's1', chunkText: 'x', embeddingJson: '[0.1]' },
    ])
    cosineSimilarity.mockReturnValue(0.5)
    embedText.mockResolvedValue([0.1])
    db.getSessionMeta.mockReturnValue({ id: 's1', title: 'T', startedAt: 1 })
    generateShort.mockRejectedValueOnce(new Error('rate limited'))

    const result = await askQuestion('q?')
    expect(result).toEqual({ error: 'rate limited' })
  })
})

describe('buildSessionScopedQaPrompt', () => {
  it('frames a conversational partner and supports evaluative questions', () => {
    const prompt = buildSessionScopedQaPrompt('how did I do?', 'You: we ship Friday\nThem: agreed')
    expect(prompt).toContain('how did I do?')
    expect(prompt).toContain('You: we ship Friday')
    expect(prompt).toContain('thinking partner')
    expect(prompt.toLowerCase()).toContain('honest assessment')
    // The old refuse-first framing is gone.
    expect(prompt).not.toContain('say you could not find it in this meeting')
  })

  it('includes recent turns and an earlier-summary block for multi-turn context', () => {
    const prompt = buildSessionScopedQaPrompt(
      'and what about pricing?',
      'You: hi',
      [{ question: 'how did I do?', answer: 'You did well.' }],
      'Earlier the user asked about the agenda.',
    )
    expect(prompt).toContain('RECENT MESSAGES:')
    expect(prompt).toContain('User: how did I do?')
    expect(prompt).toContain('You: You did well.')
    expect(prompt).toContain('EARLIER IN THIS CONVERSATION')
    expect(prompt).toContain('Earlier the user asked about the agenda.')
    expect(prompt).toContain('and what about pricing?')
  })
})

describe('askSessionScoped', () => {
  beforeEach(() => {
    generateShort.mockReset()
    vi.mocked(getNotesProvider).mockResolvedValue({
      name: 'anthropic',
      generateShort,
      streamResponse: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof getNotesProvider>>)
  })

  it('errors on a blank question without calling the model', async () => {
    const result = await askSessionScoped({ question: '  ', transcript: 'You: hi' })
    expect(result).toEqual({ error: 'Ask a question first.' })
    expect(getNotesProvider).not.toHaveBeenCalled()
  })

  it('errors when the session has no transcript', async () => {
    const result = await askSessionScoped({ question: 'q?', transcript: '' })
    expect('error' in result).toBe(true)
    expect(getNotesProvider).not.toHaveBeenCalled()
  })

  it('answers from the transcript on success', async () => {
    generateShort.mockResolvedValueOnce('We ship Friday.')
    const result = await askSessionScoped({ question: 'when?', transcript: 'You: we ship Friday' })
    expect(result).toMatchObject({ answer: 'We ship Friday.', foldedCount: 0 })
    expect(generateShort).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('we ship Friday') }),
    )
  })

  it('carries recent conversation turns into the prompt', async () => {
    generateShort.mockResolvedValueOnce('Sure.')
    await askSessionScoped({
      question: 'follow up?',
      transcript: 'You: hi there',
      recent: [{ question: 'first?', answer: 'first answer' }],
    })
    const prompt = generateShort.mock.calls[0][0].prompt as string
    expect(prompt).toContain('RECENT MESSAGES:')
    expect(prompt).toContain('first answer')
  })

  it('returns an error (not a throw) when generation fails', async () => {
    generateShort.mockRejectedValueOnce(new Error('boom'))
    const result = await askSessionScoped({ question: 'q?', transcript: 'You: hi there' })
    expect(result).toEqual({ error: 'boom' })
  })
})

describe('summarizeConversation', () => {
  it('returns the prior summary unchanged when there are no turns', async () => {
    generateShort.mockReset()
    const out = await summarizeConversation(makeProvider(), 'PRIOR', [])
    expect(out).toBe('PRIOR')
    expect(generateShort).not.toHaveBeenCalled()
  })

  it('merges the prior summary with new turns', async () => {
    generateShort.mockReset()
    generateShort.mockResolvedValueOnce('MERGED SUMMARY')
    const out = await summarizeConversation(makeProvider(), 'PRIOR NOTES', [
      { question: 'q1', answer: 'a1' },
    ])
    expect(out).toBe('MERGED SUMMARY')
    const prompt = generateShort.mock.calls[0][0].prompt as string
    expect(prompt).toContain('PRIOR NOTES')
    expect(prompt).toContain('q1')
  })

  it('falls back to the prior summary when the model errors (never throws)', async () => {
    generateShort.mockReset()
    generateShort.mockRejectedValueOnce(new Error('boom'))
    const out = await summarizeConversation(makeProvider(), 'KEEP ME', [{ question: 'q', answer: 'a' }])
    expect(out).toBe('KEEP ME')
  })
})

describe('compactForAsk', () => {
  it('does no summarization when recent turns fit the budget', async () => {
    generateShort.mockReset()
    const recent = [{ question: 'q', answer: 'short answer' }]
    const res = await compactForAsk(makeProvider(), 'PRIOR', recent)
    expect(res).toEqual({ summary: 'PRIOR', recent, foldedCount: 0 })
    expect(generateShort).not.toHaveBeenCalled()
  })

  it('folds the oldest overflow turns into the summary, keeping recent verbatim', async () => {
    generateShort.mockReset()
    generateShort.mockResolvedValueOnce('COMPOUNDED SUMMARY')
    // Two ~9k-char turns exceed the 12k recent budget → oldest (q1) is folded.
    const recent = [
      { question: 'q1', answer: 'x'.repeat(9000) },
      { question: 'q2', answer: 'y'.repeat(9000) },
    ]
    const res = await compactForAsk(makeProvider(), 'PRIOR', recent)
    expect(res.foldedCount).toBe(1)
    expect(res.recent.map((t) => t.question)).toEqual(['q2'])
    expect(res.summary).toBe('COMPOUNDED SUMMARY')
    // The fold call merged the prior summary + the retired turn.
    const prompt = generateShort.mock.calls[0][0].prompt as string
    expect(prompt).toContain('PRIOR')
    expect(prompt).toContain('q1')
  })
})
