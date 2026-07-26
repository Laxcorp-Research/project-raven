// 60db TTS service. Synthesizes text to audio bytes for the renderer to play.
//
// One public method: synthesize(text) -> Buffer.
// Internally dispatches to REST / NDJSON stream / WebSocket based on the
// sixtydbMode setting. Reads api key + voice id from the encrypted local store.
//
// All three surfaces return raw audio bytes ready for HTMLAudioElement on
// the renderer. REST + NDJSON yield mp3; WebSocket yields LINEAR16 PCM @ 16kHz
// which is wrapped in a minimal WAV header before being returned.

import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { Buffer } from 'buffer';
import { getApiKey, getSetting } from './store';
import { createLogger } from './logger';

const log = createLogger('TTS');

const SIXTYDB_REST_URL = 'https://api.60db.ai/tts-synthesize';
const SIXTYDB_STREAM_URL = 'https://api.60db.ai/tts-stream';
const SIXTYDB_WS_URL = 'wss://api.60db.ai/ws/tts';

interface SixtydbContext {
  apiKey: string;
  voiceId: string;
  mode: 'rest' | 'stream' | 'websocket';
}

function loadContext(): SixtydbContext {
  const apiKey = getApiKey('sixtydbApiKey');
  if (!apiKey) throw new Error('60db API key is not configured. Add it in Settings → API Keys.');
  const voiceId = (getSetting('sixtydbVoiceId') as string) || 'fbb75ed2-975a-40c7-9e06-38e30524a9a1';
  const mode = (getSetting('sixtydbMode') as 'rest' | 'stream' | 'websocket') || 'rest';
  return { apiKey, voiceId, mode };
}

// REST one-shot. Server returns { success, audio_base64, sample_rate, ... }.
async function fetchRest(text: string, ctx: SixtydbContext): Promise<Buffer> {
  const res = await fetch(SIXTYDB_REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_id: ctx.voiceId,
      output_format: 'mp3',
      enhance: true,
      speed: 1.0,
      stability: 50,
      similarity: 75,
    }),
  });
  if (!res.ok) {
    throw new Error(`60db /tts-synthesize ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { audio_base64?: string };
  if (!data.audio_base64) {
    throw new Error(`60db response missing audio_base64`);
  }
  return Buffer.from(data.audio_base64, 'base64');
}

// NDJSON streaming. Each line: { type, result?, message? }. Buffer all chunks.
async function fetchStream(text: string, ctx: SixtydbContext): Promise<Buffer> {
  const res = await fetch(SIXTYDB_STREAM_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text, voice_id: ctx.voiceId, enhance: true,
      speed: 1.0, stability: 50, similarity: 75,
    }),
  });
  if (!res.ok) {
    throw new Error(`60db /tts-stream ${res.status}: ${await res.text()}`);
  }
  if (!res.body) throw new Error('60db /tts-stream returned no body');

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  const parts: Buffer[] = [];
  let buffer = '';

  const absorb = (line: string): void => {
    if (!line.trim()) return;
    let evt: { type?: string; result?: { audioContent?: string }; message?: string };
    try { evt = JSON.parse(line); } catch { return; }
    if (evt.type === 'chunk' && evt.result?.audioContent) {
      parts.push(Buffer.from(evt.result.audioContent, 'base64'));
    } else if (evt.type === 'error') {
      throw new Error(`60db stream error: ${evt.message}`);
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) absorb(line);
  }
  if (buffer.trim()) absorb(buffer);

  return Buffer.concat(parts);
}

// WebSocket session. Collects audio_chunk frames (LINEAR16 PCM mono 16kHz)
// then wraps them in a WAV container so HTMLAudioElement can decode them.
async function fetchWebSocket(text: string, ctx: SixtydbContext): Promise<Buffer> {
  const url = `${SIXTYDB_WS_URL}?apiKey=${encodeURIComponent(ctx.apiKey)}`;
  const contextId = randomUUID();
  const sampleRate = 16000;
  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(url);
    const audioParts: Buffer[] = [];
    const send = (obj: unknown): void => ws.send(JSON.stringify(obj));
    const fail = (msg: string): void => {
      try { ws.close(); } catch { /* noop */ }
      reject(new Error(msg));
    };

    ws.on('message', (raw: Buffer | string) => {
      let evt: Record<string, { audioContent?: string; message?: string } | undefined>;
      try { evt = JSON.parse(raw.toString()); } catch { return; }
      if (evt.connection_established) {
        send({ create_context: {
          context_id: contextId, voice_id: ctx.voiceId,
          audio_config: { audio_encoding: 'LINEAR16', sample_rate_hertz: sampleRate },
          speed: 1.0, stability: 50, similarity: 75,
        }});
      } else if (evt.context_created) {
        send({ send_text: { context_id: contextId, text } });
        send({ flush_context: { context_id: contextId } });
      } else if (evt.audio_chunk?.audioContent) {
        audioParts.push(Buffer.from(evt.audio_chunk.audioContent, 'base64'));
      } else if (evt.flush_completed) {
        send({ close_context: { context_id: contextId } });
      } else if (evt.context_closed) {
        ws.close();
        resolve(pcmToWav(Buffer.concat(audioParts), sampleRate));
      } else if (evt.error) {
        fail(`60db WS error: ${evt.error.message}`);
      }
    });
    ws.on('error', (e: Error) => fail(`60db WS transport: ${e.message}`));
    ws.on('close', () => {
      if (audioParts.length === 0) reject(new Error('60db WS closed before audio'));
    });
  });
}

// Minimal RIFF/WAVE header so HTMLAudioElement can decode the PCM payload.
function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);         // PCM chunk size
  header.writeUInt16LE(1, 20);          // format = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export class TTSService {
  async synthesize(text: string): Promise<Buffer> {
    if (!text || !text.trim()) throw new Error('Empty text');
    const ctx = loadContext();
    log.info(`Synthesizing ${text.length} chars via 60db mode=${ctx.mode}`);
    if (ctx.mode === 'rest') return fetchRest(text, ctx);
    if (ctx.mode === 'stream') return fetchStream(text, ctx);
    return fetchWebSocket(text, ctx);
  }

  /** Audio MIME type that matches the bytes returned by synthesize() for the
   *  current mode. Renderer uses this to build the Blob. */
  mimeType(): string {
    const mode = (getSetting('sixtydbMode') as string) || 'rest';
    return mode === 'websocket' ? 'audio/wav' : 'audio/mpeg';
  }
}

export const ttsService = new TTSService();
