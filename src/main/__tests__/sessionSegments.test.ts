import { describe, it, expect } from 'vitest'
import { findSegmentBreaks, parseSessionSegments, wasResumed } from '../../shared/sessionSegments'

describe('parseSessionSegments', () => {
  it('returns [] for null, garbage, and non-array JSON', () => {
    expect(parseSessionSegments(null)).toEqual([])
    expect(parseSessionSegments(undefined)).toEqual([])
    expect(parseSessionSegments('nope')).toEqual([])
    expect(parseSessionSegments('{"startedAt":1}')).toEqual([])
  })

  it('keeps well-formed segments and drops malformed entries', () => {
    const json = JSON.stringify([
      { startedAt: 100, endedAt: 200 },
      { startedAt: 300, endedAt: null },
      { startedAt: 'x', endedAt: 1 },
      null,
      { endedAt: 5 },
    ])
    expect(parseSessionSegments(json)).toEqual([
      { startedAt: 100, endedAt: 200 },
      { startedAt: 300, endedAt: null },
    ])
  })
})

describe('wasResumed', () => {
  it('is false for a single sitting or no segments, true from the second sitting on', () => {
    expect(wasResumed(null)).toBe(false)
    expect(wasResumed(JSON.stringify([{ startedAt: 1, endedAt: 2 }]))).toBe(false)
    expect(wasResumed(JSON.stringify([{ startedAt: 1, endedAt: 2 }, { startedAt: 3, endedAt: null }]))).toBe(true)
  })
})

describe('findSegmentBreaks (where to draw the "Resumed" divider)', () => {
  const day1 = [1_000, 2_000, 3_000]
  const day2 = [90_000, 91_000]

  it('marks the first entry of each later sitting, never the first sitting', () => {
    const breaks = findSegmentBreaks([...day1, ...day2], [
      { startedAt: 0, endedAt: 4_000 },
      { startedAt: 80_000, endedAt: null },
    ])
    expect([...breaks.keys()]).toEqual([3])
    expect(breaks.get(3)).toEqual({ startedAt: 80_000, endedAt: null })
  })

  it('returns no breaks for a never-resumed session', () => {
    expect(findSegmentBreaks(day1, [{ startedAt: 0, endedAt: 4_000 }]).size).toBe(0)
    expect(findSegmentBreaks(day1, []).size).toBe(0)
  })

  it('skips a sitting in which nothing was said', () => {
    const breaks = findSegmentBreaks(day1, [
      { startedAt: 0, endedAt: 4_000 },
      { startedAt: 80_000, endedAt: 81_000 }, // resumed, said nothing, stopped
    ])
    expect(breaks.size).toBe(0)
  })

  it('handles three sittings and unsorted segment input', () => {
    const day3 = [500_000]
    const breaks = findSegmentBreaks([...day1, ...day2, ...day3], [
      { startedAt: 400_000, endedAt: null },
      { startedAt: 0, endedAt: 4_000 },
      { startedAt: 80_000, endedAt: 95_000 },
    ])
    expect([...breaks.keys()]).toEqual([3, 5])
    expect(breaks.get(5)?.startedAt).toBe(400_000)
  })
})
