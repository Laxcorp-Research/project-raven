/**
 * AssemblyAI Transcription Service.
 * Mints temporary tokens from the user's own AssemblyAI key.
 * Creates two RealtimeTranscriber instances: one for mic, one for system audio.
 * Falls back to Deepgram on failure (handled by AudioManager).
 */

import { BrowserWindow } from 'electron'
import { RealtimeTranscriber } from 'assemblyai'
import { createLogger } from '../logger'
import { getApiKey, getSetting } from '../store'
import { sessionManager } from './sessionManager'
import { AUDIO_SAMPLE_RATE, TRANSCRIPT_MERGE_WINDOW_MS } from '../constants'

const log = createLogger('AssemblyAI')

const MAX_RECONNECT_ATTEMPTS = 5
const TOKEN_REFRESH_BUFFER_MS = 60_000
const MAX_TRANSCRIPT_ENTRIES = 5000

type AudioSource = 'mic' | 'system'

interface TranscriptEntry {
  id: string
  source: AudioSource
  text: string
  speaker: 'you' | 'them'
  timestamp: number
  isFinal: boolean
}

interface TranscriberState {
  transcriber: RealtimeTranscriber | null
  isConnected: boolean
  currentInterim: string
  reconnectAttempts: number
  reconnecting: boolean
}

const ASSEMBLYAI_TOKEN_TTL = 480

async function fetchTranscriptionToken(): Promise<{ token: string; expiresIn: number } | null> {
  const apiKey = getApiKey('assemblyaiApiKey')
  if (!apiKey) {
    log.warn('No AssemblyAI API key in store')
    return null
  }
  try {
    const { AssemblyAI } = await import('assemblyai')
    const client = new AssemblyAI({ apiKey })
    const token = await client.realtime.createTemporaryToken({
      expires_in: ASSEMBLYAI_TOKEN_TTL,
    })
    return { token, expiresIn: ASSEMBLYAI_TOKEN_TTL }
  } catch (err) {
    log.error('Failed to create AssemblyAI transcription token:', err)
    return null
  }
}

