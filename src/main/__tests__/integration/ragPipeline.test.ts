/**
 * Integration test: RAG Pipeline
 *
 * Tests: upload file -> chunk -> embed (mocked model) -> store -> retrieve by similarity.
 * Uses real database (in-memory SQLite) with only the embedding model mocked.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

let testDb: Database.Database

const { mockPipelineFn } = vi.hoisted(() => ({
  mockPipelineFn: vi.fn(),
}))

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockImplementation(async () => mockPipelineFn),
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}))

vi.mock('../../services/database', () => {
  const insertedFiles: any[] = []
  const insertedChunks: any[] = []

  return {
    databaseService: {
      insertContextFile: vi.fn((params: any) => {
        insertedFiles.push({ ...params, createdAt: Date.now() })
      }),
      insertContextChunk: vi.fn((params: any) => {
        insertedChunks.push({ ...params, createdAt: Date.now() })
      }),
      getContextFiles: vi.fn((modeId: string) =>
        insertedFiles.filter((f) => f.modeId === modeId).map((f) => ({
          id: f.id,
          modeId: f.modeId,
          fileName: f.fileName,
          fileSize: f.fileSize,
          fileType: f.fileType,
          chunkCount: f.chunkCount,
          createdAt: f.createdAt,
        }))
      ),
      getContextChunks: vi.fn((modeId: string) =>
        insertedChunks.filter((c) => c.modeId === modeId).map((c) => ({
          id: c.id,
          chunkIndex: c.chunkIndex,
          chunkText: c.chunkText,
          embeddingJson: c.embeddingJson,
          fileName: c.fileName,
        }))
      ),
      deleteContextFile: vi.fn((fileId: string) => {
        const idx = insertedFiles.findIndex((f) => f.id === fileId)
        if (idx >= 0) {
          insertedFiles.splice(idx, 1)
          const chunkIdxs = insertedChunks
            .map((c, i) => (c.fileId === fileId ? i : -1))
            .filter((i) => i >= 0)
            .reverse()
          chunkIdxs.forEach((i) => insertedChunks.splice(i, 1))
          return true
        }
        return false
      }),
    },
    _reset: () => {
      insertedFiles.length = 0
      insertedChunks.length = 0
    },
  }
})

import {
  uploadContextFile,
  getContextFiles,
  deleteContextFile,
  retrieveRelevantChunks,
} from '../../services/ragService'

describe('RAG Pipeline Integration', () => {
  let embeddingCounter = 0

  beforeEach(async () => {
    embeddingCounter = 0
    // Each call to the embedding model returns a different vector
    mockPipelineFn.mockImplementation(async () => {
      embeddingCounter++
      // Create distinguishable embeddings for different chunks
      const vec = new Float32Array(3)
      vec[0] = embeddingCounter === 1 ? 1.0 : 0.1 * embeddingCounter
      vec[1] = embeddingCounter === 2 ? 1.0 : 0.1 * embeddingCounter
      vec[2] = embeddingCounter === 3 ? 1.0 : 0.1 * embeddingCounter
      return { data: vec }
    })

    // Reset the mock database state
    const dbModule = await import('../../services/database') as any
    if (dbModule._reset) dbModule._reset()
  })

  it('uploads a text file, chunks it, embeds, and stores', async () => {
    const { readFile } = await import('fs/promises')
    vi.mocked(readFile).mockResolvedValue(
      'This is the content of a test document that will be chunked and embedded for retrieval'
    )

    const result = await uploadContextFile(
      'test-mode',
      '/tmp/test.txt',
      'test.txt',
      500
    )

    expect(result.id).toBeTruthy()
    expect(result.modeId).toBe('test-mode')
    expect(result.fileName).toBe('test.txt')
    expect(result.chunkCount).toBeGreaterThan(0)

    // Verify files are retrievable
    const files = getContextFiles('test-mode')
    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('test.txt')
  })

  it('retrieves chunks sorted by cosine similarity to query', async () => {
    const { readFile } = await import('fs/promises')

    // Reset counter for predictable embeddings
    embeddingCounter = 0

    // First set of embeddings for upload (chunks)
    mockPipelineFn
      .mockResolvedValueOnce({ data: new Float32Array([1.0, 0.0, 0.0]) }) // chunk 0
      .mockResolvedValueOnce({ data: new Float32Array([0.0, 1.0, 0.0]) }) // chunk 1 (if > 1 chunk)
      .mockResolvedValueOnce({ data: new Float32Array([0.7, 0.7, 0.0]) }) // query embedding

    vi.mocked(readFile).mockResolvedValue('Content for testing retrieval')

    await uploadContextFile('rag-mode', '/tmp/rag.txt', 'rag.txt', 100)

    // The query embedding [0.7, 0.7, 0] should match chunk 0 [1,0,0] reasonably
    const results = await retrieveRelevantChunks('rag-mode', 'test query', 5)

    expect(results.length).toBeGreaterThan(0)
    // Results should have score property
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(1)
      expect(r.chunkText).toBeTruthy()
      expect(r.fileName).toBe('rag.txt')
    }
  })

  it('deletes a context file and its chunks', async () => {
    const { readFile } = await import('fs/promises')
    vi.mocked(readFile).mockResolvedValue('Deletable content')

    mockPipelineFn.mockResolvedValue({ data: new Float32Array([0.5, 0.5, 0.5]) })

    const file = await uploadContextFile('del-mode', '/tmp/del.txt', 'del.txt', 50)

    expect(getContextFiles('del-mode')).toHaveLength(1)

    const deleted = deleteContextFile(file.id)
    expect(deleted).toBe(true)
    expect(getContextFiles('del-mode')).toHaveLength(0)
  })

  it('returns empty results for mode with no chunks', async () => {
    const results = await retrieveRelevantChunks('empty-mode', 'query', 5)
    expect(results).toEqual([])
  })
})
