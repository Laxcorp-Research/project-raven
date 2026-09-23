import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDatabaseService = vi.hoisted(() => ({
  createSession: vi.fn((s: Record<string, unknown>) => ({ ...s, createdAt: Date.now() })),
  updateSession: vi.fn(),
  getSession: vi.fn(),
  getActiveMode: vi.fn(() => null),
  getInProgressSession: vi.fn(() => null),
  getMode: vi.fn(),
  addSessionMessage: vi.fn(),
  getAllSessionSummaries: vi.fn(() => []),
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

vi.mock('../services/insightsService', () => ({
  analyzeSession: vi.fn().mockResolvedValue({}),
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
import { analyzeSession } from '../services/insightsService';
import { generateSessionTitle } from '../claudeService';
import { getSetting } from '../store';
import { SESSION_AUTOSAVE_INTERVAL_MS } from '../constants';

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
    vi.mocked(analyzeSession).mockResolvedValue({});

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
      // First call returns the session (mimicking DB state before
      // the close). Subsequent calls return null (mimicking the DB
      // after updateSession sets ended_at).
      mockDatabaseService.getInProgressSession
        .mockReturnValueOnce(crashedSession)
        .mockReturnValue(null);

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
      mockDatabaseService.getInProgressSession
        .mockReturnValueOnce(crashedSession)
        .mockReturnValue(null);

      sessionManager.recoverSession();

      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'crashed-session',
        expect.objectContaining({
          title: 'Important Meeting',
        }),
      );
    });

    it('clamps negative duration (clock skew) to zero', () => {
      // startedAt in the future - Date.now() - startedAt would be negative.
      // Happens on NTP correction or VM resume.
      const crashedSession = {
        id: 'clock-skew',
        title: 'Untitled Session',
        transcript: [],
        startedAt: Date.now() + 60_000,
      };
      mockDatabaseService.getInProgressSession
        .mockReturnValueOnce(crashedSession)
        .mockReturnValue(null);

      sessionManager.recoverSession();

      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'clock-skew',
        expect.objectContaining({ durationSeconds: 0 }),
      );
    });

    it('caps forgotten sessions at 8 hours', () => {
      // User force-quit 2 days ago without stopping the recording.
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      const crashedSession = {
        id: 'forgotten',
        title: 'Untitled Session',
        transcript: [],
        startedAt: twoDaysAgo,
      };
      mockDatabaseService.getInProgressSession
        .mockReturnValueOnce(crashedSession)
        .mockReturnValue(null);

      sessionManager.recoverSession();

      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'forgotten',
        expect.objectContaining({ durationSeconds: 8 * 60 * 60 }),
      );
    });

    it('closes multiple orphaned sessions in one pass', () => {
      const a = {
        id: 'orphan-a', title: 'Untitled Session', transcript: [], startedAt: Date.now() - 10_000,
      };
      const b = {
        id: 'orphan-b', title: 'Untitled Session', transcript: [], startedAt: Date.now() - 20_000,
      };
      mockDatabaseService.getInProgressSession
        .mockReturnValueOnce(a)
        .mockReturnValueOnce(b)
        .mockReturnValue(null);

      sessionManager.recoverSession();

      expect(mockDatabaseService.updateSession).toHaveBeenCalledTimes(2);
      expect(mockDatabaseService.updateSession).toHaveBeenNthCalledWith(
        1, 'orphan-a', expect.any(Object),
      );
      expect(mockDatabaseService.updateSession).toHaveBeenNthCalledWith(
        2, 'orphan-b', expect.any(Object),
      );
    });
  });

  describe('endSession (with transcript)', () => {
    it('returns ended session with duration', () => {
      sessionManager.startSession();

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

    it('does not persist an empty summary when generation fails', async () => {
      vi.mocked(generateSessionSummary).mockRejectedValueOnce(new Error('No API key'));
      sessionManager.startSession();
      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello there this is a longer line',
        timestamp: 1000,
        isFinal: true,
      });

      sessionManager.endSession();

      await vi.waitFor(() => {
        expect(generateSessionSummary).toHaveBeenCalled();
      });

      const summaryWrites = mockDatabaseService.updateSession.mock.calls.filter(
        (call) => call[1] && Object.prototype.hasOwnProperty.call(call[1], 'summary'),
      );
      expect(summaryWrites).toHaveLength(0);
    });

    it('broadcasts summary-pending while notes are generating', async () => {
      const send = vi.fn();
      sessionManager.setWindows({ webContents: { send } } as never, null);
      sessionManager.startSession();
      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello there this is a longer line',
        timestamp: 1000,
        isFinal: true,
      });

      sessionManager.endSession();

      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith('sessions:summary-pending', 'test-uuid-1234');
      });
      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith('sessions:summary-done', 'test-uuid-1234');
      });
    });

    it('stores normalized structured action items extracted from the transcript', async () => {
      vi.mocked(analyzeSession).mockResolvedValueOnce({
        actionItems: JSON.stringify([
          { task: 'Send the deck', assignee: 'Sam', deadline: 'Friday' },
        ]),
      });
      sessionManager.startSession();
      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'I will send the deck by Friday',
        timestamp: 1000,
        isFinal: true,
      });

      sessionManager.endSession();

      await vi.waitFor(() => {
        const writes = mockDatabaseService.updateSession.mock.calls.filter(
          (call) => call[1] && Object.prototype.hasOwnProperty.call(call[1], 'actionItemsJson'),
        );
        expect(writes.length).toBeGreaterThan(0);
      });

      const write = mockDatabaseService.updateSession.mock.calls.find(
        (call) => call[1] && Object.prototype.hasOwnProperty.call(call[1], 'actionItemsJson'),
      );
      const stored = JSON.parse((write![1] as { actionItemsJson: string }).actionItemsJson);
      expect(stored).toEqual([{ task: 'Send the deck', assignee: 'Sam', deadline: 'Friday' }]);
    });

    it('does not write action items when the model returns unparseable output', async () => {
      vi.mocked(analyzeSession).mockResolvedValueOnce({ actionItems: 'not json at all' });
      sessionManager.startSession();
      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello there this is a longer line',
        timestamp: 1000,
        isFinal: true,
      });

      sessionManager.endSession();

      await vi.waitFor(() => {
        expect(analyzeSession).toHaveBeenCalled();
      });

      const writes = mockDatabaseService.updateSession.mock.calls.filter(
        (call) => call[1] && Object.prototype.hasOwnProperty.call(call[1], 'actionItemsJson'),
      );
      expect(writes).toHaveLength(0);
    });

    it('never fails the notes job when action item extraction throws', async () => {
      vi.mocked(analyzeSession).mockRejectedValueOnce(new Error('provider exploded'));
      const send = vi.fn();
      sessionManager.setWindows({ webContents: { send } } as never, null);
      sessionManager.startSession();
      sessionManager.addTranscriptEntry({
        id: 'entry-1',
        source: 'mic',
        text: 'Hello there this is a longer line',
        timestamp: 1000,
        isFinal: true,
      });

      sessionManager.endSession();

      // summary still stored, summary-done still broadcast despite the throw
      await vi.waitFor(() => {
        const summaryWrites = mockDatabaseService.updateSession.mock.calls.filter(
          (call) => call[1] && Object.prototype.hasOwnProperty.call(call[1], 'summary'),
        );
        expect(summaryWrites.length).toBeGreaterThan(0);
      });
      await vi.waitFor(() => {
        expect(send).toHaveBeenCalledWith('sessions:summary-done', 'test-uuid-1234');
      });
    });
  });

  describe('retryMissingNotes', () => {
    it('generates notes for ended sessions that still have a transcript and no summary', async () => {
      vi.mocked(generateSessionSummary).mockClear()
      mockDatabaseService.getAllSessionSummaries.mockReturnValue([
        {
          id: 'stuck',
          title: 'Untitled session',
          summary: null,
          modeId: null,
          durationSeconds: 3600,
          startedAt: Date.now() - 12 * 60 * 60 * 1000,
          endedAt: Date.now() - 12 * 60 * 60 * 1000,
          createdAt: Date.now() - 12 * 60 * 60 * 1000,
        },
      ]);
      mockDatabaseService.getSession.mockReturnValue({
        id: 'stuck',
        title: 'Untitled session',
        summary: null,
        modeId: null,
        transcript: [
          {
            id: 't1',
            source: 'mic',
            text: 'This is a long enough transcript to pass the minimum length check easily',
            timestamp: 1,
            isFinal: true,
          },
        ],
      });

      const started = await sessionManager.retryMissingNotes();

      expect(started).toBe(1);
      expect(generateSessionSummary).toHaveBeenCalled();
      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'stuck',
        expect.objectContaining({ title: 'Test Title', summary: 'Test Summary' }),
      );
    });

    it('skips sessions that already have a summary', async () => {
      vi.mocked(generateSessionSummary).mockClear()
      mockDatabaseService.getAllSessionSummaries.mockReturnValue([
        {
          id: 'done',
          title: 'Done',
          summary: 'Already summarized',
          modeId: null,
          durationSeconds: 60,
          startedAt: Date.now(),
          endedAt: Date.now(),
          createdAt: Date.now(),
        },
      ]);

      const started = await sessionManager.retryMissingNotes();

      expect(started).toBe(0);
      expect(generateSessionSummary).not.toHaveBeenCalled();
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

  describe('resumeSession', () => {
    // Yesterday: recorded 10:00-11:00 (3600s). Today: resumed at 09:00.
    const DAY = 24 * 60 * 60 * 1000;
    const YESTERDAY_START = Date.UTC(2026, 8, 21, 10, 0, 0);
    const YESTERDAY_END = YESTERDAY_START + 3600 * 1000;
    const TODAY = YESTERDAY_START + DAY - 3600 * 1000;

    const storedSession = (overrides: Record<string, unknown> = {}) => ({
      id: 'interview-1',
      title: 'Backend interview - Acme',
      transcript: [
        { id: 't1', source: 'system', text: 'Tell me about a hard bug.', timestamp: YESTERDAY_START + 1000, isFinal: true },
        { id: 't2', source: 'mic', text: 'Sure, last year we had a race condition...', timestamp: YESTERDAY_START + 5000, isFinal: true },
        { id: 't3', source: 'mic', text: 'and the', timestamp: YESTERDAY_START + 9000, isFinal: false },
      ],
      aiResponses: [{ id: 'a1', action: 'assist', userMessage: 'Assist', response: 'Mention the mutex.', timestamp: YESTERDAY_START + 6000 }],
      summary: 'Discussed a race condition bug.',
      insightsJson: null,
      actionItemsJson: '[{"task":"Send the design doc","assignee":null,"deadline":"Friday"}]',
      followUpEmail: null,
      segmentsJson: null,
      assistMemoryJson: '{"text":"## User Intent\\nInterview prep\\n\\n## Meeting Facts\\nAcme","openingTranscript":"Them: Tell me about a hard bug.","userPins":[]}',
      modeId: 'mode-interview',
      durationSeconds: 3600,
      startedAt: YESTERDAY_START,
      endedAt: YESTERDAY_END,
      createdAt: YESTERDAY_START,
      updatedAt: YESTERDAY_END,
      syncedAt: null,
      ...overrides,
    });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(TODAY);
      mockDatabaseService.getSession.mockImplementation((id: string) =>
        id === 'interview-1' ? storedSession() : null,
      );
    });

    afterEach(() => {
      if (sessionManager.hasActiveSession()) sessionManager.endSession();
      sessionManager.setAssistSessionHook(null);
      vi.useRealTimers();
    });

    it('reopens the saved session with its final transcript and appends a new segment', () => {
      const result = sessionManager.resumeSession('interview-1');

      expect('session' in result).toBe(true);
      const session = (result as { session: { id: string; transcript: unknown[]; endedAt: number | null } }).session;
      expect(session.id).toBe('interview-1');
      expect(session.endedAt).toBeNull();
      // the interim entry from the old sitting is dropped
      expect(session.transcript).toHaveLength(2);
      expect(sessionManager.getActiveSession()?.id).toBe('interview-1');
      expect(sessionManager.isResumedSession()).toBe(true);

      expect(mockDatabaseService.createSession).not.toHaveBeenCalled();
      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith('interview-1', {
        endedAt: null,
        segmentsJson: JSON.stringify([
          { startedAt: YESTERDAY_START, endedAt: YESTERDAY_END },
          { startedAt: TODAY, endedAt: null },
        ]),
        // stale for a session that is about to grow; regenerated on demand
        insightsJson: null,
        followUpEmail: null,
      });
      expect(sessionManager.getActiveSession()?.followUpEmail).toBeNull();
    });

    it('exposes live-timer fields so the dashboard counts recorded time, not time since the first sitting', () => {
      const send = vi.fn();
      sessionManager.setWindows({ webContents: { send } } as never, null);

      sessionManager.resumeSession('interview-1');

      expect(sessionManager.getActiveTiming()).toEqual({
        recordingStartedAt: TODAY,
        priorDurationSeconds: 3600,
      });
      expect(send).toHaveBeenCalledWith(
        'session:updated',
        expect.objectContaining({
          startedAt: YESTERDAY_START, // list position keeps the original date
          recordingStartedAt: TODAY,
          priorDurationSeconds: 3600,
        }),
      );
      // A timer built from these fields reads 1h, not ~23h.
      const timing = sessionManager.getActiveTiming()!;
      const shown = timing.priorDurationSeconds + Math.floor((Date.now() - timing.recordingStartedAt) / 1000);
      expect(shown).toBe(3600);
    });

    it('a fresh session reports recordingStartedAt = startedAt and no prior time', () => {
      sessionManager.startSession();

      const active = sessionManager.getActiveSession()!;
      expect(sessionManager.getActiveTiming()).toEqual({
        recordingStartedAt: active.startedAt,
        priorDurationSeconds: 0,
      });
    });

    it('duration after resume is yesterday + today, not wall-clock since first start', () => {
      sessionManager.resumeSession('interview-1');
      vi.setSystemTime(TODAY + 10 * 60 * 1000); // record for 10 minutes

      const ended = sessionManager.endSession();

      expect(ended!.durationSeconds).toBe(3600 + 600);
      // wall-clock since yesterday's start would be ~23h; make sure that is not what we stored
      expect(ended!.durationSeconds).toBeLessThan(2 * 3600);
      expect(mockDatabaseService.updateSession).toHaveBeenLastCalledWith(
        'interview-1',
        expect.objectContaining({
          durationSeconds: 4200,
          endedAt: TODAY + 10 * 60 * 1000,
          segmentsJson: JSON.stringify([
            { startedAt: YESTERDAY_START, endedAt: YESTERDAY_END },
            { startedAt: TODAY, endedAt: TODAY + 10 * 60 * 1000 },
          ]),
        }),
      );
    });

    it('autosave after resume writes the accumulated duration', () => {
      sessionManager.resumeSession('interview-1');
      mockDatabaseService.updateSession.mockClear();

      vi.advanceTimersByTime(SESSION_AUTOSAVE_INTERVAL_MS);

      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'interview-1',
        expect.objectContaining({ durationSeconds: 3600 + SESSION_AUTOSAVE_INTERVAL_MS / 1000 }),
      );
    });

    it('a never-resumed session keeps the original duration formula and writes no segments', () => {
      sessionManager.startSession();
      vi.setSystemTime(TODAY + 90 * 1000);

      const ended = sessionManager.endSession();

      expect(ended!.durationSeconds).toBe(90);
      const finalWrite = mockDatabaseService.updateSession.mock.calls.at(-1)![1] as Record<string, unknown>;
      expect(finalWrite.durationSeconds).toBe(90);
      expect(finalWrite).not.toHaveProperty('segmentsJson');
    });

    it('a third sitting keeps both earlier segments', () => {
      const twoSittings = storedSession({
        durationSeconds: 4200,
        segmentsJson: JSON.stringify([
          { startedAt: YESTERDAY_START, endedAt: YESTERDAY_END },
          { startedAt: YESTERDAY_START + 2 * 3600 * 1000, endedAt: YESTERDAY_START + 2 * 3600 * 1000 + 600 * 1000 },
        ]),
      });
      mockDatabaseService.getSession.mockReturnValue(twoSittings);

      sessionManager.resumeSession('interview-1');

      const segments = JSON.parse(
        (mockDatabaseService.updateSession.mock.calls[0][1] as { segmentsJson: string }).segmentsJson,
      );
      expect(segments).toHaveLength(3);
      expect(segments[2]).toEqual({ startedAt: TODAY, endedAt: null });
    });

    it('refuses to resume while incognito is on', () => {
      vi.mocked(getSetting).mockImplementation((key: string) => (key === 'incognitoMode' ? true : '') as never);

      expect(sessionManager.canResume('interview-1')).toBe('incognito');
      expect(sessionManager.resumeSession('interview-1')).toEqual({ error: 'incognito' });
      expect(sessionManager.hasActiveSession()).toBe(false);
      expect(mockDatabaseService.updateSession).not.toHaveBeenCalled();
    });

    it('returns not_found for an unknown session id', () => {
      expect(sessionManager.canResume('nope')).toBe('not_found');
      expect(sessionManager.resumeSession('nope')).toEqual({ error: 'not_found' });
      expect(sessionManager.hasActiveSession()).toBe(false);
    });

    it('ends the active session before resuming another', () => {
      sessionManager.startSession();
      const send = vi.fn();
      sessionManager.setWindows({ webContents: { send } } as never, null);

      sessionManager.resumeSession('interview-1');

      expect(sessionManager.getActiveSession()?.id).toBe('interview-1');
      // the fresh session was closed (endedAt written) before the resume
      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'test-uuid-1234',
        expect.objectContaining({ endedAt: expect.any(Number) }),
      );
    });

    it('hands the assist restorer the earlier memory and notes', () => {
      const restore = vi.fn();
      sessionManager.setAssistSessionHook(restore);

      sessionManager.resumeSession('interview-1');

      expect(restore).toHaveBeenCalledWith({
        sessionId: 'interview-1',
        title: 'Backend interview - Acme',
        assistMemoryJson: expect.stringContaining('Interview prep'),
        summary: 'Discussed a race condition bug.',
        actionItemsJson: expect.stringContaining('Send the design doc'),
        firstStartedAt: YESTERDAY_START,
        resumedAt: TODAY,
      });
    });

    it('a throwing restorer does not abort the resume', () => {
      sessionManager.setAssistSessionHook(() => { throw new Error('boom'); });

      const result = sessionManager.resumeSession('interview-1');

      expect('session' in result).toBe(true);
      expect(sessionManager.hasActiveSession()).toBe(true);
    });

    it('a fresh session tells Assist to drop its thread (hook fires with null)', () => {
      const hook = vi.fn();
      sessionManager.setAssistSessionHook(hook);

      sessionManager.startSession();

      expect(hook).toHaveBeenCalledWith(null);
    });

    it('stop, quick resume, stop again still regenerates notes over both sittings', async () => {
      // Sitting one's notes job is slow and still running when the user resumes.
      let finishFirst!: (v: { title: string; summary: string }) => void;
      vi.mocked(generateSessionSummary)
        .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
        .mockResolvedValue({ title: 'Later', summary: 'Both sittings' });

      sessionManager.startSession();
      sessionManager.addTranscriptEntry({ id: 'd1', source: 'system', text: 'Day one question.', timestamp: TODAY, isFinal: true });
      sessionManager.endSession();
      vi.useRealTimers();
      await vi.waitFor(() => expect(generateSessionSummary).toHaveBeenCalledTimes(1));

      // Resume the very same session while the first job is in flight.
      mockDatabaseService.getSession.mockReturnValue(storedSession({ id: 'test-uuid-1234', title: 'Untitled Session', summary: null }));
      sessionManager.resumeSession('test-uuid-1234');
      sessionManager.addTranscriptEntry({ id: 'd2', source: 'mic', text: 'Day two answer.', timestamp: Date.now(), isFinal: true });
      sessionManager.endSession();

      // Nothing new yet: the second run is queued behind the first.
      expect(generateSessionSummary).toHaveBeenCalledTimes(1);
      finishFirst({ title: 'Day One', summary: 'Only day one' });

      await vi.waitFor(() => expect(generateSessionSummary).toHaveBeenCalledTimes(2));
      const secondInput = vi.mocked(generateSessionSummary).mock.calls[1][0] as string;
      expect(secondInput).toContain('Day two answer.');
      await vi.waitFor(() => {
        const writes = mockDatabaseService.updateSession.mock.calls
          .filter((c) => c[0] === 'test-uuid-1234' && (c[1] as Record<string, unknown>).summary)
          .map((c) => (c[1] as Record<string, unknown>).summary);
        expect(writes.at(-1)).toBe('Both sittings');
      });
    });

    it('broadcasts session:updated with resumed=true', () => {
      const send = vi.fn();
      sessionManager.setWindows({ webContents: { send } } as never, { webContents: { send } } as never);

      sessionManager.resumeSession('interview-1');

      expect(send).toHaveBeenCalledWith(
        'session:updated',
        expect.objectContaining({ id: 'interview-1', resumed: true }),
      );
    });

    it('a fresh session broadcasts resumed=false', () => {
      const send = vi.fn();
      sessionManager.setWindows({ webContents: { send } } as never, null);

      sessionManager.startSession();

      expect(send).toHaveBeenCalledWith('session:updated', expect.objectContaining({ resumed: false }));
    });

    it('saveAssistMemory writes against the active session and is a no-op when idle', () => {
      sessionManager.saveAssistMemory('{"text":"x"}');
      expect(mockDatabaseService.updateSession).not.toHaveBeenCalled();

      sessionManager.resumeSession('interview-1');
      sessionManager.saveAssistMemory('{"text":"today"}');

      expect(mockDatabaseService.updateSession).toHaveBeenLastCalledWith('interview-1', {
        assistMemoryJson: '{"text":"today"}',
      });
      expect(sessionManager.getActiveSession()?.assistMemoryJson).toBe('{"text":"today"}');
    });

    it('regenerates notes over both sittings but keeps the existing title', async () => {
      vi.mocked(generateSessionSummary).mockResolvedValue({ title: 'Some New Title', summary: 'Both days' });
      sessionManager.resumeSession('interview-1');
      sessionManager.addTranscriptEntry({
        id: 'today-1', source: 'system', text: 'Welcome back, let us continue.', timestamp: TODAY + 1000, isFinal: true,
      });
      sessionManager.endSession();
      vi.useRealTimers();

      await vi.waitFor(() => {
        expect(generateSessionSummary).toHaveBeenCalled();
      });
      const sent = vi.mocked(generateSessionSummary).mock.calls[0][0] as string;
      expect(sent).toContain('Tell me about a hard bug.');
      expect(sent).toContain('Welcome back, let us continue.');

      await vi.waitFor(() => {
        const summaryWrite = mockDatabaseService.updateSession.mock.calls.find(
          (call) => call[0] === 'interview-1' && (call[1] as Record<string, unknown>).summary === 'Both days',
        );
        expect(summaryWrite).toBeDefined();
        expect(summaryWrite![1]).not.toHaveProperty('title');
      });
    });

    it('still names a resumed session that only had the placeholder title', async () => {
      mockDatabaseService.getSession.mockReturnValue(storedSession({ title: 'Untitled Session' }));
      vi.mocked(generateSessionSummary).mockResolvedValue({ title: 'Generated Title', summary: 'Both days' });
      sessionManager.resumeSession('interview-1');
      sessionManager.addTranscriptEntry({
        id: 'today-1', source: 'system', text: 'Welcome back.', timestamp: TODAY + 1000, isFinal: true,
      });
      sessionManager.endSession();
      vi.useRealTimers();

      await vi.waitFor(() => {
        expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
          'interview-1',
          expect.objectContaining({ title: 'Generated Title', summary: 'Both days' }),
        );
      });
    });
  });

  describe('recoverSession (resumed session)', () => {
    it('keeps the autosaved duration and closes the open segment at the last save', () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 3600 * 1000;
      const yesterday = Date.now() - 24 * 3600 * 1000;
      const lastSave = yesterday + 15 * 60 * 1000;
      const crashed = {
        id: 'resumed-crash',
        title: 'Long interview',
        transcript: [],
        startedAt: threeDaysAgo,
        updatedAt: lastSave,
        durationSeconds: 3600 + 15 * 60,
        segmentsJson: JSON.stringify([
          { startedAt: threeDaysAgo, endedAt: threeDaysAgo + 3600 * 1000 },
          { startedAt: yesterday, endedAt: null },
        ]),
      };
      mockDatabaseService.getInProgressSession
        .mockReturnValueOnce(crashed)
        .mockReturnValue(null);

      sessionManager.recoverSession();

      expect(mockDatabaseService.updateSession).toHaveBeenCalledWith(
        'resumed-crash',
        expect.objectContaining({
          // not clamped to 8h of "time since first start"
          durationSeconds: 3600 + 15 * 60,
          title: 'Long interview',
          segmentsJson: JSON.stringify([
            { startedAt: threeDaysAgo, endedAt: threeDaysAgo + 3600 * 1000 },
            { startedAt: yesterday, endedAt: lastSave },
          ]),
        }),
      );
    });

    it('a session without segments still uses the wall-clock formula', () => {
      const crashed = {
        id: 'plain-crash',
        title: 'Untitled Session',
        transcript: [],
        startedAt: Date.now() - 120_000,
        updatedAt: Date.now() - 60_000,
        durationSeconds: 60,
        segmentsJson: null,
      };
      mockDatabaseService.getInProgressSession
        .mockReturnValueOnce(crashed)
        .mockReturnValue(null);

      sessionManager.recoverSession();

      const write = mockDatabaseService.updateSession.mock.calls[0][1] as Record<string, unknown>;
      expect(write.durationSeconds).toBeGreaterThanOrEqual(120);
      expect(write).not.toHaveProperty('segmentsJson');
    });
  });
});
