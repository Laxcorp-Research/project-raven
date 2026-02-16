import { vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}));

vi.mock('../services/sessionManager', () => ({
  sessionManager: {
    addTranscriptEntry: vi.fn(),
  },
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

vi.mock('ws', () => ({
  default: vi.fn(),
}));

import { TranscriptionService } from '../transcriptionService';
import { getSetting } from '../store';

describe('TranscriptionService', () => {
  let service: TranscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSetting).mockImplementation((key: string) =>
      key === 'displayName' ? 'Alice' : '',
    );
    service = new TranscriptionService();
  });

  // ---------------------------------------------------------------------------
  // getFullTranscript
  // ---------------------------------------------------------------------------

  it('getFullTranscript returns empty string when no entries', () => {
    expect(service.getFullTranscript()).toBe('');
  });

  it('getFullTranscript formats entries with displayName for "you" speaker', () => {
    (service as any).transcriptEntries = [
      { id: '1', source: 'mic', text: 'Hello there', speaker: 'you', timestamp: 1000, isFinal: true },
    ];

    expect(service.getFullTranscript()).toBe('Alice: Hello there');
  });

  it('getFullTranscript uses "Them" for non-you speakers', () => {
    (service as any).transcriptEntries = [
      { id: '1', source: 'system', text: 'Hi, nice to meet you', speaker: 'them', timestamp: 1000, isFinal: true },
    ];

    expect(service.getFullTranscript()).toBe('Them: Hi, nice to meet you');
  });

  it('getFullTranscript falls back to "You" when no displayName is set', () => {
    vi.mocked(getSetting).mockReturnValue('');

    (service as any).transcriptEntries = [
      { id: '1', source: 'mic', text: 'Hello', speaker: 'you', timestamp: 1000, isFinal: true },
    ];

    expect(service.getFullTranscript()).toBe('You: Hello');
  });

  // ---------------------------------------------------------------------------
  // handleTranscriptResult
  // ---------------------------------------------------------------------------

  it('handleTranscriptResult creates new entry for a final result', () => {
    const data = {
      channel: { alternatives: [{ transcript: 'First sentence' }] },
      is_final: true,
    };

    (service as any).handleTranscriptResult(data, 'mic');

    const entries = service.getTranscriptEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('First sentence');
    expect(entries[0].speaker).toBe('you');
    expect(entries[0].isFinal).toBe(true);
  });

  it('handleTranscriptResult merges consecutive same-speaker entries within 5 s', () => {
    const first = {
      channel: { alternatives: [{ transcript: 'Part one' }] },
      is_final: true,
    };
    const second = {
      channel: { alternatives: [{ transcript: 'part two' }] },
      is_final: true,
    };

    (service as any).handleTranscriptResult(first, 'mic');
    (service as any).handleTranscriptResult(second, 'mic');

    const entries = service.getTranscriptEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Part one part two');
  });

  it('handleTranscriptResult creates separate entry when speaker differs', () => {
    const micData = {
      channel: { alternatives: [{ transcript: 'Hello from mic' }] },
      is_final: true,
    };
    const systemData = {
      channel: { alternatives: [{ transcript: 'Hello from system' }] },
      is_final: true,
    };

    (service as any).handleTranscriptResult(micData, 'mic');
    (service as any).handleTranscriptResult(systemData, 'system');

    const entries = service.getTranscriptEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].speaker).toBe('you');
    expect(entries[1].speaker).toBe('them');
  });

  // ---------------------------------------------------------------------------
  // clearTranscript
  // ---------------------------------------------------------------------------

  it('clearTranscript resets all state', () => {
    (service as any).transcriptEntries = [
      { id: '1', source: 'mic', text: 'text', speaker: 'you', timestamp: 1000, isFinal: true },
    ];
    (service as any).micConnection.currentInterim = 'interim mic';
    (service as any).systemConnection.currentInterim = 'interim system';

    service.clearTranscript();

    expect(service.getTranscriptEntries()).toHaveLength(0);
    expect(service.getFullTranscript()).toBe('');
    expect((service as any).micConnection.currentInterim).toBe('');
    expect((service as any).systemConnection.currentInterim).toBe('');
  });
});
