import { vi, describe, it, expect, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock better-sqlite3 at the module level (all variables hoisted)
// ---------------------------------------------------------------------------

const {
  mockRun,
  mockGet,
  mockAll,
  mockExec,
  mockPrepare,
  mockPragma,
  mockClose,
  mockTransactionFn,
  mockDb,
  MockDatabaseConstructor,
} = vi.hoisted(() => {
  const _mockRun = vi.fn().mockReturnValue({ changes: 1 })
  const _mockGet = vi.fn()
  const _mockAll = vi.fn().mockReturnValue([])
  const _mockExec = vi.fn()

  const _mockPrepare = vi.fn().mockReturnValue({
    run: _mockRun,
    get: _mockGet,
    all: _mockAll,
  })

  const _mockPragma = vi.fn()
  const _mockClose = vi.fn()

  const _mockTransactionFn = vi.fn((fn: () => void) => {
    const wrapped = (...args: unknown[]) => fn.apply(null, args as [])
    return wrapped
  })

  const _mockDb = {
    prepare: _mockPrepare,
    exec: _mockExec,
    pragma: _mockPragma,
    close: _mockClose,
    transaction: _mockTransactionFn,
  }

  const _MockDatabaseConstructor = vi.fn(() => _mockDb)

  return {
    mockRun: _mockRun,
    mockGet: _mockGet,
    mockAll: _mockAll,
    mockExec: _mockExec,
    mockPrepare: _mockPrepare,
    mockPragma: _mockPragma,
    mockClose: _mockClose,
    mockTransactionFn: _mockTransactionFn,
    mockDb: _mockDb,
    MockDatabaseConstructor: _MockDatabaseConstructor,
  }
})

vi.mock('better-sqlite3', () => ({
  default: MockDatabaseConstructor,
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/raven-test'),
  },
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  },
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}))

vi.mock('../../main/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../services/migrations/005_add_session_messages', () => ({
  up: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import under test (after mocks are wired)
// ---------------------------------------------------------------------------

import { databaseService } from '../services/database'
import type { SessionRow, ModeRow } from '../services/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks(): void {
  mockRun.mockReset().mockReturnValue({ changes: 1 })
  mockGet.mockReset()
  mockAll.mockReset().mockReturnValue([])
  mockExec.mockReset()
  mockPrepare.mockReset().mockReturnValue({
    run: mockRun,
    get: mockGet,
    all: mockAll,
  })
  mockPragma.mockReset()
  mockClose.mockReset()
  mockTransactionFn.mockReset().mockImplementation((fn: () => void) => {
    const wrapped = (...args: unknown[]) => fn.apply(null, args as [])
    return wrapped
  })
  MockDatabaseConstructor.mockReset().mockImplementation(function () { return mockDb })
}

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'session-1',
    title: 'Test Session',
    transcript_json: '[]',
    ai_responses_json: '[]',
    summary: null,
    mode_id: null,
    duration_seconds: 0,
    started_at: 1000,
    ended_at: null,
    created_at: 1000,
    ...overrides,
  }
}

