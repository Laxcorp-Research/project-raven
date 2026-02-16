/**
 * TranscriptionService — main process.
 * Opens a WebSocket to Deepgram, streams audio chunks, receives transcript events.
 * Emits transcript updates to the overlay window.
 */

import { BrowserWindow } from 'electron';
import type WebSocket from 'ws';
import { sessionManager } from './services/sessionManager';

const DEEPGRAM_WS_BASE = 'wss://api.deepgram.com/v1/listen';

type AudioSource = 'mic' | 'system';

interface TranscriptEntry {
  id: string;
  source: AudioSource;
  text: string;
  speaker: 'you' | 'them';
  timestamp: number;
  isFinal: boolean;
}

interface ConnectionState {
  ws: WebSocket | null;
  isConnected: boolean;
  keepAliveInterval: NodeJS.Timeout | null;
  currentInterim: string;
}

export class TranscriptionService {
  private micConnection: ConnectionState = { ws: null, isConnected: false, keepAliveInterval: null, currentInterim: '' };
  private systemConnection: ConnectionState = { ws: null, isConnected: false, keepAliveInterval: null, currentInterim: '' };
  private overlayWindow: BrowserWindow | null = null;
  private dashboardWindow: BrowserWindow | null = null;
  private apiKey: string = '';
  private transcriptEntries: TranscriptEntry[] = [];

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard;
    this.overlayWindow = overlay;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      console.error('[Transcription] No Deepgram API key!');
      return { success: false, error: 'No Deepgram API key configured' };
    }

    console.log('[Transcription] Starting both connections...');

    const [micResult, systemResult] = await Promise.all([
      this.startConnection('mic'),
      this.startConnection('system'),
    ]);

    console.log(
      `[Transcription] Connection results — Mic: ${micResult.success}, System: ${systemResult.success}`
    );

    if (!micResult.success && !systemResult.success) {
      return { success: false, error: 'Failed to start transcription' };
    }

    return { success: true };
  }

  private async startConnection(source: AudioSource): Promise<{ success: boolean }> {
    const state = source === 'mic' ? this.micConnection : this.systemConnection;

    if (state.isConnected) {
      console.log(`[Transcription] ${source} already connected`);
      return { success: true };
    }

    try {
      const { default: WebSocketModule } = await import('ws');

      const params = new URLSearchParams({
        model: 'nova-3',
        language: 'multi',
        smart_format: 'true',
        interim_results: 'true',
        punctuate: 'true',
        sample_rate: '16000',
        channels: '1',
        encoding: 'linear16',
        endpointing: '300',
        utterance_end_ms: '1500',
      });

      const url = `${DEEPGRAM_WS_BASE}?${params.toString()}`;

      state.ws = new WebSocketModule(url, {
        headers: { Authorization: `Token ${this.apiKey}` },
      }) as WebSocket;

      return new Promise((resolve) => {
        state.ws!.onopen = () => {
          console.log(`[Transcription] ${source} WebSocket connected`);
          state.isConnected = true;

          state.keepAliveInterval = setInterval(() => {
            if (state.ws && state.isConnected) {
              try {
                state.ws.send(JSON.stringify({ type: 'KeepAlive' }));
              } catch (err) {
                console.error(`[Transcription] ${source} keep-alive error:`, err);
              }
            }
          }, 8000);

          this.broadcastStatus(`${source}-connected`);
          resolve({ success: true });
        };

        state.ws!.onmessage = (event: { data: unknown }) => {
          try {
            const data = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
            
            console.log(`[Transcription] ${source} received:`, JSON.stringify(data).slice(0, 200));
            
            this.handleTranscriptResult(data, source);
          } catch (err) {
            console.error(`[Transcription] ${source} parse error:`, err);
          }
        };

        state.ws!.onerror = (event: { message?: string }) => {
          console.error(`[Transcription] ${source} WebSocket error:`, event.message || event);
          resolve({ success: false });
        };

        state.ws!.onclose = () => {
          console.log(`[Transcription] ${source} WebSocket closed`);
          state.isConnected = false;
          this.clearKeepAlive(state);
        };
      });
    } catch (err: unknown) {
      console.error(`[Transcription] ${source} failed to connect:`, err);
      return { success: false };
    }
  }

  private handleTranscriptResult(data: { channel?: { alternatives?: Array<{ transcript?: string }> }; is_final?: boolean }, source: AudioSource): void {
    console.log(`[Transcription] handleTranscriptResult called for ${source}`);
    
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript) {
      console.log(`[Transcription] ${source} - no transcript in message`);
      return;
    }

    console.log(`[Transcription] ${source} transcript: "${transcript}" (final: ${data.is_final})`);

    const isFinal = !!data.is_final;
    const state = source === 'mic' ? this.micConnection : this.systemConnection;
    const speaker: 'you' | 'them' = source === 'mic' ? 'you' : 'them';

    if (isFinal) {
      const now = Date.now();
      const MERGE_WINDOW_MS = 5000;

      const lastEntry = this.transcriptEntries[this.transcriptEntries.length - 1];
      const shouldMerge = lastEntry
        && lastEntry.speaker === speaker
        && (now - lastEntry.timestamp) < MERGE_WINDOW_MS;

      if (shouldMerge && lastEntry) {
        lastEntry.text = `${lastEntry.text} ${transcript}`;
        lastEntry.timestamp = now;
      } else {
        const entry: TranscriptEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          source,
          text: transcript,
          speaker,
          timestamp: now,
          isFinal: true,
        };
        this.transcriptEntries.push(entry);
      }

      state.currentInterim = '';

      const latestEntry = this.transcriptEntries[this.transcriptEntries.length - 1];
      sessionManager.addTranscriptEntry({
        id: latestEntry.id,
        source: latestEntry.source,
        text: latestEntry.text,
        timestamp: latestEntry.timestamp,
        isFinal: latestEntry.isFinal,
      });

      this.broadcastTranscript({
        entry: this.transcriptEntries[this.transcriptEntries.length - 1],
        isFinal: true,
        fullTranscript: this.getFullTranscriptText(),
        entries: this.transcriptEntries,
      });
    } else {
      state.currentInterim = transcript;

      sessionManager.addTranscriptEntry({
        id: `interim-${source}`,
        source,
        text: transcript,
        timestamp: Date.now(),
        isFinal: false,
      });

      this.broadcastTranscript({
        entry: {
          id: `interim-${source}`,
          source,
          text: transcript,
          speaker,
          timestamp: Date.now(),
          isFinal: false,
        },
        isFinal: false,
        fullTranscript: this.getFullTranscriptText(),
        entries: this.transcriptEntries,
        interims: {
          mic: this.micConnection.currentInterim,
          system: this.systemConnection.currentInterim,
        },
      });
    }
  }

  /**
   * Send audio data to the appropriate Deepgram connection.
   */
  sendAudio(buffer: ArrayBuffer, source: AudioSource): void {
    const state = source === 'mic' ? this.micConnection : this.systemConnection;

    if (!state.ws || !state.isConnected) {
      if (Math.random() < 0.01) {
        console.log(`[Transcription] ${source} not connected, dropping audio`);
      }
      return;
    }

    try {
      const buf = Buffer.from(buffer);
      // Diagnostic: log first few sends to check if audio data is non-zero
      state.sendCount = (state.sendCount || 0) + 1;
      if (state.sendCount <= 5 || state.sendCount % 200 === 0) {
        const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.min(10, buf.byteLength / 2));
        const maxVal = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        console.log(`[Transcription] ${source} send #${state.sendCount}: ${buf.byteLength} bytes, first10max=${maxVal}, first5=[${Array.from(samples).slice(0, 5)}]`);
      }
      state.ws.send(buf);
    } catch (err) {
      console.error(`[Transcription] ${source} send error:`, err);
    }
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.stopConnection(this.micConnection),
      this.stopConnection(this.systemConnection),
    ]);
    console.log('[Transcription] All connections stopped');
  }

  private async stopConnection(state: ConnectionState): Promise<void> {
    this.clearKeepAlive(state);

    if (state.ws) {
      try {
        if (state.isConnected) {
          state.ws.send(JSON.stringify({ type: 'CloseStream' }));

          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              console.log('[Transcription] Flush timeout reached, force closing');
              try { state.ws?.close(); } catch {}
              resolve();
            }, 3000);

            const origOnClose = state.ws!.onclose;
            state.ws!.onclose = (ev) => {
              clearTimeout(timeout);
              if (typeof origOnClose === 'function') origOnClose.call(state.ws, ev);
              resolve();
            };
          });
        } else {
          state.ws.close();
        }
      } catch (err) {
        console.error('[Transcription] Close error:', err);
        try { state.ws?.close(); } catch {}
      }
      state.ws = null;
    }

    state.isConnected = false;
    state.currentInterim = '';
  }

  getFullTranscript(): string {
    return this.getFullTranscriptText();
  }

  getTranscriptEntries(): TranscriptEntry[] {
    return this.transcriptEntries;
  }

  private getFullTranscriptText(): string {
    return this.transcriptEntries
      .map((e) => `${e.speaker === 'you' ? 'You' : 'Them'}: ${e.text}`)
      .join('\n');
  }

  clearTranscript(): void {
    this.transcriptEntries = [];
    this.micConnection.currentInterim = '';
    this.systemConnection.currentInterim = '';
  }

  private broadcastTranscript(data: {
    entry: TranscriptEntry;
    isFinal: boolean;
    fullTranscript: string;
    entries: TranscriptEntry[];
    interims?: { mic: string; system: string };
  }): void {
    const payload = data;

    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcription:update', payload);
      }
    } catch (err) {
      console.error('[Transcription] Broadcast to overlay failed:', err);
    }

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('transcription:update', payload);
      }
    } catch (err) {
      console.error('[Transcription] Broadcast to dashboard failed:', err);
    }
  }

  private broadcastStatus(status: string): void {
    const payload = { status };

    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcription:status', payload);
      }
    } catch (err) { /* ignore */ }

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('transcription:status', payload);
      }
    } catch (err) { /* ignore */ }
  }

  private clearKeepAlive(state: ConnectionState): void {
    if (state.keepAliveInterval) {
      clearInterval(state.keepAliveInterval);
      state.keepAliveInterval = null;
    }
  }
}
