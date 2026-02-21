import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDatabaseService = vi.hoisted(() => ({
  createSession: vi.fn((s: Record<string, unknown>) => ({ ...s, createdAt: Date.now() })),
  updateSession: vi.fn(),
  getSession: vi.fn(),
  getActiveMode: vi.fn(() => null),
  getInProgressSession: vi.fn(() => null),
  getMode: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}));

const MockStore = vi.hoisted(() => {
  const fn = vi.fn();
  return fn;
});

vi.mock('electron-store', () => ({
  default: MockStore,
}));

vi.mock('../services/database', () => ({
  databaseService: mockDatabaseService,
}));

vi.mock('../claudeService', () => ({
  generateSessionTitle: vi.fn().mockRejectedValue(new Error('no key')),
}));

vi.mock('../services/summaryService', () => ({
  generateSessionSummary: vi.fn().mockResolvedValue({ title: 'Test Title', summary: 'Test Summary' }),
}));

vi.mock('../store', () => ({
  getSetting: vi.fn(() => ''),
  isProMode: vi.fn(() => false),
}));

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

// Import after mocks are set up
import { sessionManager } from '../services/sessionManager';
import { generateSessionSummary } from '../services/summaryService';
import { generateSessionTitle } from '../claudeService';

describe('SessionManager', () => {
  beforeEach(() => {
    // Re-apply electron-store mock implementation before each test
    // (mockReset clears it between tests)
    MockStore.mockImplementation(function (this: Record<string, unknown>) {
      this.get = vi.fn(() => '');
      this.set = vi.fn();
    });

    vi.clearAllMocks();

    // Re-apply mocks after clearAllMocks
    MockStore.mockImplementation(function (this: Record<string, unknown>) {
      this.get = vi.fn(() => '');
      this.set = vi.fn();
    });

    // Re-apply summary/title mocks (mockReset clears implementations)
    vi.mocked(generateSessionSummary).mockResolvedValue({ title: 'Test Title', summary: 'Test Summary' });
    vi.mocked(generateSessionTitle).mockRejectedValue(new Error('no key'));

    if (sessionManager.hasActiveSession()) {
      sessionManager.endSession();
    }
  });

  describe('startSession', () => {
    it('creates a new session with correct defaults', () => {
      const session = sessionManager.startSession();

      expect(session.id).toBe('test-uuid-1234');
      expect(session.title).toBe('Untitled Session');
      expect(session.transcript).toEqual([]);
      expect(session.aiResponses).toEqual([]);
      expect(session.summary).toBeNull();
      expect(session.durationSeconds).toBe(0);
      expect(session.endedAt).toBeNull();
      expect(mockDatabaseService.createSession).toHaveBeenCalledOnce();
    });

    it('sets the session as active', () => {
      sessionManager.startSession();
      expect(sessionManager.hasActiveSession()).toBe(true);
      expect(sessionManager.getActiveSession()).not.toBeNull();
    });

    it('ends previous session if one is active', () => {
      sessionManager.startSession();
      sessionManager.startSession();

      // updateSession is called when ending the first session
      expect(mockDatabaseService.updateSession).toHaveBeenCalled();
    });
  });

  describe('addTranscriptEntry', () => {
    it('adds a final entry to the transcript', () => {
      sessionManager.startSession();

      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello world',
        timestamp: 1000,
        isFinal: true,
      });

      const session = sessionManager.getActiveSession()!;
      expect(session.transcript).toHaveLength(1);
      expect(session.transcript[0].text).toBe('Hello world');
      expect(session.transcript[0].isFinal).toBe(true);
    });

    it('adds an interim entry to the transcript', () => {
      sessionManager.startSession();

      sessionManager.addTranscriptEntry({
        id: 'interim-mic',
        source: 'mic',
        text: 'Hel',
        timestamp: 1000,
        isFinal: false,
      });

      const session = sessionManager.getActiveSession()!;
      expect(session.transcript).toHaveLength(1);
      expect(session.transcript[0].isFinal).toBe(false);
    });

    it('replaces interim entry with final entry from same source', () => {
      sessionManager.startSession();

      sessionManager.addTranscriptEntry({
        id: 'interim-mic',
        source: 'mic',
        text: 'Hel',
        timestamp: 1000,
        isFinal: false,
      });

      sessionManager.addTranscriptEntry({
        id: 'final-1',
        source: 'mic',
        text: 'Hello',
        timestamp: 1001,
        isFinal: true,
      });

      const session = sessionManager.getActiveSession()!;
      // Only the final entry should remain (interim removed because same source)
      const finalEntries = session.transcript.filter((e) => e.isFinal);
      expect(finalEntries).toHaveLength(1);
      expect(finalEntries[0].text).toBe('Hello');
    });

    it('deduplicates entries with the same ID', () => {
      sessionManager.startSession();

      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello',
        timestamp: 1000,
        isFinal: true,
      });

      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello world',
        timestamp: 1001,
        isFinal: true,
      });

      const session = sessionManager.getActiveSession()!;
      expect(session.transcript).toHaveLength(1);
      expect(session.transcript[0].text).toBe('Hello world');
    });

    it('sorts entries by timestamp', () => {
      sessionManager.startSession();

      sessionManager.addTranscriptEntry({
        id: 'entry-2',
        source: 'system',
        text: 'Second',
        timestamp: 2000,
        isFinal: true,
      });

      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'First',
        timestamp: 1000,
        isFinal: true,
      });

      const session = sessionManager.getActiveSession()!;
      expect(session.transcript[0].text).toBe('First');
      expect(session.transcript[1].text).toBe('Second');
    });

    it('does nothing when no active session', () => {
      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello',
        timestamp: 1000,
        isFinal: true,
      });
      // Should not throw
    });
  });

  describe('endSession', () => {
    it('returns null when no active session', () => {
      const result = sessionManager.endSession();
      expect(result).toBeNull();
    });

    it('clears the active session', () => {
      sessionManager.startSession();
      expect(sessionManager.hasActiveSession()).toBe(true);

      sessionManager.endSession();
      expect(sessionManager.hasActiveSession()).toBe(false);
      expect(sessionManager.getActiveSession()).toBeNull();
    });

    it('filters only final entries when persisting', () => {
      sessionManager.startSession();

      sessionManager.addTranscriptEntry({
        id: 'final-1',
        source: 'mic',
        text: 'Final text',
        timestamp: 1000,
        isFinal: true,
      });

      sessionManager.addTranscriptEntry({
        id: 'interim-mic',
        source: 'mic',
        text: 'Partial...',
        timestamp: 2000,
        isFinal: false,
      });

      sessionManager.endSession();

      const updateCall = mockDatabaseService.updateSession.mock.calls[0];
      const savedTranscript = updateCall[1].transcript;
      expect(savedTranscript).toHaveLength(1);
      expect(savedTranscript[0].isFinal).toBe(true);
      expect(savedTranscript[0].text).toBe('Final text');
    });
  });

  describe('getActiveSession / hasActiveSession', () => {
    it('returns null / false with no session', () => {
      expect(sessionManager.getActiveSession()).toBeNull();
      expect(sessionManager.hasActiveSession()).toBe(false);
    });

    it('returns the session / true after start', () => {
      sessionManager.startSession();
      expect(sessionManager.getActiveSession()).not.toBeNull();
      expect(sessionManager.hasActiveSession()).toBe(true);
    });
  });
});
