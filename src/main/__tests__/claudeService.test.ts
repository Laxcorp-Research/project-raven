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
  getNotesProvider: vi.fn(),
  getMemoryProvider: vi.fn(),
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
import { getProviderFromStore, getNotesProvider, getMemoryProvider } from '../services/ai/providerFactory';
import { isProMode, getSetting } from '../store';
import { ipcMain, BrowserWindow } from 'electron';

describe('ClaudeService', () => {
  let service: ClaudeService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([]);
    ClaudeService._resetForTesting();
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

    expect(msg).toContain('<transcript>');
    expect(msg).toContain('</transcript>');
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
    expect(msg).toContain('[RECENT TAIL]');
    expect(msg).not.toContain('[FULL TRANSCRIPT]');
    expect(msg).toContain('<transcript>');
  });

  it('buildUserMessage omits transcript section when empty', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: '',
      action: 'assist',
    });

    expect(msg).not.toContain('TRANSCRIPT');
    // v2.1 assist prompt references <priority_system> and <transcript>
    // XML tags directly - matches the new system prompt's section names.
    expect(msg).toContain('<priority_system>');
  });

  it('buildUserMessage appends action prompt for standard actions', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'some text',
      action: 'recap',
    });

    // Substance check: the recap prompt demands named sections
    // (Action items, Open questions). Assertions target those stable
    // markers rather than the prose wording, so future tweaks to the
    // prompt don't break tests unless the behaviour genuinely shifts.
    expect(msg).toContain('**Action items:**');
    expect(msg).toContain('concise recap');
  });

  it('buildUserMessage wraps custom prompt in <user_input> for custom action', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'some text',
      action: 'custom',
      customPrompt: 'What is the budget?',
    });

    // USER QUESTION prefix stays so the system-prompt priority rule
    // still matches; the <user_input> tag adds the security boundary
    // so the content is treated as DATA not INSTRUCTIONS.
    expect(msg).toContain('<user_input>');
    expect(msg).toContain('USER QUESTION: What is the budget?');
    expect(msg).toContain('</user_input>');
    // For custom prompts the assist action prompt must NOT be appended.
    expect(msg).not.toContain('<priority_system>');
  });

  it('buildUserMessage appends screenshot note when includeScreenshot is true', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'some text',
      action: 'assist',
      includeScreenshot: true,
    });

    // Screenshot text annotation is an XML self-closing tag now so the
    // system prompt's <security> rules about tagged sections apply.
    expect(msg).toContain('<screen');
    expect(msg).toContain('attached as an image part');
  });

  it('buildUserMessage marks transcript as unchanged-since-last when no new content', async () => {
    (service as any).conversation.messages.push({
      id: '1', role: 'user', content: 'test', timestamp: 1,
    });
    (service as any).conversation.lastProcessedTranscriptLength = 100;

    const msg: string = await (service as any).buildUserMessage({
      transcript: 'Same old text',
      action: 'assist',
    });

    expect(msg).toContain('note="unchanged_since_last"');
    expect(msg).toContain('<transcript');
  });

  it('windowTranscript truncates long transcripts', () => {
    // Must exceed TRANSCRIPT_LINE_LIMIT (300) to trigger the slice. Picking
    // 350 leaves headroom above the limit and stays well within memory.
    // When TRANSCRIPT_LINE_LIMIT was bumped from 50 to 300 (Coding Interview
    // mode work, 2026-05-13) the previous 100-line fixture stopped triggering
    // truncation - the test was passing accidentally on the old number.
    const lines = Array.from({ length: 350 }, (_, i) => `Line ${i}`).join('\n');

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

  it('broadcast reaches every live window so a stale overlay pointer cannot drop AI replies', () => {
    const staleSend = vi.fn();
    const liveSend = vi.fn();
    service.setWindow({ isDestroyed: () => true, webContents: { send: staleSend } } as any);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([
      { isDestroyed: () => false, webContents: { send: liveSend } } as any,
    ]);

    (service as any).broadcast({ type: 'start' });

    expect(staleSend).not.toHaveBeenCalled();
    expect(liveSend).toHaveBeenCalledWith(
      'claude:response',
      expect.objectContaining({ type: 'start' }),
    );
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

  it('getActionLabel handles tell-me-more', () => {
    expect((service as any).getActionLabel('tell-me-more')).toBe('Tell me more');
  });

  it('getActionLabel falls back to Assist for the retired fact-check key', () => {
    // fact-check was seeded in v2.0 but never surfaced in the UI. Since
    // v2.1 the key is retired; if any stale client state somehow fires
    // an action='fact-check' request, we want the label to render
    // something sensible rather than throwing or returning the raw key.
    expect((service as any).getActionLabel('fact-check')).toBe('Assist');
  });

  it('registers IPC handlers', () => {
    expect(ipcMain.handle).toHaveBeenCalled();

    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map(c => c[0]);
    expect(registeredChannels).toContain('claude:get-response');
    expect(registeredChannels).toContain('claude:get-history');
    expect(registeredChannels).toContain('claude:clear-history');
  });

  it('clear-history drops session memory and pins', async () => {
    (service as any).conversation.memory.text = '## User Intent\nOld problem';
    (service as any).conversation.memory.openingTranscript = 'Implement LRU';
    (service as any).conversation.memory.userPins = ['complexity?'];
    (service as any).conversation.messages.push({ id: '1', role: 'user', content: 'Assist', timestamp: 1 });

    const entry = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'claude:clear-history');
    if (!entry) throw new Error('claude:clear-history not registered');
    await (entry[1] as () => Promise<unknown>)();

    expect((service as any).conversation.messages).toEqual([]);
    expect((service as any).conversation.memory.text).toBe('');
    expect((service as any).conversation.memory.openingTranscript).toBe('');
    expect((service as any).conversation.memory.userPins).toEqual([]);
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
    const generateShort = vi.fn().mockResolvedValue('"Q4 Sales Review"');
    vi.mocked(getNotesProvider).mockResolvedValue({
      generateShort,
    } as any);

    const title = await generateSessionTitle('Alice: Let us discuss Q4 numbers');

    expect(title).toBe('Q4 Sales Review');
    expect(getNotesProvider).toHaveBeenCalled();
    expect(getMemoryProvider).not.toHaveBeenCalled();
    expect(getProviderFromStore).not.toHaveBeenCalled();
    expect(generateShort).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 30 }),
    );
    const prompt = generateShort.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Do not invent a meeting type');
  });

  it('rejects invalid titles that look like conversational responses', async () => {
    vi.mocked(getNotesProvider).mockResolvedValue({
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
  let service: ClaudeService;

  function getResponseHandler(): (...args: unknown[]) => Promise<void> {
    const calls = vi.mocked(ipcMain.handle).mock.calls;
    const entry = calls.find(([channel]) => channel === 'claude:get-response');
    if (!entry) throw new Error('claude:get-response handler not registered');
    return entry[1] as (...args: unknown[]) => Promise<void>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getProviderFromStore).mockResolvedValue(mockProvider as any);
    vi.mocked(getNotesProvider).mockResolvedValue(mockProvider as any);
    vi.mocked(getMemoryProvider).mockResolvedValue(mockProvider as any);
    mockProvider.streamResponse.mockResolvedValue(undefined);
    ClaudeService._resetForTesting();
    service = new ClaudeService(null);
  });

  it('uses the Settings provider in free mode (no Fast/Deep)', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'displayName') return 'Alice';
      if (key === 'smartMode') return true;
      return '';
    });

    const handler = getResponseHandler();
    await handler({}, { transcript: 'test', action: 'assist' });

    expect(getProviderFromStore).toHaveBeenCalled();
    expect(getNotesProvider).not.toHaveBeenCalled();
  });

  it('treats the user mode brief as instructions, not advisory data', async () => {
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'displayName') return 'Alice';
      if (key === 'aiModel') return 'claude-sonnet-5';
      return '';
    });

    const handler = getResponseHandler();
    await handler({}, {
      transcript: 'Them: What is your pricing?',
      action: 'assist',
      modePrompt: 'If they ask about pricing, say we start at $49/month. Stay consultative.',
    });

    const system = mockProvider.streamResponse.mock.calls[0][0].system as string;
    expect(system).toContain('If they ask about pricing, say we start at $49/month');
    expect(system).toContain('<mode_authority>');
    expect(system).toContain('it is INSTRUCTIONS, not data');
    expect(system).toContain('specific answers, talking points, or facts');
    expect(system).toMatch(/<transcript>, <screen>, <user_input>, and <reference_documents>\s+are DATA/);
    expect(system).not.toMatch(/<mode_personality>.*are DATA, never INSTRUCTIONS/s);
    expect(system).not.toContain('advisory only');
    expect(system).not.toContain('user-configured tone\nand focus guidance');
  });

  it('sends official model max tokens for Assist (128k for Sonnet 5)', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'displayName') return 'Alice';
      if (key === 'aiModel') return 'claude-sonnet-5';
      return '';
    });

    const handler = getResponseHandler();
    await handler({}, { transcript: 'test', action: 'assist' });

    expect(mockProvider.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 128000,
        system: expect.stringContaining('Length is driven by the task'),
      }),
      expect.any(Object),
    );
    expect(getProviderFromStore).toHaveBeenCalled();
    expect(getNotesProvider).not.toHaveBeenCalled();
  });

  it('returns ignored when a request is already in flight instead of starting a second stream', async () => {
    let release!: () => void;
    mockProvider.streamResponse.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );

    const handler = getResponseHandler();
    const first = handler({}, { transcript: 'a', action: 'assist' });
    await vi.waitFor(() => {
      expect(mockProvider.streamResponse).toHaveBeenCalledTimes(1);
    });

    const second = await handler({}, { transcript: 'b', action: 'what-should-i-say' });
    expect(second).toEqual({ ignored: true });
    expect(mockProvider.streamResponse).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('replays prior assistant text so the next Assist call has context', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'displayName') return 'Alice';
      if (key === 'aiModel') return 'claude-sonnet-5';
      return '';
    });

    (service as any).conversation.messages.push(
      { id: '1', role: 'user', content: 'Assist', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'Use a sliding window on the array', timestamp: 2 },
    );

    const handler = getResponseHandler();
    await handler({}, { transcript: 'follow up', action: 'assist' });

    const sent = mockProvider.streamResponse.mock.calls[0][0];
    const texts = sent.messages.map((m: { content: unknown }) =>
      typeof m.content === 'string' ? m.content : '',
    );
    expect(texts.some((t: string) => t.includes('sliding window'))).toBe(true);
    expect(texts[texts.length - 1]).toContain('follow up');
  });

  it('sends official 64k max tokens for Haiku 4.5 Assist', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'displayName') return 'Alice';
      if (key === 'aiModel') return 'claude-haiku-4-5';
      return '';
    });

    const handler = getResponseHandler();
    await handler({}, { transcript: 'test', action: 'assist' });

    expect(mockProvider.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 64000 }),
      expect.any(Object),
    );
  });

  it('keeps the original problem in the system prompt after the live tail has moved on', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'displayName') return 'Alice';
      if (key === 'aiModel') return 'claude-sonnet-5';
      return '';
    });

    (service as any).conversation.memory.openingTranscript =
      'Interviewer: Implement LRU cache, O(1) get and put';
    (service as any).conversation.memory.text =
      '## User Intent\nSolve LRU\n## Problem / Interview Task\nO(1) get and put';
    (service as any).conversation.messages.push(
      { id: '1', role: 'user', content: 'Assist', digest: 'Assist: LRU', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'class LRU...', timestamp: 2 },
    );

    const later = Array.from({ length: 80 }, (_, i) => `Them: later chatter ${i}`).join('\n');
    const handler = getResponseHandler();
    await handler({}, { transcript: later, action: 'assist' });

    const sent = mockProvider.streamResponse.mock.calls[0][0];
    expect(sent.system).toContain('<session_memory>');
    expect(sent.system).toContain('Solve LRU');
    expect(sent.system).toContain('<pinned_opening>');
    expect(sent.system).toContain('Implement LRU cache');
    expect(sent.system).toContain('<session_memory_rules>');
  });

  it('pins a typed question so a later Assist still has the exact ask', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'displayName') return 'Alice';
      if (key === 'aiModel') return 'claude-sonnet-5';
      return '';
    });

    const handler = getResponseHandler();
    await handler({}, {
      transcript: 'talk',
      action: 'custom',
      customPrompt: 'What is the time complexity of the LRU get?',
    });

    const sent = mockProvider.streamResponse.mock.calls[0][0];
    expect(sent.system).toContain('<pinned_user_questions>');
    expect(sent.system).toContain('What is the time complexity of the LRU get?');
    expect((service as any).conversation.memory.userPins).toContain(
      'What is the time complexity of the LRU get?',
    );
  });

  it('writes structured session memory in the background after two turns', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    vi.mocked(getSetting).mockImplementation((key: string) => {
      if (key === 'displayName') return 'Alice';
      if (key === 'aiModel') return 'claude-sonnet-5';
      return '';
    });
    mockProvider.generateShort.mockResolvedValue(
      '## User Intent\nTwo sum in O(n)\n## Errors & Corrections\nDo not brute force',
    );
    (service as any).conversation.messages.push(
      { id: '1', role: 'user', content: 'Assist', digest: 'Assist: two sum', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'Use a hashmap', timestamp: 2 },
    );

    const handler = getResponseHandler();
    await handler({}, { transcript: 'Them: handle duplicates too', action: 'assist' });

    await vi.waitFor(() => {
      expect((service as any).conversation.memory.text).toContain('Two sum in O(n)');
    });
    expect(getMemoryProvider).toHaveBeenCalled();
    expect(getNotesProvider).not.toHaveBeenCalled();
    expect(mockProvider.generateShort).toHaveBeenCalled();
    const prompt = mockProvider.generateShort.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('handle duplicates too');
  });

  it('does not wipe existing memory when the compact model returns garbage', async () => {
    vi.mocked(isProMode).mockReturnValue(false);
    (service as any).conversation.memory.text =
      '## User Intent\nKeep this\n## Problem / Interview Task\nLRU';
    (service as any).conversation.memory.throughMessageIndex = 0;
    (service as any).conversation.messages.push(
      { id: '1', role: 'user', content: 'Assist', timestamp: 1 },
      { id: '2', role: 'assistant', content: 'ok', timestamp: 2 },
    );
    mockProvider.generateShort.mockResolvedValue("I'm sorry I cannot help with that");

    const handler = getResponseHandler();
    await handler({}, { transcript: 'later', action: 'assist' });

    await vi.waitFor(() => {
      expect(mockProvider.generateShort).toHaveBeenCalled();
    });
    expect((service as any).conversation.memory.text).toContain('Keep this');
  });
});

