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

  it('buildUserMessage appends screenshot note when includeScreenshot is true', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'some text',
      action: 'assist',
      includeScreenshot: true,
    });

    expect(msg).toContain('[Screenshot of the user\'s screen is attached]');
  });

  it('buildUserMessage shows TRANSCRIPT (unchanged) when no new content', async () => {
    (service as any).conversation.messages.push({
      id: '1', role: 'user', content: 'test', timestamp: 1,
    });
    (service as any).conversation.lastProcessedTranscriptLength = 100;

    const msg: string = await (service as any).buildUserMessage({
      transcript: 'Same old text',
      action: 'assist',
    });

    expect(msg).toContain('TRANSCRIPT (unchanged)');
  });

  it('windowTranscript truncates long transcripts', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n');

    const result = (service as any).windowTranscript(lines);

    expect(result).toContain('[...earlier conversation omitted');
  });

  it('windowTranscript preserves short transcripts', () => {
    const shortTranscript = 'Line 1\nLine 2\nLine 3';

    const result = (service as any).windowTranscript(shortTranscript);

    expect(result).toBe(shortTranscript);
  });

  it('buildAIMessages creates user-only message without screenshot', () => {
    const messages = (service as any).buildAIMessages('Hello', null);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
  });

  it('buildAIMessages creates multipart message with screenshot', () => {
    const screenshot = { mediaType: 'image/png', data: 'base64data', previewData: 'preview' };
    const messages = (service as any).buildAIMessages('Hello', screenshot);

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(Array.isArray(messages[0].content)).toBe(true);
    expect(messages[0].content).toHaveLength(2);
  });

  it('buildAIMessages includes conversation history', () => {
    (service as any).conversation.messages.push(
      { id: '1', role: 'user', content: 'First question', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'First answer', timestamp: 2 },
      { id: '3', role: 'user', content: 'Current question', timestamp: 3 },
    );

    const messages = (service as any).buildAIMessages('Current message', null);

    expect(messages.length).toBeGreaterThanOrEqual(3);
    expect(messages[0].content).toContain('First question');
    expect(messages[1].content).toBe('First answer');
  });

  it('setWindow sets the overlay window', () => {
    const win = { isDestroyed: () => false, webContents: { send: vi.fn() } } as any;
    service.setWindow(win);
  });

  it('setWindows sets both windows', () => {
    const dash = { isDestroyed: () => false, webContents: { send: vi.fn() } } as any;
    const overlay = { isDestroyed: () => false, webContents: { send: vi.fn() } } as any;
    service.setWindows(dash, overlay);
  });

  it('broadcast sends to overlay window', () => {
    const overlaySend = vi.fn();
    service.setWindow({ isDestroyed: () => false, webContents: { send: overlaySend } } as any);

    (service as any).broadcast({ type: 'cleared' });

    expect(overlaySend).toHaveBeenCalledWith('claude:response', expect.objectContaining({ type: 'cleared' }));
  });

  it('broadcast handles destroyed window gracefully', () => {
    service.setWindow({ isDestroyed: () => true, webContents: { send: vi.fn() } } as any);

    expect(() => (service as any).broadcast({ type: 'cleared' })).not.toThrow();
  });

  it('broadcastError sends error message', () => {
    const overlaySend = vi.fn();
    service.setWindow({ isDestroyed: () => false, webContents: { send: overlaySend } } as any);

    (service as any).broadcastError('Something went wrong');

    expect(overlaySend).toHaveBeenCalledWith('claude:response', expect.objectContaining({
      type: 'error',
      error: 'Something went wrong',
    }));
  });

  it('broadcastAuthExpired sends to all windows', () => {
    const dashSend = vi.fn();
    const overlaySend = vi.fn();
    service.setWindows(
      { isDestroyed: () => false, webContents: { send: dashSend } } as any,
      { isDestroyed: () => false, webContents: { send: overlaySend } } as any,
    );

    (service as any).broadcastAuthExpired();

    expect(overlaySend).toHaveBeenCalledWith('auth:session-expired', expect.any(Object));
    expect(dashSend).toHaveBeenCalledWith('auth:session-expired', expect.any(Object));
  });

  it('generateId returns unique strings', () => {
    const id1 = (service as any).generateId();
    const id2 = (service as any).generateId();

    expect(id1).toBeDefined();
    expect(typeof id1).toBe('string');
    expect(id1).not.toBe(id2);
  });

  it('getActionLabel handles fact-check and tell-me-more', () => {
    expect((service as any).getActionLabel('fact-check')).toBe('Fact Check');
    expect((service as any).getActionLabel('tell-me-more')).toBe('Tell me more');
  });

  it('registers IPC handlers', () => {
    expect(ipcMain.handle).toHaveBeenCalled();

    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map(c => c[0]);
    expect(registeredChannels).toContain('claude:get-response');
    expect(registeredChannels).toContain('claude:get-history');
    expect(registeredChannels).toContain('claude:clear-history');
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
