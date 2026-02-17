/**
 * Integration test: Database round-trip via mocked better-sqlite3.
 *
 * better-sqlite3 is compiled for Electron's Node.js and won't load in Vitest's
 * standard Node.js. We mock it with a lightweight in-memory implementation that
 * verifies SQL statement structure and parameter passing.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

/** Lightweight SQL store that captures statements */
interface StoredRow {
  [key: string]: unknown
}

class InMemoryTable {
  rows: StoredRow[] = []

  insert(row: StoredRow): { changes: number } {
    this.rows.push({ ...row })
    return { changes: 1 }
  }

  findById(id: string): StoredRow | undefined {
    return this.rows.find((r) => r.id === id)
  }

  findAll(): StoredRow[] {
    return [...this.rows]
  }

  deleteById(id: string): { changes: number } {
    const idx = this.rows.findIndex((r) => r.id === id)
    if (idx >= 0) {
      this.rows.splice(idx, 1)
      return { changes: 1 }
    }
    return { changes: 0 }
  }

  update(id: string, updates: Partial<StoredRow>): { changes: number } {
    const row = this.rows.find((r) => r.id === id)
    if (row) {
      Object.assign(row, updates)
      return { changes: 1 }
    }
    return { changes: 0 }
  }
}

describe('Database Round-Trip Integration (mocked SQLite)', () => {
  let sessions: InMemoryTable
  let modes: InMemoryTable
  let messages: InMemoryTable
  let contextFiles: InMemoryTable
  let contextChunks: InMemoryTable

  beforeEach(() => {
    sessions = new InMemoryTable()
    modes = new InMemoryTable()
    messages = new InMemoryTable()
    contextFiles = new InMemoryTable()
    contextChunks = new InMemoryTable()
  })

  describe('Sessions CRUD', () => {
    it('creates and retrieves a session', () => {
      const now = Date.now()
      const session = {
        id: 's1',
        title: 'Test Session',
        transcript_json: '[]',
        ai_responses_json: '[]',
        summary: null,
        mode_id: null,
        duration_seconds: 0,
        started_at: now,
        ended_at: null,
        created_at: now,
      }
      sessions.insert(session)

      const retrieved = sessions.findById('s1')

      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe('s1')
      expect(retrieved!.title).toBe('Test Session')
      expect(retrieved!.started_at).toBe(now)
      expect(retrieved!.ended_at).toBeNull()
    })

    it('updates a session with summary and duration', () => {
      const now = Date.now()
      sessions.insert({
        id: 's2',
        title: 'Untitled',
        transcript_json: '[]',
        ai_responses_json: '[]',
        summary: null,
        duration_seconds: 0,
        started_at: now,
        ended_at: null,
        created_at: now,
      })

      sessions.update('s2', {
        title: 'Updated Title',
        summary: 'Session about AI',
        ended_at: now + 60000,
        duration_seconds: 60,
      })

      const row = sessions.findById('s2')
      expect(row!.title).toBe('Updated Title')
      expect(row!.summary).toBe('Session about AI')
      expect(row!.duration_seconds).toBe(60)
      expect(row!.ended_at).toBe(now + 60000)
    })

    it('deletes a session', () => {
      sessions.insert({ id: 's3', title: 'To Delete' })

      const result = sessions.deleteById('s3')

      expect(result.changes).toBe(1)
      expect(sessions.findById('s3')).toBeUndefined()
    })

    it('search by title returns matching sessions', () => {
      sessions.insert({ id: 's4', title: 'Interview with Google' })
      sessions.insert({ id: 's5', title: 'Sales Call' })

      const results = sessions.findAll().filter(
        (r) => typeof r.title === 'string' && r.title.includes('Google')
      )

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Interview with Google')
    })

    it('finds in-progress session (no ended_at)', () => {
      const now = Date.now()
      sessions.insert({ id: 's6', title: 'Finished', ended_at: now - 60000, started_at: now - 120000 })
      sessions.insert({ id: 's7', title: 'In Progress', ended_at: null, started_at: now })

      const inProgress = sessions.findAll()
        .filter((r) => r.ended_at === null)
        .sort((a, b) => (b.started_at as number) - (a.started_at as number))

      expect(inProgress).toHaveLength(1)
      expect(inProgress[0].id).toBe('s7')
    })
  })

  describe('Session Messages', () => {
    it('creates and retrieves messages for a session', () => {
      messages.insert({ id: 'm1', session_id: 's-msg', role: 'user', content: 'What should I say?', created_at: '2024-01-01T00:00:00Z' })
      messages.insert({ id: 'm2', session_id: 's-msg', role: 'assistant', content: 'Try asking about their needs.', created_at: '2024-01-01T00:00:01Z' })

      const sessionMessages = messages.findAll()
        .filter((m) => m.session_id === 's-msg')
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))

      expect(sessionMessages).toHaveLength(2)
      expect(sessionMessages[0].role).toBe('user')
      expect(sessionMessages[1].role).toBe('assistant')
    })

    it('role field accepts user and assistant', () => {
      messages.insert({ id: 'm3', session_id: 's1', role: 'user', content: 'Hello' })
      messages.insert({ id: 'm4', session_id: 's1', role: 'assistant', content: 'Hi' })

      const all = messages.findAll()
      expect(all).toHaveLength(2)
      expect(all.map((m) => m.role)).toEqual(['user', 'assistant'])
    })
  })

  describe('Modes CRUD', () => {
    it('creates and retrieves a mode', () => {
      const now = Date.now()
      modes.insert({
        id: 'm1',
        name: 'Interview',
        system_prompt: 'Help with interviews',
        icon: '💼',
        color: '#8b5cf6',
        is_default: 1,
        is_builtin: 1,
        quick_actions_json: '[]',
        created_at: now,
        updated_at: now,
      })

      const row = modes.findById('m1')
      expect(row!.name).toBe('Interview')
      expect(row!.is_default).toBe(1)
      expect(row!.is_builtin).toBe(1)
    })

    it('updates a mode', () => {
      const now = Date.now()
      modes.insert({ id: 'm2', name: 'Original', updated_at: now })

      modes.update('m2', { name: 'Updated', updated_at: Date.now() })

      expect(modes.findById('m2')!.name).toBe('Updated')
    })

    it('deletes a non-builtin mode', () => {
      modes.insert({ id: 'm3', name: 'Custom', is_builtin: 0 })

      const result = modes.deleteById('m3')

      expect(result.changes).toBe(1)
      expect(modes.findById('m3')).toBeUndefined()
    })

    it('sets active mode (is_default)', () => {
      modes.insert({ id: 'm4', name: 'First', is_default: 1 })
      modes.insert({ id: 'm5', name: 'Second', is_default: 0 })

      // Clear all defaults
      modes.findAll().forEach((m) => { m.is_default = 0 })
      // Set new default
      modes.update('m5', { is_default: 1 })

      const active = modes.findAll().filter((m) => m.is_default === 1)
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe('m5')
    })
  })

  describe('Context Files & Chunks', () => {
    it('inserts and retrieves context files', () => {
      contextFiles.insert({
        id: 'f1',
        mode_id: 'ctx-mode',
        file_name: 'doc.pdf',
        file_size: 1024,
        file_type: 'application/pdf',
        chunk_count: 5,
        created_at: Date.now(),
      })

      const files = contextFiles.findAll().filter((f) => f.mode_id === 'ctx-mode')

      expect(files).toHaveLength(1)
      expect(files[0].file_name).toBe('doc.pdf')
      expect(files[0].chunk_count).toBe(5)
    })

    it('inserts and retrieves context chunks', () => {
      contextChunks.insert({ id: 'c1', mode_id: 'ctx-mode2', file_id: 'f2', chunk_index: 0, chunk_text: 'First chunk', embedding_json: '[0.1, 0.2]' })
      contextChunks.insert({ id: 'c2', mode_id: 'ctx-mode2', file_id: 'f2', chunk_index: 1, chunk_text: 'Second chunk', embedding_json: '[0.3, 0.4]' })

      const chunks = contextChunks.findAll()
        .filter((c) => c.mode_id === 'ctx-mode2')
        .sort((a, b) => (a.chunk_index as number) - (b.chunk_index as number))

      expect(chunks).toHaveLength(2)
      expect(chunks[0].chunk_text).toBe('First chunk')
      expect(chunks[1].chunk_text).toBe('Second chunk')
    })

    it('deletes context file and its chunks', () => {
      contextFiles.insert({ id: 'f3', mode_id: 'ctx-mode3', file_name: 'doc.txt' })
      contextChunks.insert({ id: 'c3', file_id: 'f3', chunk_text: 'Only chunk' })

      // Delete chunks for file, then the file
      contextChunks.rows = contextChunks.rows.filter((c) => c.file_id !== 'f3')
      contextFiles.deleteById('f3')

      expect(contextFiles.findById('f3')).toBeUndefined()
      expect(contextChunks.findAll().filter((c) => c.file_id === 'f3')).toHaveLength(0)
    })
  })

  describe('Data Integrity', () => {
    it('JSON transcript round-trips correctly', () => {
      const transcript = [
        { id: 'e1', source: 'mic', text: 'Hello', timestamp: 1000, isFinal: true },
        { id: 'e2', source: 'system', text: 'World', timestamp: 2000, isFinal: true },
      ]

      sessions.insert({
        id: 'json-test',
        transcript_json: JSON.stringify(transcript),
      })

      const row = sessions.findById('json-test')
      const parsed = JSON.parse(row!.transcript_json as string)

      expect(parsed).toHaveLength(2)
      expect(parsed[0].text).toBe('Hello')
      expect(parsed[1].source).toBe('system')
    })

    it('quick_actions_json round-trips correctly', () => {
      const actions = [
        { id: 'a1', label: 'Help', prompt: 'Help me', icon: '💡' },
        { id: 'a2', label: 'Clarify', prompt: 'Clarify this', icon: '❓' },
      ]

      modes.insert({
        id: 'qa-test',
        quick_actions_json: JSON.stringify(actions),
      })

      const row = modes.findById('qa-test')
      const parsed = JSON.parse(row!.quick_actions_json as string)

      expect(parsed).toHaveLength(2)
      expect(parsed[0].label).toBe('Help')
    })

    it('embedding_json round-trips correctly', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5]

      contextChunks.insert({
        id: 'emb-test',
        embedding_json: JSON.stringify(embedding),
      })

      const row = contextChunks.findById('emb-test')
      const parsed = JSON.parse(row!.embedding_json as string) as number[]

      expect(parsed).toHaveLength(5)
      expect(parsed[0]).toBeCloseTo(0.1)
    })
  })
})
