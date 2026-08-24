import { describe, it, expect, vi, beforeEach } from 'vitest'

const { chunkText, embedText, invalidateSessionQaCache, getSetting, db } = vi.hoisted(() => ({
  chunkText: vi.fn(),
  embedText: vi.fn(),
  invalidateSessionQaCache: vi.fn(),
  getSetting: vi.fn(),
  db: {
    getSession: vi.fn(),
    deleteSessionChunks: vi.fn(),
    insertSessionChunk: vi.fn(),
    getIndexedSessionIds: vi.fn(),
    getAllSessionSummaries: vi.fn(),
  },
}))

vi.mock('../ragService', () => ({ chunkText, embedText }))
vi.mock('../sessionQaService', () => ({ invalidateSessionQaCache }))
vi.mock('../../store', () => ({ getSetting }))
vi.mock('../database', () => ({ databaseService: db }))
vi.mock('../../logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { indexSession, backfillSessionIndex } from '../sessionIndexService'

const LONG_TRANSCRIPT = [
  { source: 'mic', text: 'This is a long enough transcript line to pass the minimum', isFinal: true },
  { source: 'system', text: 'And a reply from the other participant here', isFinal: true },
]

describe('indexSession', () => {
  beforeEach(() => {
    Object.values(db).forEach((fn) => fn.mockReset())
    chunkText.mockReset()
    embedText.mockReset()
    invalidateSessionQaCache.mockReset()
    getSetting.mockReturnValue('Sam')
  })

  it('does nothing for a session with no transcript', async () => {
    db.getSession.mockReturnValue({ id: 's1', transcript: [] })
    await indexSession('s1')
    expect(db.insertSessionChunk).not.toHaveBeenCalled()
    expect(chunkText).not.toHaveBeenCalled()
  })

  it('clears prior chunks, embeds each chunk, stores them, and invalidates the cache', async () => {
    db.getSession.mockReturnValue({ id: 's1', transcript: LONG_TRANSCRIPT })
    chunkText.mockReturnValue(['chunk one', 'chunk two'])
    embedText.mockResolvedValueOnce([0.1, 0.2]).mockResolvedValueOnce([0.3, 0.4])

    await indexSession('s1')

    expect(db.deleteSessionChunks).toHaveBeenCalledWith('s1')
    expect(embedText).toHaveBeenCalledTimes(2)
    expect(db.insertSessionChunk).toHaveBeenCalledTimes(2)
    expect(db.insertSessionChunk).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', chunkIndex: 0, chunkText: 'chunk one', embeddingJson: '[0.1,0.2]' }),
    )
    expect(invalidateSessionQaCache).toHaveBeenCalled()
  })

  it('labels the user as You (displayName) and the other party as Them when chunking', async () => {
    db.getSession.mockReturnValue({ id: 's1', transcript: LONG_TRANSCRIPT })
    chunkText.mockReturnValue(['c'])
    embedText.mockResolvedValue([0.1])

    await indexSession('s1')

    const textPassedToChunker = chunkText.mock.calls[0][0] as string
    expect(textPassedToChunker).toContain('Sam: This is a long enough transcript line to pass the minimum')
    expect(textPassedToChunker).toContain('Them: And a reply from the other participant here')
  })
})

describe('backfillSessionIndex', () => {
  beforeEach(() => {
    Object.values(db).forEach((fn) => fn.mockReset())
    chunkText.mockReset()
    embedText.mockReset()
    invalidateSessionQaCache.mockReset()
    getSetting.mockReturnValue('You')
    chunkText.mockReturnValue(['c'])
    embedText.mockResolvedValue([0.1])
  })

  it('skips sessions that are already indexed', async () => {
    db.getIndexedSessionIds.mockReturnValue(new Set(['s1']))
    db.getAllSessionSummaries.mockReturnValue([
      { id: 's1', endedAt: 100, durationSeconds: 60 },
      { id: 's2', endedAt: 200, durationSeconds: 60 },
    ])
    db.getSession.mockReturnValue({ id: 's2', transcript: LONG_TRANSCRIPT })

    await backfillSessionIndex()

    // Only s2 gets indexed (s1 already indexed).
    expect(db.getSession).toHaveBeenCalledTimes(1)
    expect(db.getSession).toHaveBeenCalledWith('s2')
  })

  it('skips sessions that never ended or have zero duration', async () => {
    db.getIndexedSessionIds.mockReturnValue(new Set())
    db.getAllSessionSummaries.mockReturnValue([
      { id: 'a', endedAt: null, durationSeconds: 60 },
      { id: 'b', endedAt: 200, durationSeconds: 0 },
    ])

    await backfillSessionIndex()

    expect(db.getSession).not.toHaveBeenCalled()
  })

  it('ignores a concurrent backfill while one is already running (StrictMode double-fire)', async () => {
    db.getIndexedSessionIds.mockReturnValue(new Set())
    db.getAllSessionSummaries.mockReturnValue([{ id: 's1', endedAt: 100, durationSeconds: 60 }])
    db.getSession.mockReturnValue({ id: 's1', transcript: LONG_TRANSCRIPT })

    // Hold the embedding open so the two calls overlap.
    let resolveEmbed: (v: number[]) => void = () => {}
    embedText.mockReturnValue(new Promise<number[]>((r) => { resolveEmbed = r }))

    const first = backfillSessionIndex()
    const second = backfillSessionIndex() // should early-return (guard)
    resolveEmbed([0.1])
    await Promise.all([first, second])

    // Only the first run indexed s1; the second was a no-op.
    expect(db.getSession).toHaveBeenCalledTimes(1)
    expect(db.insertSessionChunk).toHaveBeenCalledTimes(1)
  })
})
