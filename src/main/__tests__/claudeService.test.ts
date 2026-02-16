import { vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn() },
  desktopCapturer: { getSources: vi.fn() },
  screen: { getPrimaryDisplay: vi.fn() },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid'),
}));

vi.mock('../services/sessionManager', () => ({
  sessionManager: {
    addAIResponse: vi.fn(),
    addSessionMessage: vi.fn(),
  },
}));

vi.mock('../services/ai/providerFactory', () => ({
  getProviderFromStore: vi.fn(),
}));

vi.mock('../store', () => ({
  getSetting: vi.fn((key: string) => (key === 'displayName' ? 'Alice' : '')),
}));

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ClaudeService, generateSessionTitle } from '../claudeService';
import { getProviderFromStore } from '../services/ai/providerFactory';

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ClaudeService(null);
  });

  // ---------------------------------------------------------------------------
  // getActionLabel (private)
  // ---------------------------------------------------------------------------

  it('getActionLabel returns the correct label for each action', () => {
    const label = (action: string) => (service as any).getActionLabel(action);

    expect(label('assist')).toBe('Assist');
    expect(label('what-should-i-say')).toBe('What should I say?');
    expect(label('follow-up')).toBe('Follow-up');
    expect(label('recap')).toBe('Recap');
    expect(label('custom')).toBe('Question');
    expect(label('unknown-action')).toBe('Assist');
  });

  // ---------------------------------------------------------------------------
  // buildUserMessage (private)
  // ---------------------------------------------------------------------------

  it('buildUserMessage includes full transcript on first call', () => {
    const msg: string = (service as any).buildUserMessage({
      transcript: 'Alice: Hi\nThem: Hello',
      action: 'assist',
    });

    expect(msg).toContain('CURRENT TRANSCRIPT:');
    expect(msg).toContain('Alice: Hi\nThem: Hello');
  });

  it('buildUserMessage shows new transcript content on subsequent calls', () => {
    // Simulate a previous exchange so messages.length > 0
    (service as any).conversation.messages.push({
      id: '1', role: 'user', content: 'test', timestamp: 1,
    });
    (service as any).conversation.lastProcessedTranscriptLength = 10;

    const msg: string = (service as any).buildUserMessage({
      transcript: 'Old stuff. Brand new content here',
      action: 'assist',
    });

    expect(msg).toContain('NEW IN TRANSCRIPT');
    expect(msg).toContain('FULL TRANSCRIPT FOR CONTEXT');
  });

  it('buildUserMessage shows no-transcript message when empty', () => {
    const msg: string = (service as any).buildUserMessage({
      transcript: '',
      action: 'assist',
    });

    expect(msg).toContain('(No transcript yet');
  });

  it('buildUserMessage appends action prompt for standard actions', () => {
    const msg: string = (service as any).buildUserMessage({
      transcript: 'some text',
      action: 'recap',
    });

    expect(msg).toContain('REQUEST:');
    expect(msg).toContain('recap');
  });

  it('buildUserMessage appends custom prompt for custom action', () => {
    const msg: string = (service as any).buildUserMessage({
      transcript: 'some text',
      action: 'custom',
      customPrompt: 'What is the budget?',
    });

    expect(msg).toContain('MY QUESTION: What is the budget?');
    expect(msg).not.toContain('REQUEST:');
  });
});

// ---------------------------------------------------------------------------
// generateSessionTitle (module-level export)
// ---------------------------------------------------------------------------

describe('generateSessionTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cleans quotes and prefixes from the provider result', async () => {
    vi.mocked(getProviderFromStore).mockResolvedValue({
      generateShort: vi.fn().mockResolvedValue('"Q4 Sales Review"'),
    } as any);

    const title = await generateSessionTitle('key', 'Alice: Let us discuss Q4 numbers');

    expect(title).toBe('Q4 Sales Review');
  });

  it('rejects invalid titles that look like conversational responses', async () => {
    vi.mocked(getProviderFromStore).mockResolvedValue({
      generateShort: vi.fn().mockResolvedValue("I'd be happy to help with that"),
    } as any);

    await expect(generateSessionTitle('key', 'Some transcript'))
      .rejects.toThrow('Invalid title format');
  });
});
