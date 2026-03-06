/**
 * TranscriptionService — main process.
 * Opens a WebSocket to Deepgram, streams audio chunks, receives transcript events.
 * Emits transcript updates to the overlay window.
 */

import { BrowserWindow } from 'electron';
import type WebSocket from 'ws';
import { sessionManager } from './services/sessionManager';
import { getSetting } from './store';
import { createLogger } from './logger';
import { AUDIO_SAMPLE_RATE, AUDIO_CHANNELS, DEEPGRAM_KEEPALIVE_MS, DEEPGRAM_ENDPOINTING_MS, DEEPGRAM_UTTERANCE_END_MS, TRANSCRIPT_MERGE_WINDOW_MS, TRANSCRIPT_FLUSH_TIMEOUT_MS } from './constants';

const log = createLogger('Transcription');

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
  sendCount?: number;
  reconnectAttempts?: number;
}

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000;
const MAX_TRANSCRIPT_ENTRIES = 5000;

export class TranscriptionService {
  private micConnection: ConnectionState = { ws: null, isConnected: false, keepAliveInterval: null, currentInterim: '', sendCount: 0, reconnectAttempts: 0 };
  private systemConnection: ConnectionState = { ws: null, isConnected: false, keepAliveInterval: null, currentInterim: '', sendCount: 0, reconnectAttempts: 0 };
  private overlayWindow: BrowserWindow | null = null;
  private dashboardWindow: BrowserWindow | null = null;
  private apiKey: string = '';
  private transcriptEntries: TranscriptEntry[] = [];
  private isActive = false;

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard;
    this.overlayWindow = overlay;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      log.error('No Deepgram API key!');
      return { success: false, error: 'No Deepgram API key configured' };
    }

    log.info('Starting both connections...');
    this.isActive = true;

    const [micResult, systemResult] = await Promise.all([
      this.startConnection('mic'),
      this.startConnection('system'),
    ]);

    log.info(
      `Connection results — Mic: ${micResult.success}, System: ${systemResult.success}`
    );

    if (!micResult.success && !systemResult.success) {
      this.isActive = false;
      return { success: false, error: 'Failed to start transcription' };
    }

    return { success: true };
  }

  private async startConnection(source: AudioSource): Promise<{ success: boolean }> {
    const state = source === 'mic' ? this.micConnection : this.systemConnection;

    if (state.isConnected) {
      log.debug(`${source} already connected`);
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
        sample_rate: String(AUDIO_SAMPLE_RATE),
        channels: String(AUDIO_CHANNELS),
        encoding: 'linear16',
        endpointing: String(DEEPGRAM_ENDPOINTING_MS),
        utterance_end_ms: String(DEEPGRAM_UTTERANCE_END_MS),
      });

      const url = `${DEEPGRAM_WS_BASE}?${params.toString()}`;

      state.ws = new WebSocketModule(url, {
        headers: { Authorization: `Token ${this.apiKey}` },
      }) as WebSocket;

      return new Promise((resolve) => {
        const connectionTimeout = setTimeout(() => {
          log.error(`${source} WebSocket connection timed out after 10s`);
          try { state.ws?.close(); } catch {}
          resolve({ success: false });
        }, 10_000);

        state.ws!.onopen = () => {
          clearTimeout(connectionTimeout);
          log.info(`${source} WebSocket connected`);
          state.isConnected = true;

          state.keepAliveInterval = setInterval(() => {
            if (state.ws && state.isConnected) {
              try {
                state.ws.send(JSON.stringify({ type: 'KeepAlive' }));
              } catch (err) {
                log.error(`${source} keep-alive error:`, err);
              }
            }
          }, DEEPGRAM_KEEPALIVE_MS);

          this.broadcastStatus(`${source}-connected`);
          resolve({ success: true });
        };

        state.ws!.onmessage = (event: { data: unknown }) => {
          try {
            const data = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
            
            log.debug(`${source} received:`, JSON.stringify(data).slice(0, 200));
            
            this.handleTranscriptResult(data, source);
          } catch (err) {
            log.error(`${source} parse error:`, err);
          }
        };

        state.ws!.onerror = (event: { message?: string }) => {
          clearTimeout(connectionTimeout);
          log.error(`${source} WebSocket error:`, event.message || event);
          resolve({ success: false });
        };

        state.ws!.onclose = (event: { code?: number; reason?: string }) => {
          const code = event?.code ?? 'unknown';
          const reason = event?.reason ?? 'no reason';
          log.warn(`${source} WebSocket closed (code=${code}, reason="${reason}", sends=${state.sendCount || 0})`);
          state.isConnected = false;
          this.clearKeepAlive(state);

          // Reconnect if session is still active and this was unexpected
          if (this.isActive && code !== 1000) {
            this.attemptReconnect(source);
          }
        };
      });
    } catch (err: unknown) {
      log.error(`${source} failed to connect:`, err);
      return { success: false };
    }
  }

  private async attemptReconnect(source: AudioSource): Promise<void> {
    const state = source === 'mic' ? this.micConnection : this.systemConnection;
    state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;

    if (state.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      log.error(`${source} exceeded max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}), giving up`);
      this.broadcastStatus(`${source}-disconnected`);
      return;
    }

    const delay = RECONNECT_DELAY_MS * state.reconnectAttempts;
    log.info(`${source} reconnecting in ${delay}ms (attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (!this.isActive) {
      log.debug(`${source} session ended during reconnect wait, aborting`);
      return;
    }

    state.sendCount = 0;
    const result = await this.startConnection(source);
    if (result.success) {
      log.info(`${source} reconnected successfully`);
      state.reconnectAttempts = 0;
    } else {
      log.error(`${source} reconnect failed`);
      this.attemptReconnect(source);
    }
  }

  private handleTranscriptResult(data: { channel?: { alternatives?: Array<{ transcript?: string }> }; is_final?: boolean }, source: AudioSource): void {
    log.debug(`handleTranscriptResult called for ${source}`);
    
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript) {
      log.debug(`${source} - no transcript in message`);
      return;
    }

    log.debug(`${source} transcript: "${transcript}" (final: ${data.is_final})`);

    const isFinal = !!data.is_final;
    const state = source === 'mic' ? this.micConnection : this.systemConnection;
    const speaker: 'you' | 'them' = source === 'mic' ? 'you' : 'them';

    if (isFinal) {
      const now = Date.now();

      const lastEntry = this.transcriptEntries[this.transcriptEntries.length - 1];
      const shouldMerge = lastEntry
        && lastEntry.speaker === speaker
        && (now - lastEntry.timestamp) < TRANSCRIPT_MERGE_WINDOW_MS;

      if (shouldMerge && lastEntry) {
        lastEntry.text = `${lastEntry.text} ${transcript}`;
        lastEntry.timestamp = now;
      } else {
        if (this.transcriptEntries.length >= MAX_TRANSCRIPT_ENTRIES) {
          this.transcriptEntries = this.transcriptEntries.slice(-Math.floor(MAX_TRANSCRIPT_ENTRIES * 0.8));
        }
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
  sendAudio(buffer: Buffer | ArrayBuffer, source: AudioSource): void {
    const state = source === 'mic' ? this.micConnection : this.systemConnection;

    if (!state.ws || !state.isConnected) {
      if (Math.random() < 0.01) {
        log.debug(`${source} not connected, dropping audio`);
      }
      return;
    }

    try {
      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      state.sendCount = (state.sendCount || 0) + 1;
      if (state.sendCount <= 5 || state.sendCount % 200 === 0) {
        const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.min(10, buf.byteLength / 2));
        const maxVal = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        log.debug(`${source} send #${state.sendCount}: ${buf.byteLength} bytes, first10max=${maxVal}, first5=[${Array.from(samples).slice(0, 5)}]`);
      }
      state.ws.send(buf);
    } catch (err) {
      log.error(`${source} send error:`, err);
    }
  }

  async stop(): Promise<void> {
    this.isActive = false;
    await Promise.all([
      this.stopConnection(this.micConnection),
      this.stopConnection(this.systemConnection),
    ]);
    this.micConnection.reconnectAttempts = 0;
    this.systemConnection.reconnectAttempts = 0;
    log.info('All connections stopped');
  }

  private async stopConnection(state: ConnectionState): Promise<void> {
    this.clearKeepAlive(state);

    if (state.ws) {
      try {
        if (state.isConnected) {
          state.ws.send(JSON.stringify({ type: 'CloseStream' }));

          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              log.warn('Flush timeout reached, force closing');
              try { state.ws?.close(); } catch {}
              resolve();
            }, TRANSCRIPT_FLUSH_TIMEOUT_MS);

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
        log.error('Close error:', err);
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

  /**
   * Returns finalized transcript PLUS any current interim (still-speaking) text.
   * Interims are labeled so the LLM knows the speaker hasn't finished yet.
   */
  getFullTranscriptWithInterims(): string {
    let text = this.getFullTranscriptText();
    const displayName = getSetting('displayName') || 'You';

    if (this.systemConnection.currentInterim) {
      text += `\nThem (still speaking): ${this.systemConnection.currentInterim}`;
    }
    if (this.micConnection.currentInterim) {
      text += `\n${displayName} (still speaking): ${this.micConnection.currentInterim}`;
    }

    return text;
  }

  getTranscriptEntries(): TranscriptEntry[] {
    return this.transcriptEntries;
  }

  private getFullTranscriptText(): string {
    const displayName = getSetting('displayName') || 'You';
    return this.transcriptEntries
      .map((e) => `${e.speaker === 'you' ? displayName : 'Them'}: ${e.text}`)
      .join('\n');
  }

  getTranscriptBySource(source: 'mic' | 'system' | 'all'): string {
    const displayName = getSetting('displayName') || 'You';
    const filtered = source === 'all'
      ? this.transcriptEntries
      : this.transcriptEntries.filter(e => e.source === source);
    return filtered
      .map(e => `${e.speaker === 'you' ? displayName : 'Them'}: ${e.text}`)
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
    interims?: { mic: string; system: string };
  }): void {
    const payload = data;

    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcription:update', payload);
      }
    } catch (err) {
      log.error('Broadcast to overlay failed:', err);
    }

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('transcription:update', payload);
      }
    } catch (err) {
      log.error('Broadcast to dashboard failed:', err);
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
