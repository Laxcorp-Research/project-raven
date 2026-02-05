## Task: Phase B2 — Deepgram Real-Time Transcription

### Overview
Connect the audio chunks flowing from the overlay → main process to Deepgram's WebSocket streaming API. Live transcript text flows back to the overlay and displays in the response panel area. Uses the user's stored Deepgram API key. Handles interim (partial) + final results, speaker diarization, and connection lifecycle.

---

### Files to Create:

**`src/main/transcriptionService.ts`**
```typescript
/**
 * TranscriptionService — main process.
 * Opens a WebSocket to Deepgram, streams audio chunks, receives transcript events.
 * Emits transcript updates to the overlay window.
 */

import { BrowserWindow } from 'electron';

// Deepgram WebSocket URL
const DEEPGRAM_WS_BASE = 'wss://api.deepgram.com/v1/listen';

interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  speaker?: number;
  confidence: number;
}

interface TranscriptAlternative {
  transcript: string;
  confidence: number;
  words: TranscriptWord[];
}

interface TranscriptResult {
  is_final: boolean;
  speech_final: boolean;
  channel: {
    alternatives: TranscriptAlternative[];
  };
  from_finalize?: boolean;
}

export class TranscriptionService {
  private ws: WebSocket | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private dashboardWindow: BrowserWindow | null = null;
  private apiKey: string = '';
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private fullTranscript: string[] = [];
  private currentInterim = '';

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard;
    this.overlayWindow = overlay;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'No Deepgram API key configured' };
    }

    if (this.isConnected) {
      console.log('[Transcription] Already connected');
      return { success: true };
    }

    return new Promise((resolve) => {
      try {
        const params = new URLSearchParams({
          model: 'nova-3',
          language: 'en',
          smart_format: 'true',
          interim_results: 'true',
          punctuate: 'true',
          diarize: 'true',
          sample_rate: '16000',
          channels: '1',
          encoding: 'linear16',
          endpointing: '300',
          utterance_end_ms: '1500',
        });

        const url = `${DEEPGRAM_WS_BASE}?${params.toString()}`;

        this.ws = new WebSocket(url, {
          headers: {
            Authorization: `Token ${this.apiKey}`,
          },
        } as any);

        // Node.js WebSocket doesn't support headers in constructor directly.
        // We need to use the 'ws' package or handle auth differently.
        // Actually, in Electron's main process we can use Node's WebSocket.
        // Let's use a raw approach with the 'ws' module.

        this.setupWebSocket(resolve);
      } catch (err: any) {
        console.error('[Transcription] Failed to connect:', err);
        resolve({ success: false, error: err.message });
      }
    });
  }

  private setupWebSocket(onReady?: (result: { success: boolean; error?: string }) => void): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('[Transcription] Deepgram WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Send keep-alive every 8 seconds to prevent timeout
      this.keepAliveInterval = setInterval(() => {
        if (this.ws && this.isConnected) {
          try {
            this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
          } catch (err) {
            console.error('[Transcription] Keep-alive error:', err);
          }
        }
      }, 8000);

      this.broadcastStatus('connected');
      onReady?.({ success: true });
    };

    this.ws.onmessage = (event: any) => {
      try {
        const data: TranscriptResult = JSON.parse(
          typeof event.data === 'string' ? event.data : event.data.toString()
        );
        this.handleTranscriptResult(data);
      } catch (err) {
        console.error('[Transcription] Parse error:', err);
      }
    };

    this.ws.onerror = (event: any) => {
      console.error('[Transcription] WebSocket error:', event.message || event);
      this.broadcastStatus('error');
      onReady?.({ success: false, error: 'WebSocket connection failed' });
    };

    this.ws.onclose = (event: any) => {
      console.log(`[Transcription] WebSocket closed: ${event.code} ${event.reason || ''}`);
      this.isConnected = false;
      this.clearKeepAlive();
      this.broadcastStatus('disconnected');

      // Don't resolve here if already resolved via onopen or onerror
    };
  }

  private handleTranscriptResult(data: TranscriptResult): void {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    if (!transcript) return;

    const words = data.channel?.alternatives?.[0]?.words || [];
    const speaker = words[0]?.speaker;
    const isFinal = data.is_final;

    // Build speaker-prefixed text
    let text = transcript;
    if (speaker !== undefined) {
      text = `Speaker ${speaker}: ${transcript}`;
    }

    if (isFinal) {
      // Final result — add to permanent transcript
      this.fullTranscript.push(text);
      this.currentInterim = '';

      this.broadcastTranscript({
        text,
        isFinal: true,
        fullTranscript: this.fullTranscript.join('\n'),
        speaker,
      });
    } else {
      // Interim result — temporary, will be replaced
      this.currentInterim = text;

      this.broadcastTranscript({
        text,
        isFinal: false,
        fullTranscript: this.fullTranscript.join('\n') + (this.currentInterim ? '\n' + this.currentInterim : ''),
        speaker,
      });
    }
  }

  /**
   * Send audio data to Deepgram.
   * Expects raw Int16 PCM buffer.
   */
  sendAudio(buffer: ArrayBuffer): void {
    if (!this.ws || !this.isConnected) return;

    try {
      this.ws.send(Buffer.from(buffer));
    } catch (err) {
      console.error('[Transcription] Send error:', err);
    }
  }

  async stop(): Promise<void> {
    this.clearKeepAlive();

    if (this.ws) {
      try {
        // Send CloseStream message for clean shutdown
        if (this.isConnected) {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
        this.ws.close();
      } catch (err) {
        console.error('[Transcription] Close error:', err);
      }
      this.ws = null;
    }

    this.isConnected = false;
    this.broadcastStatus('disconnected');
    console.log('[Transcription] Stopped');
  }

  getFullTranscript(): string {
    return this.fullTranscript.join('\n');
  }

  clearTranscript(): void {
    this.fullTranscript = [];
    this.currentInterim = '';
  }

  private broadcastTranscript(data: {
    text: string;
    isFinal: boolean;
    fullTranscript: string;
    speaker?: number;
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

  private clearKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}
```

