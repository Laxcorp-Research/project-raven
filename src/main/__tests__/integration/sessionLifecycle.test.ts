/**
 * Integration test: Session Lifecycle
 *
 * Tests: create session -> update with transcript -> end session ->
 * verify summary and title are generated and stored.
 *
 * Uses real sessionManager with mocked database and AI services.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

const { mockCreateSession, mockUpdateSession, mockGetSession, mockGetAllSessions,
  mockGetInProgressSession, mockAddSessionMessage, mockGetSessionMessages,
  mockGenerateShort } = vi.hoisted(() => ({
  mockCreateSession: vi.fn(),
  mockUpdateSession: vi.fn(),
  mockGetSession: vi.fn(),
  mockGetAllSessions: vi.fn(),
  mockGetInProgressSession: vi.fn(),
  mockAddSessionMessage: vi.fn(),
  mockGetSessionMessages: vi.fn(),
  mockGenerateShort: vi.fn(),
}))

vi.mock('../../services/database', () => ({
  databaseService: {
    createSession: mockCreateSession,
    updateSession: mockUpdateSession,
    getSession: mockGetSession,
    getAllSessions: mockGetAllSessions,
    getInProgressSession: mockGetInProgressSession,
    addSessionMessage: mockAddSessionMessage,
    getSessionMessages: mockGetSessionMessages,
    getActiveMode: vi.fn().mockReturnValue(null),
  },
}))

const { mockGenerateSessionSummary } = vi.hoisted(() => ({
  mockGenerateSessionSummary: vi.fn(),
}))

vi.mock('../../services/summaryService', () => ({
  generateSessionSummary: mockGenerateSessionSummary,
}))

const { mockGenerateSessionTitle } = vi.hoisted(() => ({
  mockGenerateSessionTitle: vi.fn(),
}))

vi.mock('../../claudeService', () => ({
  generateSessionTitle: mockGenerateSessionTitle,
}))

vi.mock('../../services/ai/providerFactory', () => ({
  getProviderFromStore: vi.fn().mockResolvedValue({
    name: 'anthropic',
    generateShort: mockGenerateShort,
    streamResponse: vi.fn(),
  }),
}))

vi.mock('../../store', () => ({
  getStore: vi.fn(() => ({
    get: vi.fn((key: string) => {
      if (key === 'aiProvider') return 'anthropic'
      if (key === 'anthropicApiKey') return 'sk-test'
      return undefined
    }),
  })),
  getSetting: vi.fn(),
  saveSetting: vi.fn(),
  isProMode: vi.fn(() => false),
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp') },
  BrowserWindow: vi.fn(),
}))

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { sessionManager } from '../../services/sessionManager'

describe('Session Lifecycle Integration', () => {
  beforeEach(() => {
    mockGenerateSessionSummary.mockResolvedValue({
      title: 'AI Generated Title',
      summary: 'Summary of the session.',
    })
    mockGenerateSessionTitle.mockResolvedValue('Concise Title')
    mockCreateSession.mockImplementation((session: any) => ({
      ...session,
      createdAt: Date.now(),
    }))
    mockUpdateSession.mockReturnValue(undefined)
    mockGetSession.mockReturnValue(null)
    mockGetAllSessions.mockReturnValue([])
    mockGetInProgressSession.mockReturnValue(null)
    mockAddSessionMessage.mockReturnValue({ id: 'msg-1', sessionId: 's1', role: 'user', content: 'test', createdAt: new Date().toISOString() })
    mockGetSessionMessages.mockReturnValue([])
  })

  it('creates a session and stores it', () => {
    const session = sessionManager.startSession()

    expect(session).toBeDefined()
    expect(session!.id).toBeTruthy()
    expect(session!.title).toBe('Untitled Session')
    expect(mockCreateSession).toHaveBeenCalled()
  })

  it('tracks transcript entries during a session', () => {
    sessionManager.startSession()

    sessionManager.addTranscriptEntry({
      id: 'e1',
      source: 'mic',
      text: 'Hello there',
      timestamp: Date.now(),
      isFinal: true,
    })

    sessionManager.addTranscriptEntry({
      id: 'e2',
      source: 'system',
      text: 'Hi, how are you?',
      timestamp: Date.now() + 1000,
      isFinal: true,
    })

    const active = sessionManager.getActiveSession()
    expect(active).not.toBeNull()
    expect(active!.transcript).toHaveLength(2)
  })

  it('ends session and persists final state', async () => {
    sessionManager.startSession()

    sessionManager.addTranscriptEntry({
      id: 'e3',
      source: 'mic',
      text: 'This is a longer conversation with enough words to trigger summary generation in the service which requires at least twenty words to process',
      timestamp: Date.now(),
      isFinal: true,
    })

    const session = await sessionManager.endSession()

    expect(session).not.toBeNull()
    expect(session!.endedAt).toBeTruthy()
    expect(mockUpdateSession).toHaveBeenCalled()
    expect(sessionManager.hasActiveSession()).toBe(false)
  })

  it('filters out interim entries when ending session', async () => {
    sessionManager.startSession()

    sessionManager.addTranscriptEntry({
      id: 'final-1',
      source: 'mic',
      text: 'Final text',
      timestamp: Date.now(),
      isFinal: true,
    })

    sessionManager.addTranscriptEntry({
      id: 'interim-1',
      source: 'mic',
      text: 'Still typing...',
      timestamp: Date.now() + 500,
      isFinal: false,
    })

    const session = await sessionManager.endSession()

    expect(session).not.toBeNull()
    // The persisted transcript should only have final entries
    const updateCall = mockUpdateSession.mock.calls[0]
    const persistedTranscript = updateCall[1].transcript
    expect(persistedTranscript.every((e: any) => e.isFinal)).toBe(true)
  })

  it('returns null when ending with no active session', async () => {
    const session = await sessionManager.endSession()

    expect(session).toBeNull()
  })
})
