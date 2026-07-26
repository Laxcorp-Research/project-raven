/**
 * TranscriptionService - main process.
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
const SIXTYDB_STT_WS_BASE = 'wss://api.60db.ai/ws/stt';

type AudioSource = 'mic' | 'system';

interface TranscriptEntry {
  id: string;
  source: AudioSource;
  text: string;
  speaker: 'you' | 'them';
  timestamp: number;
  isFinal: boolean;
}

const RECONNECT_BUFFER_MAX_CHUNKS = 50;

interface ConnectionState {
  ws: WebSocket | null;
  isConnected: boolean;
  keepAliveInterval: NodeJS.Timeout | null;
  currentInterim: string;
  sendCount?: number;
  reconnectAttempts?: number;
  pendingAudio?: Buffer[];
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
  // With Deepgram diarize=true, the mic stream may contain multiple
  // speaker IDs when remote voices bleed through the local mic (e.g.,
  // FaceTime audio played through the speaker is picked up by the
  // microphone). Whichever speaker ID shows up FIRST on the mic
  // stream is assumed to be the local user - heuristic, but better
  // than labeling everything "you". Reset between recording sessions
  // in start().
  private localMicSpeakerId: number | null = null;

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard;
    this.overlayWindow = overlay;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      const provider = (getSetting('transcriptionProvider') as string) || 'deepgram';
      const label = provider === 'sixtydb' ? '60db' : 'Deepgram';
      log.error(`No ${label} API key!`);
      return { success: false, error: `No ${label} API key configured` };
    }

    log.info('Starting both connections...');
    this.isActive = true;
    // Reset diarization state for the new session - last session's
    // "speaker 0" is not the same person as this session's.
    this.localMicSpeakerId = null;

    const [micResult, systemResult] = await Promise.all([
      this.startConnection('mic'),
      this.startConnection('system'),
    ]);

    log.info(
      `Connection results - Mic: ${micResult.success}, System: ${systemResult.success}`
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

    // Dispatch to 60db when the user picked it as the transcription provider.
    // Default 'deepgram' keeps the original code path untouched.
    const provider = (getSetting('transcriptionProvider') as string) || 'deepgram';
    if (provider === 'sixtydb') {
      return this.startSixtydbConnection(source);
    }

    try {
      const { default: WebSocketModule } = await import('ws');

      const transcriptionLanguage = (getSetting('transcriptionLanguage') as string) || 'en';

      const params = new URLSearchParams({
        model: 'nova-3',
        language: transcriptionLanguage,
        smart_format: 'true',
        interim_results: 'true',
        punctuate: 'true',
        // Speaker diarization. On the mic stream this lets us tell
        // apart the local user from remote voices that leak through
        // (FaceTime, in-person meetings where the other party is
        // audible through the mic). Without it, everything on mic is
        // labeled "you" and both sides of a FaceTime call merge.
        // nova-3 supports diarize for all languages it transcribes.
        diarize: 'true',
        sample_rate: String(AUDIO_SAMPLE_RATE),
        channels: String(AUDIO_CHANNELS),
        encoding: 'linear16',
        endpointing: String(DEEPGRAM_ENDPOINTING_MS),
        utterance_end_ms: String(DEEPGRAM_UTTERANCE_END_MS),
      });

      // Inject keyterms (brand name + user vocabulary) for nova-3's
      // Keyword Prompting feature. Free-tier path talks directly to
      // Deepgram so we can't share the backend's sanitizer - replicate
      // the mandatory-"Raven"-first + dedupe + 100-cap contract here.
      const vocabString = (getSetting('vocabulary' as keyof import('./store').LocalSettings) as string) || '';
      const userTerms = vocabString.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
      const seen = new Set<string>();
      const finalTerms: string[] = [];
      for (const term of ['Raven', ...userTerms]) {
        const key = term.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        finalTerms.push(term);
        if (finalTerms.length >= 100) break;
      }
      // URLSearchParams repeats a key for each appended value - which is
      // exactly how Deepgram wants `keyterms` passed.
      for (const term of finalTerms) params.append('keyterms', term);

      const url = `${DEEPGRAM_WS_BASE}?${params.toString()}`;

      state.ws = new WebSocketModule(url, {
        headers: { Authorization: `Token ${this.apiKey}` },
      }) as WebSocket;

      return new Promise((resolve) => {
        const connectionTimeout = setTimeout(() => {
          log.error(`${source} WebSocket connection timed out after 10s`);
          try { state.ws?.close(); } catch { /* already-closed, ignore */ }
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

  // 60db STT WebSocket variant. Mirrors startConnection's contract: opens a
  // per-source connection, wires onmessage/onclose, sets up reconnect on
  // unexpected disconnect. The wire protocol differs from Deepgram:
  //   1. connect → server sends connection_established + connected
  //   2. client sends { type: "start", config: {...} } → server replies session_started
  //   3. client streams raw binary PCM frames (linear16 16k mono — same format AudioManager pipes today)
  //   4. server emits { type: "transcription", text, is_final, speech_final, ... }
  //   5. client sends { type: "stop" } before closing
  // We don't supply `context` so 60db emits a single canonical final per
  // sentence (no two-phase first-emit), matching Deepgram's "one final
  // per is_final=true" model that handleTranscriptResult already expects.
  private async startSixtydbConnection(source: AudioSource): Promise<{ success: boolean }> {
    const state = source === 'mic' ? this.micConnection : this.systemConnection;
    try {
      const { default: WebSocketModule } = await import('ws');
      const transcriptionLanguage = (getSetting('transcriptionLanguage') as string) || 'en';
      const url = `${SIXTYDB_STT_WS_BASE}?apiKey=${encodeURIComponent(this.apiKey)}`;
      state.ws = new WebSocketModule(url) as WebSocket;

      let sessionReady = false;

      return new Promise((resolve) => {
        const connectionTimeout = setTimeout(() => {
          log.error(`${source} 60db STT WebSocket connection timed out after 10s`);
          try { state.ws?.close(); } catch { /* already-closed, ignore */ }
          resolve({ success: false });
        }, 10_000);

        state.ws!.onopen = () => {
          log.info(`${source} 60db STT WebSocket connected (waiting for session_started)`);
          // We resolve { success: true } only after the server's session_started
          // confirms it's ready to accept audio. Until then we hold the timeout.
        };

        state.ws!.onmessage = (event: { data: unknown }) => {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
          } catch (err) {
            log.error(`${source} 60db parse error:`, err);
            return;
          }

          // Initial handshake: connection_established → connected → send start.
          if (data.connection_established) {
            log.debug(`${source} 60db connection_established`);
            const startMsg = {
              type: 'start',
              languages: [transcriptionLanguage],
              config: {
                encoding: 'linear',
                sample_rate: AUDIO_SAMPLE_RATE,
                continuous_mode: true,
                utterance_end_ms: Math.max(300, DEEPGRAM_UTTERANCE_END_MS),
                interim_results_frequency: 300,
                // diarize=true on mic so we can apply the same "first speaker
                // wins 'you'" heuristic the Deepgram path uses.
                diarize: source === 'mic',
                audio_enhancement: 'adaptive',
              },
            };
            try { state.ws?.send(JSON.stringify(startMsg)); } catch (err) { log.error('60db start send failed:', err); }
            return;
          }

          if (data.type === 'connected') {
            log.debug(`${source} 60db proxy ready`);
            return;
          }

          if (data.type === 'session_started') {
            clearTimeout(connectionTimeout);
            sessionReady = true;
            state.isConnected = true;
            log.info(`${source} 60db session_started`);
            this.broadcastStatus(`${source}-connected`);
            resolve({ success: true });
            return;
          }

          if (data.type === 'transcription') {
            // Normalize 60db's shape into the Deepgram-shaped envelope that
            // handleTranscriptResult already consumes. text → alternatives[0].transcript;
            // speech_final → is_final (canonical-only is the signal we want; first-emit
            // partials and interims arrive with is_final=false).
            const text = (data.text as string) || '';
            const isFinal = !!data.speech_final;
            // Best-effort diarization: 60db emits speakers[] as segment-level not
            // word-level. Reuse the first segment's numeric suffix as the "speaker"
            // hint for the local-mic heuristic.
            const speakers = (data.speakers as Array<{ speaker?: string }> | undefined) || [];
            const speakerStr = speakers[0]?.speaker; // e.g. "SPEAKER_00"
            const speakerNum = speakerStr ? Number(speakerStr.replace(/[^0-9]/g, '')) : undefined;
            const adapted = {
              channel: {
                alternatives: [{
                  transcript: text,
                  words: typeof speakerNum === 'number' && Number.isFinite(speakerNum)
                    ? [{ speaker: speakerNum }]
                    : undefined,
                }],
              },
              is_final: isFinal,
            };
            this.handleTranscriptResult(adapted, source);
            return;
          }

          if (data.type === 'error') {
            log.error(`${source} 60db error:`, data.error, data.error_code);
            return;
          }

          if (data.type === 'session_stopped') {
            log.info(`${source} 60db session_stopped`, data.billing_summary);
          }
        };

        state.ws!.onerror = (event: { message?: string }) => {
          clearTimeout(connectionTimeout);
          log.error(`${source} 60db WebSocket error:`, event.message || event);
          if (!sessionReady) resolve({ success: false });
        };

        state.ws!.onclose = (event: { code?: number; reason?: string }) => {
          const code = event?.code ?? 'unknown';
          const reason = event?.reason ?? 'no reason';
          log.warn(`${source} 60db WebSocket closed (code=${code}, reason="${reason}", sends=${state.sendCount || 0})`);
          state.isConnected = false;
          // 60db has no application-level KeepAlive; ws library handles ping/pong.
          // Same reconnect policy as Deepgram path.
          if (this.isActive && code !== 1000) {
            this.attemptReconnect(source);
          }
        };
      });
    } catch (err: unknown) {
      log.error(`${source} 60db failed to connect:`, err);
      return { success: false };
    }
  }

  private reconnecting = new Set<AudioSource>();

  private async attemptReconnect(source: AudioSource): Promise<void> {
    if (this.reconnecting.has(source)) return;
    this.reconnecting.add(source);

    const state = source === 'mic' ? this.micConnection : this.systemConnection;
    state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;

    if (state.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      log.error(`${source} exceeded max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}), giving up`);
      this.reconnecting.delete(source);
      this.broadcastStatus(`${source}-disconnected`);
      return;
    }

    const delay = RECONNECT_DELAY_MS * state.reconnectAttempts;
    log.info(`${source} reconnecting in ${delay}ms (attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    if (!this.isActive) {
      log.debug(`${source} session ended during reconnect wait, aborting`);
      this.reconnecting.delete(source);
      return;
    }

    state.sendCount = 0;
    const result = await this.startConnection(source);
    this.reconnecting.delete(source);
    if (result.success) {
      log.info(`${source} reconnected successfully`);
      state.reconnectAttempts = 0;
    } else {
      log.error(`${source} reconnect failed`);
      this.attemptReconnect(source);
    }
  }

  private handleTranscriptResult(
    data: {
      channel?: {
        alternatives?: Array<{
          transcript?: string
          words?: Array<{ speaker?: number }>
        }>
      }
      is_final?: boolean
    },
    source: AudioSource,
  ): void {
    log.debug(`handleTranscriptResult called for ${source}`);
    
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript) {
      log.debug(`${source} - no transcript in message`);
      return;
    }

    log.debug(`${source} transcript: "${transcript}" (final: ${data.is_final})`);

    const isFinal = !!data.is_final;
    const state = source === 'mic' ? this.micConnection : this.systemConnection;

    // Speaker attribution. System-stream audio is always the remote
    // party, regardless of diarize output (OS system audio is by
    // definition not the local user). Mic stream uses diarize: the
    // first speaker_id seen wins the "you" label; any different
    // speaker_id after that is a remote voice leaking through the
    // microphone (FaceTime speaker feedback, in-person, etc.).
    let speaker: 'you' | 'them' = source === 'mic' ? 'you' : 'them';
    if (source === 'mic') {
      const words = data.channel?.alternatives?.[0]?.words;
      const firstWordSpeaker = words?.[0]?.speaker;
      if (typeof firstWordSpeaker === 'number') {
        if (this.localMicSpeakerId === null) {
          this.localMicSpeakerId = firstWordSpeaker;
          log.info(`Mic stream: registered speaker_id ${firstWordSpeaker} as local user`);
        } else if (firstWordSpeaker !== this.localMicSpeakerId) {
          speaker = 'them';
          log.debug(`Mic stream: speaker_id ${firstWordSpeaker} != local (${this.localMicSpeakerId}), tagging as 'them'`);
        }
      }
    }

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
          const dropped = this.transcriptEntries.length - Math.floor(MAX_TRANSCRIPT_ENTRIES * 0.8);
          log.warn(`Transcript cap reached (${MAX_TRANSCRIPT_ENTRIES}) - dropping ${dropped} oldest entries`);
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
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    if (!state.ws || !state.isConnected) {
      if (!state.pendingAudio) state.pendingAudio = [];
      if (state.pendingAudio.length < RECONNECT_BUFFER_MAX_CHUNKS) {
        state.pendingAudio.push(buf);
      }
      return;
    }

    // Flush any buffered audio from a recent reconnect
    if (state.pendingAudio && state.pendingAudio.length > 0) {
      log.info(`${source} flushing ${state.pendingAudio.length} buffered chunks after reconnect`);
      for (const pending of state.pendingAudio) {
        try { state.ws.send(pending); } catch { break; }
      }
      state.pendingAudio = [];
    }

    try {
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
          // Provider-specific terminate. Deepgram uses CloseStream; 60db uses
          // {type:"stop"} which triggers session_stopped + billing summary.
          const provider = (getSetting('transcriptionProvider') as string) || 'deepgram';
          const closeMsg = provider === 'sixtydb'
            ? JSON.stringify({ type: 'stop' })
            : JSON.stringify({ type: 'CloseStream' });
          state.ws.send(closeMsg);

          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              log.warn('Flush timeout reached, force closing');
              try { state.ws?.close(); } catch { /* already-closed, ignore */ }
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
        try { state.ws?.close(); } catch { /* already-closed, ignore */ }
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
