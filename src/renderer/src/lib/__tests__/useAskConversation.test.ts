import { describe, it, expect } from 'vitest'
import { sanitizeInitialExchanges, type AskExchange } from '../useAskConversation'

describe('sanitizeInitialExchanges', () => {
  it('forces loading off so a conversation saved mid-answer never restores a stuck spinner', () => {
    const stored: AskExchange[] = [
      { id: '1', question: 'q1', answer: 'a1', loading: false },
      // Simulates a crash while a turn was in flight.
      { id: '2', question: 'q2', loading: true },
    ]
    const result = sanitizeInitialExchanges(stored)
    expect(result.every((e) => e.loading === false)).toBe(true)
    expect(result[1].question).toBe('q2')
  })

  it('preserves answers and sources on restore', () => {
    const stored: AskExchange[] = [
      {
        id: '1',
        question: 'What did we decide?',
        answer: 'To ship Friday.',
        sources: [{ sessionId: 's1', title: 'Planning', startedAt: 123 }],
        loading: false,
      },
    ]
    const result = sanitizeInitialExchanges(stored)
    expect(result[0].answer).toBe('To ship Friday.')
    expect(result[0].sources?.[0].sessionId).toBe('s1')
  })

  it('returns an empty array for missing or malformed input', () => {
    expect(sanitizeInitialExchanges(undefined)).toEqual([])
    expect(sanitizeInitialExchanges(null as unknown as AskExchange[])).toEqual([])
  })
})