export class AssemblyAITranscriptionService {
  private micState: TranscriberState = { transcriber: null, isConnected: false, currentInterim: '', reconnectAttempts: 0, reconnecting: false }
  private systemState: TranscriberState = { transcriber: null, isConnected: false, currentInterim: '', reconnectAttempts: 0, reconnecting: false }
  private overlayWindow: BrowserWindow | null = null
  private dashboardWindow: BrowserWindow | null = null
  private transcriptEntries: TranscriptEntry[] = []
  private isActive = false
  private tokenExpiresAt = 0
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private onFallback: (() => Promise<void>) | null = null

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard
    this.overlayWindow = overlay
  }

  setFallbackHandler(handler: () => Promise<void>): void {
    this.onFallback = handler
  }

  async start(): Promise<{ success: boolean; error?: string; fallback?: boolean }> {
    const tokenResult = await fetchTranscriptionToken()
    if (!tokenResult) {
      log.warn('No AssemblyAI token - triggering fallback')
      return { success: false, fallback: true, error: 'Could not create transcription session' }
    }

    log.info('Starting AssemblyAI transcription...')
    this.isActive = true
    this.tokenExpiresAt = Date.now() + (tokenResult.expiresIn * 1000)
    this.scheduleTokenRefresh(tokenResult.expiresIn)

    // Temporary tokens are minted from the user's AssemblyAI key.
    // Speech-model selection for the Recall path lives in
    // transcriptProviderRouting; this native-capture path uses
    // AssemblyAI's default streaming model for the token session.
    const [micResult, systemResult] = await Promise.all([
      this.startTranscriber('mic', tokenResult.token),
      this.startTranscriber('system', tokenResult.token),
    ])

    if (!micResult.success && !systemResult.success) {
      this.isActive = false
      log.error('Both AssemblyAI connections failed - triggering fallback')
      return { success: false, fallback: true, error: 'Failed to connect to AssemblyAI' }
    }

    log.info(`AssemblyAI started - Mic: ${micResult.success}, System: ${systemResult.success}`)
    return { success: true }
  }

  private async startTranscriber(
    source: AudioSource,
    token: string,
  ): Promise<{ success: boolean }> {
    const state = source === 'mic' ? this.micState : this.systemState

    try {
      // Each token is one-time use, but for the dual-stream setup we need
      // separate tokens. The first call uses the provided token; for the
      // second stream, we fetch a new one.
      let actualToken = token
      if (source === 'system') {
        const secondToken = await fetchTranscriptionToken()
        if (secondToken) {
          actualToken = secondToken.token
        } else {
          log.warn('Could not get second token for system audio')
          return { success: false }
        }
      }

      state.transcriber = new RealtimeTranscriber({
        token: actualToken,
        sampleRate: AUDIO_SAMPLE_RATE,
        encoding: 'pcm_s16le',
        endUtteranceSilenceThreshold: 500,
      })

      state.transcriber.on('transcript', (transcript) => {
        if (transcript.message_type === 'FinalTranscript' && transcript.text) {
          this.handleFinalTranscript(transcript.text, source)
        } else if (transcript.message_type === 'PartialTranscript' && transcript.text) {
          this.handlePartialTranscript(transcript.text, source)
        }
      })

      state.transcriber.on('error', (err) => {
        log.error(`[${source.toUpperCase()}] AssemblyAI error:`, err)
        if (this.isActive) {
          this.handleDisconnect(source)
        }
      })

      state.transcriber.on('close', (_code: number, _reason: string) => {
        log.warn(`[${source.toUpperCase()}] AssemblyAI closed`)
        state.isConnected = false
        if (this.isActive) {
          this.handleDisconnect(source)
        }
      })

      await state.transcriber.connect()
      state.isConnected = true
      state.reconnectAttempts = 0
      this.broadcastStatus(`${source}-connected`)
      log.info(`[${source.toUpperCase()}] AssemblyAI connected`)
      return { success: true }
    } catch (err) {
      log.error(`[${source.toUpperCase()}] AssemblyAI connect failed:`, err)
      return { success: false }
    }
  }

  private async handleDisconnect(source: AudioSource): Promise<void> {
    const state = source === 'mic' ? this.micState : this.systemState

    // Guard: both 'error' and 'close' can fire for the same disconnection
    if (state.reconnecting) return
    state.reconnecting = true

    state.isConnected = false
    state.reconnectAttempts++

    if (state.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      log.error(`[${source.toUpperCase()}] Exceeded reconnect attempts, triggering fallback`)
      state.reconnecting = false
      if (this.onFallback) {
        await this.stop()
        await this.onFallback()
      }
      return
    }

    log.info(`[${source.toUpperCase()}] Reconnecting (attempt ${state.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`)
    const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts - 1), 10000)
    await new Promise(r => setTimeout(r, delay))

    if (!this.isActive) {
      state.reconnecting = false
      return
    }

    const tokenResult = await fetchTranscriptionToken()
    if (!tokenResult) {
      log.error('Cannot get token for reconnect - triggering fallback')
      state.reconnecting = false
      if (this.onFallback) {
        await this.stop()
        await this.onFallback()
      }
      return
    }

    const result = await this.startTranscriber(source, tokenResult.token)
    state.reconnecting = false
    if (result.success) {
      log.info(`[${source.toUpperCase()}] Reconnected successfully`)
    }
  }

  private scheduleTokenRefresh(expiresInSeconds: number): void {
    if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer)

    const refreshIn = Math.max(0, (expiresInSeconds * 1000) - TOKEN_REFRESH_BUFFER_MS)
    this.tokenRefreshTimer = setTimeout(async () => {
      if (!this.isActive) return
      log.info('Refreshing AssemblyAI transcription session (token expiring)...')

      // Close existing connections and reconnect with new tokens
      await this.closeTranscriber(this.micState)
      await this.closeTranscriber(this.systemState)

      const tokenResult = await fetchTranscriptionToken()
      if (!tokenResult) {
        log.error('Token refresh failed - triggering fallback')
        if (this.onFallback) {
          this.isActive = false
          await this.onFallback()
        }
        return
      }

      this.tokenExpiresAt = Date.now() + (tokenResult.expiresIn * 1000)
      this.scheduleTokenRefresh(tokenResult.expiresIn)

      await Promise.all([
        this.startTranscriber('mic', tokenResult.token),
        this.startTranscriber('system', tokenResult.token),
      ])
    }, refreshIn)
  }

  sendAudio(buffer: Buffer | ArrayBuffer, source: AudioSource): void {
    const state = source === 'mic' ? this.micState : this.systemState
    if (!state.transcriber || !state.isConnected) return

    try {
      // assemblyai's StreamingTranscriber.sendAudio is typed as
      // ArrayBufferLike (ArrayBuffer | SharedArrayBuffer). Buffer is a
      // Uint8Array view, not ArrayBufferLike, so hand the SDK a tight
      // ArrayBuffer slice. The .slice(byteOffset, byteOffset+byteLength)
      // avoids sending pooled bytes outside this Buffer's logical view,
      // which can happen with Buffer.allocUnsafe / Buffer.from(arrayBuffer).
      const audio: ArrayBuffer = Buffer.isBuffer(buffer)
        ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
        : buffer
      state.transcriber.sendAudio(audio)
    } catch (err) {
      log.error(`[${source.toUpperCase()}] Send error:`, err)
    }
  }

  async stop(): Promise<void> {
    this.isActive = false
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer)
      this.tokenRefreshTimer = null
    }
    await Promise.all([
      this.closeTranscriber(this.micState),
      this.closeTranscriber(this.systemState),
    ])
    this.micState.reconnectAttempts = 0
    this.systemState.reconnectAttempts = 0
    log.info('AssemblyAI transcription stopped')
  }

  private async closeTranscriber(state: TranscriberState): Promise<void> {
    if (state.transcriber) {
      try {
        await state.transcriber.close()
      } catch (err) {
        log.error('Close error:', err)
      }
      state.transcriber = null
    }
    state.isConnected = false
    state.currentInterim = ''
  }

  private handleFinalTranscript(text: string, source: AudioSource): void {
    const speaker: 'you' | 'them' = source === 'mic' ? 'you' : 'them'
    const now = Date.now()
    const state = source === 'mic' ? this.micState : this.systemState

    const lastEntry = this.transcriptEntries[this.transcriptEntries.length - 1]
    const shouldMerge = lastEntry
      && lastEntry.speaker === speaker
      && (now - lastEntry.timestamp) < TRANSCRIPT_MERGE_WINDOW_MS

    if (shouldMerge && lastEntry) {
      lastEntry.text = `${lastEntry.text} ${text}`
      lastEntry.timestamp = now
    } else {
      if (this.transcriptEntries.length >= MAX_TRANSCRIPT_ENTRIES) {
        this.transcriptEntries = this.transcriptEntries.slice(-Math.floor(MAX_TRANSCRIPT_ENTRIES * 0.8))
      }
      this.transcriptEntries.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source,
        text,
        speaker,
        timestamp: now,
        isFinal: true,
      })
    }

    state.currentInterim = ''

    const latestEntry = this.transcriptEntries[this.transcriptEntries.length - 1]
    sessionManager.addTranscriptEntry({
      id: latestEntry.id,
      source: latestEntry.source,
      text: latestEntry.text,
      timestamp: latestEntry.timestamp,
      isFinal: true,
    })

    this.broadcastTranscript({
      entry: latestEntry,
      isFinal: true,
      fullTranscript: this.getFullTranscriptText(),
    })
  }

  private handlePartialTranscript(text: string, source: AudioSource): void {
    const speaker: 'you' | 'them' = source === 'mic' ? 'you' : 'them'
    const state = source === 'mic' ? this.micState : this.systemState
    state.currentInterim = text

    sessionManager.addTranscriptEntry({
      id: `interim-${source}`,
      source,
      text,
      timestamp: Date.now(),
      isFinal: false,
    })

    this.broadcastTranscript({
      entry: {
        id: `interim-${source}`,
        source,
        text,
        speaker,
        timestamp: Date.now(),
        isFinal: false,
      },
      isFinal: false,
      fullTranscript: this.getFullTranscriptText(),
      interims: {
        mic: this.micState.currentInterim,
        system: this.systemState.currentInterim,
      },
    })
  }

  getFullTranscript(): string {
    return this.getFullTranscriptText()
  }

  getFullTranscriptWithInterims(): string {
    let text = this.getFullTranscriptText()
    const displayName = (getSetting('displayName') as string) || 'You'

    if (this.systemState.currentInterim) {
      text += `\nThem (still speaking): ${this.systemState.currentInterim}`
    }
    if (this.micState.currentInterim) {
      text += `\n${displayName} (still speaking): ${this.micState.currentInterim}`
    }

    return text
  }

  getTranscriptEntries(): TranscriptEntry[] {
    return this.transcriptEntries
  }

  getTranscriptBySource(source: 'mic' | 'system' | 'all'): string {
    const displayName = (getSetting('displayName') as string) || 'You'
    const filtered = source === 'all'
      ? this.transcriptEntries
      : this.transcriptEntries.filter(e => e.source === source)
    return filtered
      .map(e => `${e.speaker === 'you' ? displayName : 'Them'}: ${e.text}`)
      .join('\n')
  }

  clearTranscript(): void {
    this.transcriptEntries = []
    this.micState.currentInterim = ''
    this.systemState.currentInterim = ''
  }

  private getFullTranscriptText(): string {
    const displayName = (getSetting('displayName') as string) || 'You'
    return this.transcriptEntries
      .map(e => `${e.speaker === 'you' ? displayName : 'Them'}: ${e.text}`)
      .join('\n')
  }

  private broadcastTranscript(data: {
    entry: TranscriptEntry
    isFinal: boolean
    fullTranscript: string
    interims?: { mic: string; system: string }
  }): void {
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcription:update', data)
      }
    } catch (err) {
      log.error('Broadcast to overlay failed:', err)
    }

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('transcription:update', data)
      }
    } catch (err) {
      log.error('Broadcast to dashboard failed:', err)
    }
  }

  private broadcastStatus(status: string): void {
    const payload = { status }
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcription:status', payload)
      }
    } catch { /* ignore */ }
    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('transcription:status', payload)
      }
    } catch { /* ignore */ }
  }
}
