import { describe, it, expect } from 'vitest'
import { computeTalkRatio } from '../../shared/talkRatio'

describe('computeTalkRatio', () => {
  it('returns all zeros for empty, null, or undefined input', () => {
    expect(computeTalkRatio([])).toEqual({
      youWords: 0,
      themWords: 0,
      totalWords: 0,
      youPct: 0,
      themPct: 0,
    })
    expect(computeTalkRatio(null)).toEqual({
      youWords: 0,
      themWords: 0,
      totalWords: 0,
      youPct: 0,
      themPct: 0,
    })
    expect(computeTalkRatio(undefined)).toEqual({
      youWords: 0,
      themWords: 0,
      totalWords: 0,
      youPct: 0,
      themPct: 0,
    })
  })

  it('counts mic as You and system as Them by word count', () => {
    const ratio = computeTalkRatio([
      { source: 'mic', text: 'one two three', isFinal: true },
      { source: 'system', text: 'four', isFinal: true },
    ])
    expect(ratio.youWords).toBe(3)
    expect(ratio.themWords).toBe(1)
    expect(ratio.totalWords).toBe(4)
    expect(ratio.youPct).toBe(75)
    expect(ratio.themPct).toBe(25)
  })

  it('is one-sided when only one speaker talks', () => {
    const ratio = computeTalkRatio([
      { source: 'mic', text: 'hello world', isFinal: true },
    ])
    expect(ratio.youPct).toBe(100)
    expect(ratio.themPct).toBe(0)
  })

  it('excludes interim (isFinal === false) entries', () => {
    const ratio = computeTalkRatio([
      { source: 'mic', text: 'final words here', isFinal: true },
      { source: 'system', text: 'interim should not count', isFinal: false },
    ])
    expect(ratio.youWords).toBe(3)
    expect(ratio.themWords).toBe(0)
    expect(ratio.youPct).toBe(100)
  })

  it('treats entries with no isFinal flag as final (persisted transcript shape)', () => {
    const ratio = computeTalkRatio([
      { source: 'mic', text: 'a b' },
      { source: 'system', text: 'c d' },
    ])
    expect(ratio.totalWords).toBe(4)
    expect(ratio.youPct).toBe(50)
    expect(ratio.themPct).toBe(50)
  })

  it('always makes the two percentages sum to 100 despite rounding', () => {
    // 1 vs 2 words → 33.33 / 66.67 → rounds to 33 / 67 (not 33/67 mismatch)
    const ratio = computeTalkRatio([
      { source: 'mic', text: 'one' },
      { source: 'system', text: 'two three' },
    ])
    expect(ratio.youPct + ratio.themPct).toBe(100)
    expect(ratio.youPct).toBe(33)
    expect(ratio.themPct).toBe(67)
  })

  it('ignores empty-text entries', () => {
    const ratio = computeTalkRatio([
      { source: 'mic', text: '' },
      { source: 'system', text: '   ' },
      { source: 'mic', text: 'real' },
    ])
    expect(ratio.youWords).toBe(1)
    expect(ratio.themWords).toBe(0)
    expect(ratio.totalWords).toBe(1)
  })
})
