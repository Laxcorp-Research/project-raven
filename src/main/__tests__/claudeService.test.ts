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
  getFastProvider: vi.fn(),
  getProProvider: vi.fn(),
  getProFastProvider: vi.fn(),
  getProSystemProvider: vi.fn(),
}));

vi.mock('../store', () => ({
  getSetting: vi.fn((key: string) => (key === 'displayName' ? 'Alice' : '')),
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

import { ClaudeService, generateSessionTitle } from '../claudeService';
import { getProviderFromStore, getFastProvider, getProProvider, getProFastProvider, getProSystemProvider } from '../services/ai/providerFactory';
import { isProMode, getSetting } from '../store';
import { ipcMain } from 'electron';

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

  it('buildUserMessage includes full transcript on first call', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'Alice: Hi\nThem: Hello',
      action: 'assist',
    });

    expect(msg).toContain('LIVE TRANSCRIPT:');
    expect(msg).toContain('Alice: Hi\nThem: Hello');
  });

  it('buildUserMessage shows new transcript content on subsequent calls', async () => {
    // Simulate a previous exchange so messages.length > 0
    (service as any).conversation.messages.push({
      id: '1', role: 'user', content: 'test', timestamp: 1,
    });
    (service as any).conversation.lastProcessedTranscriptLength = 10;

    const msg: string = await (service as any).buildUserMessage({
      transcript: 'Old stuff. Brand new content here',
      action: 'assist',
    });

    expect(msg).toContain('NEW SINCE LAST');
    expect(msg).toContain('FULL TRANSCRIPT:');
  });

  it('buildUserMessage omits transcript section when empty', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: '',
      action: 'assist',
    });

    expect(msg).not.toContain('TRANSCRIPT');
    expect(msg).toContain('Execute the priority system');
  });

  it('buildUserMessage appends action prompt for standard actions', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'some text',
      action: 'recap',
    });

    expect(msg).toContain('Concise recap');
    expect(msg).toContain('action items');
  });

  it('buildUserMessage appends custom prompt for custom action', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'some text',
      action: 'custom',
      customPrompt: 'What is the budget?',
    });

    expect(msg).toContain('USER QUESTION: What is the budget?');
    expect(msg).not.toContain('Execute the priority system');
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

    const title = await generateSessionTitle('Alice: Let us discuss Q4 numbers');

    expect(title).toBe('Q4 Sales Review');
  });

  it('rejects invalid titles that look like conversational responses', async () => {
    vi.mocked(getProviderFromStore).mockResolvedValue({
      generateShort: vi.fn().mockResolvedValue("I'd be happy to help with that"),
    } as any);

    await expect(generateSessionTitle('Some transcript'))
      .rejects.toThrow('Invalid title format');
  });
});

// ---------------------------------------------------------------------------
// Provider routing (free vs pro mode)
// ---------------------------------------------------------------------------

describe('Provider routing based on mode', () => {
  const mockProvider = {
    name: 'anthropic' as const,
    streamResponse: vi.fn(),
    generateShort: vi.fn(),
  };

  function getResponseHandler(): (...args: unknown[]) => Promise<void> {
    const calls = vi.mocked(ipcMain.handle).mock.calls;
    const entry = calls.find(([channel]) => channel === 'claude:get-response');
    if (!entry) throw new Error('claude:get-response handler not registered');
    return entry[1] as (...args: unknown[]) => Promise<void>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProviderFromStore).mockResolvedValue(mockProvider as any);
    vi.mocked(getFastProvider).mockResolvedValue(mockProvider as any);
    vi.mocked(getProProvider).mockResolvedValue(mockProvider as any);
    vi.mocked(getProFastProvider).mockResolvedValue(mockProvider as any);
    vi.mocked(getProSystemProvider).mockResolvedValue(mockProvider as any);
    mockProvider.streamResponse.mockResolvedValue(undefined);
    new ClaudeService(null);
  });

  it('uses getProviderFromStore in free mode', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'smartMode') return true;
      if (key === 'displayName') return 'Alice';
      return '';
    });

    const handler = getResponseHandler();
    await handler({}, { transcript: 'test', action: 'assist' });

    expect(getProviderFromStore).toHaveBeenCalled();
    expect(getFastProvider).not.toHaveBeenCalled();
  });

  it('uses getProFastProvider in pro mode without smartMode', async () => {
    vi.mocked(isProMode).mockReturnValue(true);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'smartMode') return false;
      if (key === 'displayName') return 'Alice';
      return '';
    });

    const handler = getResponseHandler();
    await handler({}, { transcript: 'test', action: 'assist' });

    expect(getProFastProvider).toHaveBeenCalled();
    expect(getProviderFromStore).not.toHaveBeenCalled();
  });

  it('uses getProProvider in pro mode with smartMode enabled', async () => {
    vi.mocked(isProMode).mockReturnValue(true);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'smartMode') return true;
      if (key === 'displayName') return 'Alice';
      return '';
    });

    const handler = getResponseHandler();
    await handler({}, { transcript: 'test', action: 'assist' });

    expect(getProProvider).toHaveBeenCalled();
    expect(getProFastProvider).not.toHaveBeenCalled();
  });
});
