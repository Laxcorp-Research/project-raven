import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockInsertContextFile, mockInsertContextChunk, mockGetContextFiles, mockGetContextChunks, mockDeleteContextFile } = vi.hoisted(() => ({
  mockInsertContextFile: vi.fn(),
  mockInsertContextChunk: vi.fn(),
  mockGetContextFiles: vi.fn(),
  mockGetContextChunks: vi.fn(),
  mockDeleteContextFile: vi.fn(),
}))

vi.mock('../services/database', () => ({
  databaseService: {
    insertContextFile: mockInsertContextFile,
    insertContextChunk: mockInsertContextChunk,
    getContextFiles: mockGetContextFiles,
    getContextChunks: mockGetContextChunks,
    deleteContextFile: mockDeleteContextFile,
  },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockPipelineFn = vi.fn()

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn().mockImplementation(async () => mockPipelineFn),
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('This is test content with enough words to chunk properly'),
}))

import {
  uploadContextFile,
  getContextFiles,
  deleteContextFile,
  retrieveRelevantChunks,
} from '../services/ragService'

describe('ragService', () => {
  describe('chunkText (tested via uploadContextFile)', () => {
    beforeEach(() => {
      mockPipelineFn.mockResolvedValue({
        data: new Float32Array([0.1, 0.2, 0.3]),
      })
    })

    it('handles file with small text (single chunk)', async () => {
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue('Small text file')

      const result = await uploadContextFile(
        'mode-1',
        '/path/to/file.txt',
        'file.txt',
        100
      )

      expect(result.chunkCount).toBe(1)
      expect(mockInsertContextFile).toHaveBeenCalledWith(
        expect.objectContaining({
          modeId: 'mode-1',
          fileName: 'file.txt',
          fileSize: 100,
          fileType: 'text/plain',
          chunkCount: 1,
        })
      )
    })

    it('throws for empty file', async () => {
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue('   ')

      await expect(
        uploadContextFile('mode-1', '/path/to/empty.txt', 'empty.txt', 0)
      ).rejects.toThrow('File contains no extractable text')
    })

    it('stores chunks with embeddings in database', async () => {
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue('Hello world test content')

      await uploadContextFile('mode-1', '/path/to/file.txt', 'file.txt', 50)

      expect(mockInsertContextChunk).toHaveBeenCalled()
      const call = mockInsertContextChunk.mock.calls[0][0]
      expect(call.modeId).toBe('mode-1')
      expect(call.fileName).toBe('file.txt')
      expect(call.chunkIndex).toBe(0)
      expect(call.chunkText).toBe('Hello world test content')
      expect(JSON.parse(call.embeddingJson)).toEqual([
        expect.closeTo(0.1),
        expect.closeTo(0.2),
        expect.closeTo(0.3),
      ])
    })

    it('reports progress through callback', async () => {
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue('Some content')

      const onProgress = vi.fn()

      await uploadContextFile(
        'mode-1',
        '/path/to/file.txt',
        'file.txt',
        50,
        onProgress
      )

      expect(onProgress).toHaveBeenCalledWith('parsing', 0, 1)
      expect(onProgress).toHaveBeenCalledWith('chunking', 0, 1)
      expect(onProgress).toHaveBeenCalledWith('embedding', expect.any(Number), expect.any(Number))
      expect(onProgress).toHaveBeenCalledWith('storing', expect.any(Number), expect.any(Number))
    })

    it('detects file type from extension', async () => {
      const { readFile } = await import('fs/promises')
      vi.mocked(readFile).mockResolvedValue('Markdown content')

      const result = await uploadContextFile(
        'mode-1',
        '/path/to/doc.md',
        'doc.md',
        100
      )

      expect(result.fileType).toBe('text/markdown')
    })
  })

  describe('getContextFiles', () => {
    it('delegates to databaseService', () => {
      const mockFiles = [
        { id: '1', modeId: 'm1', fileName: 'a.txt', fileSize: 10, fileType: 'text/plain', chunkCount: 1, createdAt: 123 },
      ]
      mockGetContextFiles.mockReturnValue(mockFiles)

      const result = getContextFiles('m1')

      expect(result).toEqual(mockFiles)
      expect(mockGetContextFiles).toHaveBeenCalledWith('m1')
    })
  })

  describe('deleteContextFile', () => {
    it('delegates to databaseService', () => {
      mockDeleteContextFile.mockReturnValue(true)

      const result = deleteContextFile('file-1')

      expect(result).toBe(true)
      expect(mockDeleteContextFile).toHaveBeenCalledWith('file-1')
    })
  })

  describe('retrieveRelevantChunks', () => {
    beforeEach(() => {
      mockPipelineFn.mockResolvedValue({
        data: new Float32Array([1, 0, 0]),
      })
    })

    it('returns empty array when no chunks exist', async () => {
      mockGetContextChunks.mockReturnValue([])

      const result = await retrieveRelevantChunks('mode-1', 'query')

      expect(result).toEqual([])
    })

    it('returns chunks sorted by similarity score', async () => {
      mockGetContextChunks.mockReturnValue([
        { id: '1', chunkIndex: 0, chunkText: 'Relevant content', embeddingJson: JSON.stringify([0.9, 0.1, 0]), fileName: 'a.txt' },
        { id: '2', chunkIndex: 1, chunkText: 'Less relevant', embeddingJson: JSON.stringify([0.1, 0.9, 0]), fileName: 'a.txt' },
        { id: '3', chunkIndex: 2, chunkText: 'Most relevant', embeddingJson: JSON.stringify([1, 0, 0]), fileName: 'b.txt' },
      ])

      const result = await retrieveRelevantChunks('mode-1', 'query', 3)

      expect(result.length).toBeGreaterThan(0)
      // Should be sorted by score descending
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score)
      }
      expect(result[0].chunkText).toBe('Most relevant')
    })

    it('respects topK parameter', async () => {
      mockGetContextChunks.mockReturnValue([
        { id: '1', chunkIndex: 0, chunkText: 'A', embeddingJson: JSON.stringify([1, 0, 0]), fileName: 'a.txt' },
        { id: '2', chunkIndex: 1, chunkText: 'B', embeddingJson: JSON.stringify([0.9, 0.1, 0]), fileName: 'a.txt' },
        { id: '3', chunkIndex: 2, chunkText: 'C', embeddingJson: JSON.stringify([0.8, 0.2, 0]), fileName: 'a.txt' },
      ])

      const result = await retrieveRelevantChunks('mode-1', 'query', 1)

      expect(result.length).toBe(1)
    })
  })
})
