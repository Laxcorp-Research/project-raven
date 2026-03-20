import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDatabaseService = vi.hoisted(() => ({
  createSession: vi.fn((s: Record<string, unknown>) => ({ ...s, createdAt: Date.now() })),
  updateSession: vi.fn(),
  getSession: vi.fn(),
  getActiveMode: vi.fn(() => null),
  getInProgressSession: vi.fn(() => null),
  getMode: vi.fn(),
  addSessionMessage: vi.fn(),
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
import { getSetting } from '../store';

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

  describe('addAIResponse', () => {
    it('adds AI response to active session', () => {
      sessionManager.startSession();

      sessionManager.addAIResponse({
        id: 'ai-1',
        action: 'assist',
        userMessage: 'Help me',
        response: 'Here is help',
        timestamp: Date.now(),
      });

      const session = sessionManager.getActiveSession()!;
      expect(session.aiResponses).toHaveLength(1);
      expect(session.aiResponses[0].response).toBe('Here is help');
    });

    it('does nothing when no active session', () => {
      sessionManager.addAIResponse({
        id: 'ai-1',
        action: 'assist',
        userMessage: 'Help me',
        response: 'Here is help',
        timestamp: Date.now(),
      });
    });
  });

  describe('addSessionMessage', () => {
    it('persists message to database for non-incognito session', () => {
      sessionManager.startSession();

      sessionManager.addSessionMessage('user', 'Hello');

      expect(mockDatabaseService.addSessionMessage).toHaveBeenCalledWith(
        'test-uuid-1234',
        'user',
        'Hello',
      );
    });

    it('does nothing when no active session', () => {
      sessionManager.addSessionMessage('user', 'Hello');
    });
  });

  describe('setWindows', () => {
    it('sets window references', () => {
      const dashboard = { webContents: { send: vi.fn() } } as any;
      const overlay = { webContents: { send: vi.fn() } } as any;

      sessionManager.setWindows(dashboard, overlay);
    });
  });

  describe('generateTitle', () => {
    it('returns fallback for non-existent session', async () => {
      mockDatabaseService.getSession.mockReturnValue(null);

      const title = await sessionManager.generateTitle('nonexistent');
      expect(title).toBe('Untitled Session');
    });

    it('returns existing title for empty transcript', async () => {
      mockDatabaseService.getSession.mockReturnValue({
        id: 'session-1',
        title: 'My Session',
        transcript: [],
        startedAt: Date.now(),
      });

      const title = await sessionManager.generateTitle('session-1');
      expect(title).toBe('My Session');
    });

    it('generates title from transcript', async () => {
      vi.mocked(generateSessionTitle).mockResolvedValue('Q4 Review');
      mockDatabaseService.getSession.mockReturnValue({
        id: 'session-1',
        title: 'Untitled Session',
        transcript: [
          { id: '1', source: 'mic', text: 'Hello', isFinal: true, timestamp: 1000 },
        ],
        startedAt: Date.now(),
      });

      const title = await sessionManager.generateTitle('session-1');

      expect(title).toBe('Q4 Review');
      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ title: 'Q4 Review' }),
      );
    });

    it('generates fallback title on error', async () => {
      vi.mocked(generateSessionTitle).mockRejectedValue(new Error('fail'));
      mockDatabaseService.getSession.mockReturnValue({
        id: 'session-1',
        title: 'Untitled Session',
        transcript: [
          { id: '1', source: 'mic', text: 'Hello', isFinal: true, timestamp: 1000 },
        ],
        startedAt: 1700000000000,
      });

      const title = await sessionManager.generateTitle('session-1');

      expect(title).toContain('Session at');
      expect(mockDatabaseService.updateSession).toHaveBeenCalled();
    });
  });

  describe('recoverSession', () => {
    it('returns null when no in-progress session', () => {
      mockDatabaseService.getInProgressSession.mockReturnValue(null);

      const result = sessionManager.recoverSession();
      expect(result).toBeNull();
    });

    it('recovers and closes in-progress session', () => {
      const crashedSession = {
        id: 'crashed-session',
        title: 'Untitled Session',
        transcript: [],
        startedAt: Date.now() - 60000,
      };
      mockDatabaseService.getInProgressSession.mockReturnValue(crashedSession);

      const result = sessionManager.recoverSession();

      expect(result).toBeDefined();
      expect(result!.id).toBe('crashed-session');
      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'crashed-session',
        expect.objectContaining({
          endedAt: expect.any(Number),
          title: 'Recovered Session',
        }),
      );
    });

    it('preserves existing title when recovering', () => {
      const crashedSession = {
        id: 'crashed-session',
        title: 'Important Meeting',
        transcript: [],
        startedAt: Date.now() - 60000,
      };
      mockDatabaseService.getInProgressSession.mockReturnValue(crashedSession);

      sessionManager.recoverSession();

      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'crashed-session',
        expect.objectContaining({
          title: 'Important Meeting',
        }),
      );
    });
  });

  describe('endSession (with transcript)', () => {
    it('returns ended session with duration', () => {
      const session = sessionManager.startSession();

      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello',
        timestamp: 1000,
        isFinal: true,
      });

      const ended = sessionManager.endSession();

      expect(ended).toBeDefined();
      expect(ended!.durationSeconds).toBeGreaterThanOrEqual(0);
      expect(ended!.endedAt).toBeGreaterThan(0);
    });

    it('triggers async summary generation', async () => {
      sessionManager.startSession();

      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello',
        timestamp: 1000,
        isFinal: true,
      });

      sessionManager.endSession();

      await vi.waitFor(() => {
        expect(generateSessionSummary).toHaveBeenCalled();
      });
    });
  });

  describe('incognito mode', () => {
    it('starts incognito session when incognitoMode enabled', () => {
      vi.mocked(getSetting).mockImplementation((key: string) => {
        if (key === 'incognitoMode') return true;
        return '' as any;
      });

      const session = sessionManager.startSession();

      expect(session.title).toBe('Incognito Session');
      expect(mockDatabaseService.createSession).not.toHaveBeenCalled();
    });

    it('does not persist messages in incognito mode', () => {
      vi.mocked(getSetting).mockImplementation((key: string) => {
        if (key === 'incognitoMode') return true;
        return '' as any;
      });

      sessionManager.startSession();
      sessionManager.addSessionMessage('user', 'secret');

      expect(mockDatabaseService.addSessionMessage).not.toHaveBeenCalled();
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