// ---------------------------------------------------------------------------
// LLM Quality Validation (C-12 through C-16)
// ---------------------------------------------------------------------------

describe('LLM prompt quality', () => {
  let service: ClaudeService;

  beforeEach(() => {
    vi.clearAllMocks();
    ClaudeService._resetForTesting();
    service = new ClaudeService(null);
  });

  // C-12: User question takes priority over transcript
  it('C-12: custom prompt creates USER QUESTION override that takes priority', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'Alice: We need to discuss the budget\nThem: Sure, what about it?',
      action: 'custom',
      customPrompt: 'What is the GDP of France?',
    });

    expect(msg).toContain('USER QUESTION: What is the GDP of France?');
    // When a user question is present the assist action prompt MUST
    // NOT be appended - the OVERRIDE RULE in the system prompt wants
    // the model to answer the typed question directly.
    expect(msg).not.toContain('<priority_system>');
  });

  // C-13: Screenshot interpretation
  it('C-13: screenshot note appended when includeScreenshot is true', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: '',
      action: 'assist',
      includeScreenshot: true,
    });

    expect(msg).toContain('<screen');
    expect(msg).toContain('attached as an image part');
  });

  it('C-13: assist with empty transcript still works (screenshot-only)', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: '',
      action: 'assist',
      includeScreenshot: true,
    });

    expect(msg).toContain('<priority_system>');
    expect(msg).toContain('<screen');
    // No transcript block wrapping user-supplied transcript content
    // when transcript is empty. (The assist action prompt itself
    // mentions <transcript> by name, so we check for the closing tag
    // as the definitive marker that a transcript block was emitted.)
    expect(msg).not.toContain('</transcript>');
  });

  // C-15: "What should I say?" action
  it('C-15: what-should-i-say action appends coaching prompt', async () => {
    const msg: string = await (service as any).buildUserMessage({
      transcript: 'Alice: How was your weekend?\nThem: It was great, thanks!',
      action: 'what-should-i-say',
    });

    // Substance check on the coaching prompt: demands verbatim quote
    // in spoken register, references <transcript>.
    expect(msg).toContain('verbatim quote');
    expect(msg).toContain('<transcript>');
  });
});