function makeModeRow(overrides: Partial<ModeRow> = {}): ModeRow {
  return {
    id: 'mode-1',
    name: 'Test Mode',
    system_prompt: 'Be helpful',
    icon: '🎯',
    color: '#6366f1',
    is_default: 0,
    is_builtin: 0,
    notes_template_json: null,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DatabaseService', () => {
  beforeEach(() => {
    resetMocks()
    // Reset the singleton's internal db reference so initialize() runs fresh.
    // We access the private field via bracket notation.
    ;(databaseService as any).db = null
  })

  // ============================
  // initialize()
  // ============================

  describe('initialize', () => {
    it('creates the database and sets WAL mode', () => {
      mockAll.mockReturnValue([]) // no applied migrations

      databaseService.initialize()

      expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL')
    })

    it('runs migrations that have not been applied yet', () => {
      mockAll.mockReturnValue([]) // no applied migrations

      databaseService.initialize()

      // The migrate() method calls exec() for the migrations table creation
      expect(mockExec).toHaveBeenCalled()
      // transaction() should be called once per unapplied migration (8 total)
      expect(mockTransactionFn).toHaveBeenCalledTimes(8)
    })

    it('skips migrations already applied', () => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])

      databaseService.initialize()

      expect(mockTransactionFn).not.toHaveBeenCalled()
    })

    it('only runs unapplied migrations', () => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
      ])

      databaseService.initialize()

      // 6 unapplied migrations remain (003 through 008)
      expect(mockTransactionFn).toHaveBeenCalledTimes(6)
    })

    it('is idempotent — second call is a no-op', () => {
      mockAll.mockReturnValue([])

      databaseService.initialize()
      const execCallCount = mockExec.mock.calls.length

      databaseService.initialize()

      expect(mockExec.mock.calls.length).toBe(execCallCount)
    })
  })

  // ============================
  // Session CRUD
  // ============================

  describe('createSession', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('inserts a row and returns the full session with createdAt', () => {
      const session = databaseService.createSession({
        id: 'sess-abc',
        title: 'My Session',
        transcript: [],
        aiResponses: [],
        summary: null,
        modeId: null,
        durationSeconds: 0,
        startedAt: 5000,
        endedAt: null,
      })

      expect(mockPrepare).toHaveBeenCalled()
      expect(mockRun).toHaveBeenCalled()
      expect(session.id).toBe('sess-abc')
      expect(session.title).toBe('My Session')
      expect(session.createdAt).toBeGreaterThan(0)
    })

    it('serializes transcript and aiResponses to JSON', () => {
      const transcript = [{ id: 'e1', source: 'mic' as const, text: 'Hi', timestamp: 1, isFinal: true }]

      databaseService.createSession({
        id: 'sess-json',
        title: 'JSON test',
        transcript,
        aiResponses: [],
        summary: null,
        modeId: null,
        durationSeconds: 0,
        startedAt: 5000,
        endedAt: null,
      })

      const runArgs = mockRun.mock.calls[0]
      expect(runArgs[2]).toBe(JSON.stringify(transcript))
      expect(runArgs[3]).toBe('[]')
    })

    it('throws when database is not initialized', () => {
      ;(databaseService as any).db = null

      expect(() =>
        databaseService.createSession({
          id: 'x',
          title: 'x',
          transcript: [],
          aiResponses: [],
          summary: null,
          modeId: null,
          durationSeconds: 0,
          startedAt: 0,
          endedAt: null,
        })
      ).toThrow('Database not initialized')
    })
  })

  describe('getSession', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns the session when found', () => {
      mockGet.mockReturnValue(makeSessionRow({ id: 'sess-1', title: 'Found' }))
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.getSession('sess-1')

      expect(result).not.toBeNull()
      expect(result!.id).toBe('sess-1')
      expect(result!.title).toBe('Found')
    })

    it('returns null when not found', () => {
      mockGet.mockReturnValue(undefined)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.getSession('missing')

      expect(result).toBeNull()
    })
  })

  describe('getAllSessions', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns mapped sessions from all rows', () => {
      mockAll.mockReturnValue([
        makeSessionRow({ id: 'a' }),
        makeSessionRow({ id: 'b' }),
      ])
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const sessions = databaseService.getAllSessions()

      expect(sessions).toHaveLength(2)
      expect(sessions[0].id).toBe('a')
      expect(sessions[1].id).toBe('b')
    })

    it('returns empty array when no sessions exist', () => {
      mockAll.mockReturnValue([])
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const sessions = databaseService.getAllSessions()

      expect(sessions).toEqual([])
    })
  })

  describe('updateSession', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('builds SET clause for title update', () => {
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      databaseService.updateSession('sess-1', { title: 'New Title' })

      const sql = mockPrepare.mock.calls[0][0] as string
      expect(sql).toContain('updated_at = ?')
      expect(sql).toContain('title = ?')
      expect(mockRun).toHaveBeenCalledWith(expect.any(Number), 'New Title', 'sess-1')
    })

    it('builds SET clause for multiple fields', () => {
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      databaseService.updateSession('sess-1', {
        title: 'Updated',
        durationSeconds: 300,
        endedAt: 9999,
      })

      const sql = mockPrepare.mock.calls[0][0] as string
      expect(sql).toContain('updated_at = ?')
      expect(sql).toContain('title = ?')
      expect(sql).toContain('duration_seconds = ?')
      expect(sql).toContain('ended_at = ?')
    })

    it('serializes transcript to JSON', () => {
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const transcript = [{ id: 'e1', source: 'mic' as const, text: 'Hello', timestamp: 1, isFinal: true }]
      databaseService.updateSession('sess-1', { transcript })

      expect(mockRun).toHaveBeenCalledWith(expect.any(Number), JSON.stringify(transcript), 'sess-1')
    })

    it('always bumps updated_at even with empty updates', () => {
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      databaseService.updateSession('sess-1', {})

      const sql = mockPrepare.mock.calls[0][0] as string
      expect(sql).toContain('updated_at = ?')
      expect(mockRun).toHaveBeenCalledWith(expect.any(Number), 'sess-1')
    })
  })

  describe('deleteSession', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns true when a row was deleted', () => {
      mockRun.mockReturnValue({ changes: 1 })
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      expect(databaseService.deleteSession('sess-1')).toBe(true)
    })

    it('returns false when no row was deleted', () => {
      mockRun.mockReturnValue({ changes: 0 })
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      expect(databaseService.deleteSession('nonexistent')).toBe(false)
    })
  })

  // ============================
  // Session Messages
  // ============================

  describe('getSessionMessages', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns messages for a session', () => {
      const rows = [
        { id: 'm1', sessionId: 'sess-1', role: 'user', content: 'Hello', createdAt: '2025-01-01' },
        { id: 'm2', sessionId: 'sess-1', role: 'assistant', content: 'Hi', createdAt: '2025-01-01' },
      ]
      mockAll.mockReturnValue(rows)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const messages = databaseService.getSessionMessages('sess-1')

      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe('user')
      expect(messages[1].role).toBe('assistant')
    })

    it('returns empty array when no messages', () => {
      mockAll.mockReturnValue([])
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const messages = databaseService.getSessionMessages('sess-1')

      expect(messages).toEqual([])
    })
  })

  describe('addSessionMessage', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('inserts a message and returns a SessionMessage object', () => {
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const msg = databaseService.addSessionMessage('sess-1', 'user', 'Hello world')

      expect(mockRun).toHaveBeenCalled()
      expect(msg.sessionId).toBe('sess-1')
      expect(msg.role).toBe('user')
      expect(msg.content).toBe('Hello world')
      expect(msg.id).toBeDefined()
      expect(msg.createdAt).toBeDefined()
    })
  })

  // ============================
  // searchSessions
  // ============================

  describe('searchSessions', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('uses LIKE pattern for title and transcript search', () => {
      mockAll.mockReturnValue([makeSessionRow({ id: 'match-1', title: 'Meeting' })])
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const results = databaseService.searchSessions('Meeting')

      expect(mockPrepare).toHaveBeenCalled()
      const sql = mockPrepare.mock.calls[0][0] as string
      expect(sql).toContain('LIKE')
      expect(mockAll).toHaveBeenCalledWith('%Meeting%', '%Meeting%', '%Meeting%')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('match-1')
    })

    it('returns empty array when nothing matches', () => {
      mockAll.mockReturnValue([])
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const results = databaseService.searchSessions('nonexistent')

      expect(results).toEqual([])
    })
  })

  // ============================
  // Mode CRUD
  // ============================

  describe('createMode', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('inserts a mode and returns the full Mode with generated id/timestamps', () => {
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const mode = databaseService.createMode({
        name: 'Interview',
        systemPrompt: 'Help with interviews',
        icon: '🎤',
        color: '#3b82f6',
        isDefault: false,
        isBuiltin: false,
        notesTemplate: null,
      })

      expect(mockRun).toHaveBeenCalled()
      expect(mode.id).toBeDefined()
      expect(mode.name).toBe('Interview')
      expect(mode.createdAt).toBeGreaterThan(0)
      expect(mode.updatedAt).toBeGreaterThan(0)
    })

    it('serializes notesTemplate to JSON', () => {
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const notes = [{ id: 'n1', title: 'Key Points', instructions: 'List main points' }]
      databaseService.createMode({
        name: 'Notes',
        systemPrompt: 'Take notes',
        icon: '📋',
        color: '#8b5cf6',
        isDefault: false,
        isBuiltin: false,
        notesTemplate: notes,
      })

      const args = mockRun.mock.calls[0]
      expect(args[7]).toBe(JSON.stringify(notes))
    })

    it('passes null for notesTemplate when absent', () => {
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      databaseService.createMode({
        name: 'Simple',
        systemPrompt: 'Simple',
        icon: '🎯',
        color: '#000',
        isDefault: false,
        isBuiltin: false,
        notesTemplate: null,
      })

      const args = mockRun.mock.calls[0]
      expect(args[7]).toBeNull()
    })
  })

  describe('getMode', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns mode when found', () => {
      mockGet.mockReturnValue(makeModeRow({ id: 'mode-1', name: 'Interview' }))
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const mode = databaseService.getMode('mode-1')

      expect(mode).not.toBeNull()
      expect(mode!.id).toBe('mode-1')
      expect(mode!.name).toBe('Interview')
    })

    it('returns null when not found', () => {
      mockGet.mockReturnValue(undefined)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const mode = databaseService.getMode('missing')

      expect(mode).toBeNull()
    })

    it('converts is_default and is_builtin to booleans', () => {
      mockGet.mockReturnValue(makeModeRow({ is_default: 1, is_builtin: 1 }))
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const mode = databaseService.getMode('mode-1')

      expect(mode!.isDefault).toBe(true)
      expect(mode!.isBuiltin).toBe(true)
    })
  })

  describe('getAllModes', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns all modes mapped from rows', () => {
      mockAll.mockReturnValue([
        makeModeRow({ id: 'm1', name: 'Alpha' }),
        makeModeRow({ id: 'm2', name: 'Beta' }),
      ])
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const modes = databaseService.getAllModes()

      expect(modes).toHaveLength(2)
      expect(modes[0].name).toBe('Alpha')
      expect(modes[1].name).toBe('Beta')
    })
  })

  describe('updateMode', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('updates name and returns the refreshed mode', () => {
      // First call: UPDATE, second call: SELECT (getMode)
      const updatedRow = makeModeRow({ id: 'mode-1', name: 'Renamed' })
      mockGet.mockReturnValue(updatedRow)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.updateMode('mode-1', { name: 'Renamed' })

      expect(mockRun).toHaveBeenCalled()
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Renamed')
    })

    it('clears other defaults when isDefault is set to true', () => {
      mockGet.mockReturnValue(makeModeRow({ id: 'mode-1', is_default: 1 }))
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      databaseService.updateMode('mode-1', { isDefault: true })

      // First run call clears existing defaults, second does the update
      expect(mockRun).toHaveBeenCalledTimes(2)
    })

    it('serializes notesTemplate when provided', () => {
      mockGet.mockReturnValue(makeModeRow())
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const notes = [{ id: 'n1', title: 'Sec', instructions: 'Do stuff' }]
      databaseService.updateMode('mode-1', { notesTemplate: notes })

      const sql = mockPrepare.mock.calls[0][0] as string
      expect(sql).toContain('notes_template_json = ?')
    })
  })

  describe('deleteMode', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns error when mode not found', () => {
      mockGet.mockReturnValue(undefined)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.deleteMode('nonexistent')

      expect(result).toEqual({ success: false, error: 'Mode not found' })
    })

    it('refuses to delete a builtin mode', () => {
      mockGet.mockReturnValue(makeModeRow({ is_builtin: 1 }))
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.deleteMode('builtin-1')

      expect(result).toEqual({ success: false, error: 'Cannot delete a built-in mode' })
    })

    it('refuses to delete the active (default) mode', () => {
      mockGet.mockReturnValue(makeModeRow({ is_default: 1 }))
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.deleteMode('active-1')

      expect(result).toEqual({ success: false, error: 'Cannot delete the active mode' })
    })

    it('deletes a non-builtin, non-default mode successfully', () => {
      mockGet.mockReturnValue(makeModeRow({ is_default: 0, is_builtin: 0 }))
      mockRun.mockReturnValue({ changes: 1 })
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.deleteMode('mode-1')

      expect(result).toEqual({ success: true })
    })
  })

  describe('duplicateMode', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns null when original mode not found', () => {
      mockGet.mockReturnValue(undefined)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.duplicateMode('missing', 'Copy')

      expect(result).toBeNull()
    })

    it('creates a new mode with the given name based on the original', () => {
      const original = makeModeRow({
        id: 'orig',
        name: 'Original',
        system_prompt: 'Be smart',
        icon: '🧠',
        color: '#ff0000',
      })
      mockGet.mockReturnValue(original)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.duplicateMode('orig', 'Copy of Original')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Copy of Original')
      expect(result!.systemPrompt).toBe('Be smart')
      expect(result!.icon).toBe('🧠')
      expect(result!.isDefault).toBe(false)
      expect(result!.isBuiltin).toBe(false)
    })
  })

  // ============================
  // Active Mode
  // ============================

  describe('getActiveMode', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('returns the default mode when one exists', () => {
      mockGet.mockReturnValue(makeModeRow({ is_default: 1, name: 'Active' }))
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const mode = databaseService.getActiveMode()

      expect(mode).not.toBeNull()
      expect(mode!.isDefault).toBe(true)
    })

    it('returns null when no default mode exists', () => {
      mockGet.mockReturnValue(undefined)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const mode = databaseService.getActiveMode()

      expect(mode).toBeNull()
    })
  })

  describe('setActiveMode', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('clears all defaults then sets the new one', () => {
      mockRun.mockReturnValue({ changes: 1 })
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.setActiveMode('mode-x')

      // First run: clear defaults, second run: set new default
      expect(mockRun).toHaveBeenCalledTimes(2)
      expect(result).toBe(true)
    })

    it('returns false when mode does not exist', () => {
      mockRun
        .mockReturnValueOnce({ changes: 0 }) // clear defaults
        .mockReturnValueOnce({ changes: 0 }) // set new default
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const result = databaseService.setActiveMode('nonexistent')

      expect(result).toBe(false)
    })
  })

  // ============================
  // Context Files
  // ============================

  describe('context file operations', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    describe('insertContextFile', () => {
      it('inserts a context file row', () => {
        mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

        databaseService.insertContextFile({
          id: 'cf-1',
          modeId: 'mode-1',
          fileName: 'doc.pdf',
          fileSize: 1024,
          fileType: 'application/pdf',
          chunkCount: 5,
        })

        expect(mockRun).toHaveBeenCalledWith(
          'cf-1', 'mode-1', 'doc.pdf', 1024, 'application/pdf', 5, expect.any(Number)
        )
      })
    })

    describe('getContextFiles', () => {
      it('returns mapped context files for a mode', () => {
        mockAll.mockReturnValue([
          {
            id: 'cf-1',
            mode_id: 'mode-1',
            file_name: 'doc.pdf',
            file_size: 1024,
            file_type: 'application/pdf',
            chunk_count: 5,
            created_at: 9999,
          },
        ])
        mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

        const files = databaseService.getContextFiles('mode-1')

        expect(files).toHaveLength(1)
        expect(files[0].fileName).toBe('doc.pdf')
        expect(files[0].modeId).toBe('mode-1')
        expect(files[0].chunkCount).toBe(5)
      })
    })

    describe('deleteContextFile', () => {
      it('deletes chunks first, then the file; returns true on success', () => {
        mockRun.mockReturnValue({ changes: 1 })
        mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

        const result = databaseService.deleteContextFile('cf-1')

        // Two prepare calls: one for chunks, one for file
        expect(mockPrepare).toHaveBeenCalledTimes(2)
        expect(result).toBe(true)
      })

      it('returns false when file does not exist', () => {
        mockRun
          .mockReturnValueOnce({ changes: 0 }) // chunks delete
          .mockReturnValueOnce({ changes: 0 }) // file delete
        mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

        const result = databaseService.deleteContextFile('missing')

        expect(result).toBe(false)
      })
    })
  })

  // ============================
  // rowToSession JSON fallback
  // ============================

  describe('rowToSession corrupted JSON handling', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('falls back to empty arrays when transcript JSON is corrupted', () => {
      const corruptedRow = makeSessionRow({
        transcript_json: '{{{invalid json',
        ai_responses_json: 'not-json-either',
      })
      mockGet.mockReturnValue(corruptedRow)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const session = databaseService.getSession('corrupt')

      expect(session).not.toBeNull()
      expect(session!.transcript).toEqual([])
      expect(session!.aiResponses).toEqual([])
    })

    it('parses valid JSON normally alongside corrupted field', () => {
      const mixedRow = makeSessionRow({
        transcript_json: JSON.stringify([{ id: 'e1', text: 'Hello' }]),
        ai_responses_json: 'CORRUPTED',
      })
      mockGet.mockReturnValue(mixedRow)
      mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })

      const session = databaseService.getSession('mixed')

      expect(session!.transcript).toHaveLength(1)
      expect(session!.aiResponses).toEqual([])
    })
  })

  // ============================
  // close()
  // ============================

  describe('close', () => {
    beforeEach(() => {
      mockAll.mockReturnValue([
        { name: '001_create_sessions' },
        { name: '002_create_modes' },
        { name: '003_add_notes_template' },
        { name: '004_add_session_summary' },
        { name: '005_add_session_messages' },
        { name: '006_add_context_chunks' },
        { name: '007_add_session_insights' },
        { name: '008_add_session_updated_at' },
      ])
      databaseService.initialize()
      resetMocks()
    })

    it('closes the db connection and nulls the reference', () => {
      databaseService.close()

      expect(mockClose).toHaveBeenCalled()
      expect((databaseService as any).db).toBeNull()
    })

    it('is safe to call close twice', () => {
      databaseService.close()
      databaseService.close()

      expect(mockClose).toHaveBeenCalledTimes(1)
    })
  })

  // ============================
  // Uninitialized guard
  // ============================

  describe('uninitialized database guard', () => {
    beforeEach(() => {
      ;(databaseService as any).db = null
    })

    it('getSession throws', () => {
      expect(() => databaseService.getSession('x')).toThrow('Database not initialized')
    })

    it('getAllSessions throws', () => {
      expect(() => databaseService.getAllSessions()).toThrow('Database not initialized')
    })

    it('updateSession throws', () => {
      expect(() => databaseService.updateSession('x', { title: 'y' })).toThrow('Database not initialized')
    })

    it('deleteSession throws', () => {
      expect(() => databaseService.deleteSession('x')).toThrow('Database not initialized')
    })

    it('searchSessions throws', () => {
      expect(() => databaseService.searchSessions('q')).toThrow('Database not initialized')
    })

    it('getSessionMessages throws', () => {
      expect(() => databaseService.getSessionMessages('x')).toThrow('Database not initialized')
    })

    it('addSessionMessage throws', () => {
      expect(() => databaseService.addSessionMessage('x', 'user', 'hi')).toThrow('Database not initialized')
    })

    it('createMode throws', () => {
      expect(() =>
        databaseService.createMode({
          name: 'x', systemPrompt: 'x', icon: 'x', color: 'x',
          isDefault: false, isBuiltin: false, notesTemplate: null,
        })
      ).toThrow('Database not initialized')
    })

    it('getAllModes throws', () => {
      expect(() => databaseService.getAllModes()).toThrow('Database not initialized')
    })

    it('getMode throws', () => {
      expect(() => databaseService.getMode('x')).toThrow('Database not initialized')
    })

    it('getActiveMode throws', () => {
      expect(() => databaseService.getActiveMode()).toThrow('Database not initialized')
    })

    it('setActiveMode throws', () => {
      expect(() => databaseService.setActiveMode('x')).toThrow('Database not initialized')
    })

    it('deleteMode throws', () => {
      expect(() => databaseService.deleteMode('x')).toThrow('Database not initialized')
    })

    it('getContextFiles throws', () => {
      expect(() => databaseService.getContextFiles('x')).toThrow('Database not initialized')
    })

    it('deleteContextFile throws', () => {
      expect(() => databaseService.deleteContextFile('x')).toThrow('Database not initialized')
    })
  })
})