---

**However**, the built-in `WebSocket` in Electron's main process (Node.js) doesn't support custom headers in the constructor. We need the `ws` npm package. So first:

### Terminal Commands (run first):
```bash
npm install ws
npm install -D @types/ws
```

Now update the top of `transcriptionService.ts` to use the `ws` package:

**Replace the WebSocket creation in the `start()` method. The full updated `start()` method:**

Replace the entire `start()` method in `src/main/transcriptionService.ts` with:
```typescript
  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'No Deepgram API key configured' };
    }

    if (this.isConnected) {
      console.log('[Transcription] Already connected');
      return { success: true };
    }

    // Dynamic import ws
    const { default: WebSocketModule } = await import('ws');

    return new Promise((resolve) => {
      try {
        const params = new URLSearchParams({
          model: 'nova-3',
          language: 'en',
          smart_format: 'true',
          interim_results: 'true',
          punctuate: 'true',
          diarize: 'true',
          sample_rate: '16000',
          channels: '1',
          encoding: 'linear16',
          endpointing: '300',
          utterance_end_ms: '1500',
        });

        const url = `${DEEPGRAM_WS_BASE}?${params.toString()}`;

        this.ws = new WebSocketModule(url, {
          headers: {
            Authorization: `Token ${this.apiKey}`,
          },
        }) as any;

        this.setupWebSocket(resolve);
      } catch (err: any) {
        console.error('[Transcription] Failed to connect:', err);
        resolve({ success: false, error: err.message });
      }
    });
  }
```

And add this import at the very top of the file:
```typescript
import type WebSocket from 'ws';
```

And change the class property type:
```typescript
  private ws: WebSocket | null = null;
```

---

### Files to Modify:

**`src/main/audioManager.ts`** — Wire up transcription service. Add the following changes:

At the top, add import:
```typescript
import { TranscriptionService } from './transcriptionService';
```

Add a transcription service instance as a class property:
```typescript
  private transcriptionService: TranscriptionService;
```

In the constructor, initialize it:
```typescript
  constructor() {
    this.transcriptionService = new TranscriptionService();
    this.registerIpcHandlers();
  }
```

Update `setWindows` to also set windows on transcription service:
```typescript
  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard;
    this.overlayWindow = overlay;
    this.transcriptionService.setWindows(dashboard, overlay);
  }
```

Update the `audio:start-recording` handler to start transcription:
```typescript
    ipcMain.handle('audio:start-recording', async (_event, deviceId?: string) => {
      // Get Deepgram API key from settings
      const Store = (await import('electron-store')).default;
      const store = new Store();
      const deepgramKey = store.get('deepgramApiKey', '') as string;
      
      if (deepgramKey) {
        this.transcriptionService.setApiKey(deepgramKey);
        this.transcriptionService.clearTranscript();
        const result = await this.transcriptionService.start();
        if (!result.success) {
          console.error('[AudioManager] Transcription failed to start:', result.error);
        }
      } else {
        console.warn('[AudioManager] No Deepgram API key — transcription disabled');
      }

      this.isRecording = true;
      this.chunkCount = 0;
      this.recordingStartTime = Date.now();
      this.broadcastRecordingState(true);
      console.log('[AudioManager] Recording started', deviceId ? `device: ${deviceId}` : '(default)');
      return { success: true };
    });
```

Update the `audio:stop-recording` handler to stop transcription:
```typescript
    ipcMain.handle('audio:stop-recording', async () => {
      await this.transcriptionService.stop();
      
      this.isRecording = false;
      const duration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0;
      this.recordingStartTime = null;
      this.broadcastRecordingState(false);
      console.log(`[AudioManager] Recording stopped. Chunks received: ${this.chunkCount}, Duration: ${Math.round(duration / 1000)}s`);
      return { success: true, duration };
    });
```

Update the `audio:chunk` handler to forward to Deepgram:
```typescript
    ipcMain.on('audio:chunk', (_event, buffer: ArrayBuffer) => {
      if (!this.isRecording) return;
      this.chunkCount++;
      // Forward audio to Deepgram
      this.transcriptionService.sendAudio(buffer);
    });
```

Add a new IPC handler to get the current transcript:
```typescript
    ipcMain.handle('audio:get-transcript', async () => {
      return this.transcriptionService.getFullTranscript();
    });

    ipcMain.handle('audio:clear-transcript', async () => {
      this.transcriptionService.clearTranscript();
      return { success: true };
    });
```

---

**`src/preload/index.ts`** — Add transcript IPC channels. Add these to the existing `api` object:
```typescript
  // ---- Transcription (add to existing api object) ----
  onTranscriptUpdate: (callback: (data: {
    text: string;
    isFinal: boolean;
    fullTranscript: string;
    speaker?: number;
  }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('transcription:update', handler);
    return () => {
      ipcRenderer.removeListener('transcription:update', handler);
    };
  },

  onTranscriptionStatus: (callback: (data: { status: string }) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('transcription:status', handler);
    return () => {
      ipcRenderer.removeListener('transcription:status', handler);
    };
  },

  getTranscript: () => ipcRenderer.invoke('audio:get-transcript'),
  clearTranscript: () => ipcRenderer.invoke('audio:clear-transcript'),
```

Also update the TypeScript type declarations for `window.raven` to include:
```typescript
  onTranscriptUpdate: (callback: (data: {
    text: string;
    isFinal: boolean;
    fullTranscript: string;
    speaker?: number;
  }) => void) => () => void;
  onTranscriptionStatus: (callback: (data: { status: string }) => void) => () => void;
  getTranscript: () => Promise<string>;
  clearTranscript: () => Promise<{ success: boolean }>;
```

---

**Overlay response panel / content area** (the component that currently shows the empty state with the bird icon and "Start recording and ask for help"):

Replace or update this component to show live transcript text when recording. Here's the pattern:
```tsx
import { useState, useEffect, useRef } from 'react';

// Inside the component:
const [transcript, setTranscript] = useState('');
const [transcriptionStatus, setTranscriptionStatus] = useState('disconnected');
const [isRecording, setIsRecording] = useState(false);
const transcriptEndRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const unsubTranscript = window.raven.onTranscriptUpdate((data) => {
    setTranscript(data.fullTranscript);
  });

  const unsubStatus = window.raven.onTranscriptionStatus((data) => {
    setTranscriptionStatus(data.status);
  });

  const unsubRecording = window.raven.onRecordingStateChanged((state) => {
    setIsRecording(state.isRecording);
    if (!state.isRecording) {
      // Keep transcript visible after stopping
    }
  });

  return () => {
    unsubTranscript();
    unsubStatus();
    unsubRecording();
  };
}, []);

// Auto-scroll to bottom when transcript updates
useEffect(() => {
  transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [transcript]);
```

For the JSX, show transcript when available, empty state when not:
```tsx
{transcript ? (
  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
    {/* Connection status indicator */}
    {isRecording && transcriptionStatus === 'connected' && (
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
        <span className="text-green-400/70 text-xs">Live transcription</span>
      </div>
    )}
    
    {/* Transcript text */}
    <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
      {transcript}
    </div>
    <div ref={transcriptEndRef} />
  </div>
) : (
  /* Existing empty state (bird icon, "Start recording and ask for help" etc.) */
)}
```

Style the transcript area to be scrollable and auto-scroll to the latest text. The transcript panel should take up the main content area of the overlay (the space between the toolbar and the input bar).

---

### Handling electron-store import in main process

If `audioManager.ts` has trouble with `import('electron-store')`, the store instance should be passed in or accessed from a shared settings module. Check your existing code for how settings/store is accessed (likely there's already a settings module or a store instance). Use whatever pattern your codebase already uses for accessing the stored API keys. The key we need is `deepgramApiKey` from electron-store.

If there's already a `getSettings()` or `storeGet()` function used elsewhere in main, use that instead of creating a new Store instance. For example:
```typescript
const deepgramKey = store.get('deepgramApiKey', '') as string;
```

---

### Terminal Commands:
```bash
npm install ws
npm install -D @types/ws
rm -rf dist out
npm run dev
```

### Expected Result:
1. Start recording (click mic in overlay)
2. Terminal shows `[Transcription] Deepgram WebSocket connected`
3. Speak into your microphone
4. **Live text appears in the overlay** — partial words first, then finalized sentences
5. Text auto-scrolls as you speak
6. Green "Live transcription" indicator shows while connected
7. Stop recording — WebSocket closes cleanly
8. Transcript text remains visible after stopping
9. If no Deepgram key is set, terminal shows warning but recording still works (just no transcription)