/**
 * TranscriptionService — main process.
 * Opens a WebSocket to Deepgram, streams audio chunks, receives transcript events.
 * Emits transcript updates to the overlay window.
 */

import type WebSocket from 'ws'
import { BrowserWindow } from 'electron'

// Deepgram WebSocket URL
const DEEPGRAM_WS_BASE = 'wss://api.deepgram.com/v1/listen'

interface TranscriptWord {
  word: string
  start: number
  end: number
  speaker?: number
  confidence: number
}

interface TranscriptAlternative {
  transcript: string
  confidence: number
  words: TranscriptWord[]
}

interface TranscriptResult {
  is_final: boolean
  speech_final: boolean
  channel: {
    alternatives: TranscriptAlternative[]
  }
  from_finalize?: boolean
}

export class TranscriptionService {
  private ws: WebSocket | null = null
  private overlayWindow: BrowserWindow | null = null
  private dashboardWindow: BrowserWindow | null = null
  private apiKey = ''
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 3
  private keepAliveInterval: NodeJS.Timeout | null = null
  private fullTranscript: string[] = []
  private currentInterim = ''

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard
    this.overlayWindow = overlay
  }

  setApiKey(key: string): void {
    this.apiKey = key
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: 'No Deepgram API key configured' }
    }

    if (this.isConnected) {
      console.log('[Transcription] Already connected')
      return { success: true }
    }

    return new Promise((resolve) => {
      try {
        const loadWebSocket = async () => {
          const { default: WebSocketModule } = await import('ws')
          return WebSocketModule
        }

        const params = new URLSearchParams({
          model: 'nova-3',
          language: 'multi',
          smart_format: 'true',
          interim_results: 'true',
          punctuate: 'true',
          diarize: 'true',
          sample_rate: '16000',
          channels: '1',
          encoding: 'linear16',
          endpointing: '300',
          utterance_end_ms: '1500'
        })

        const url = `${DEEPGRAM_WS_BASE}?${params.toString()}`

        void loadWebSocket()
          .then((WebSocketModule) => {
            this.ws = new WebSocketModule(url, {
              headers: {
                Authorization: `Token ${this.apiKey}`
              }
            }) as unknown as WebSocket

            this.setupWebSocket(resolve)
          })
          .catch((err) => {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('[Transcription] Failed to connect:', err)
            resolve({ success: false, error: message })
          })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[Transcription] Failed to connect:', err)
        resolve({ success: false, error: message })
      }
    })
  }

  private setupWebSocket(onReady?: (result: { success: boolean; error?: string }) => void): void {
    if (!this.ws) return

    this.ws.onopen = () => {
      console.log('[Transcription] Deepgram WebSocket connected')
      this.isConnected = true
      this.reconnectAttempts = 0

      // Send keep-alive every 8 seconds to prevent timeout
      this.keepAliveInterval = setInterval(() => {
        if (this.ws && this.isConnected) {
          try {
            this.ws.send(JSON.stringify({ type: 'KeepAlive' }))
          } catch (err) {
            console.error('[Transcription] Keep-alive error:', err)
          }
        }
      }, 8000)

      this.broadcastStatus('connected')
      onReady?.({ success: true })
    }

    this.ws.onmessage = (event: { data: unknown }) => {
      try {
        const data: TranscriptResult = JSON.parse(
          typeof event.data === 'string' ? event.data : Buffer.from(event.data as ArrayBuffer).toString()
        )
        this.handleTranscriptResult(data)
      } catch (err) {
        console.error('[Transcription] Parse error:', err)
      }
    }

    this.ws.onerror = (event: { message?: string }) => {
      console.error('[Transcription] WebSocket error:', event.message || event)
      this.broadcastStatus('error')
      onReady?.({ success: false, error: 'WebSocket connection failed' })
    }

    this.ws.onclose = (event: { code: number; reason?: string }) => {
      console.log(`[Transcription] WebSocket closed: ${event.code} ${event.reason || ''}`)
      this.isConnected = false
      this.clearKeepAlive()
      this.broadcastStatus('disconnected')

      // Don't resolve here if already resolved via onopen or onerror
    }
  }

  private handleTranscriptResult(data: TranscriptResult): void {
    const transcript = data.channel?.alternatives?.[0]?.transcript
    if (!transcript) return

    const words = data.channel?.alternatives?.[0]?.words || []
    const speaker = words[0]?.speaker
    const isFinal = data.is_final

    // Build speaker-prefixed text
    let text = transcript
    if (speaker !== undefined) {
      text = `Speaker ${speaker}: ${transcript}`
    }

    if (isFinal) {
      // Final result — add to permanent transcript
      this.fullTranscript.push(text)
      this.currentInterim = ''

      this.broadcastTranscript({
        text,
        isFinal: true,
        fullTranscript: this.fullTranscript.join('\n'),
        speaker
      })
    } else {
      // Interim result — temporary, will be replaced
      this.currentInterim = text

      this.broadcastTranscript({
        text,
        isFinal: false,
        fullTranscript: this.fullTranscript.join('\n') + (this.currentInterim ? '\n' + this.currentInterim : ''),
        speaker
      })
    }
  }

  /**
   * Send audio data to Deepgram.
   * Expects raw Int16 PCM buffer.
   */
  sendAudio(buffer: ArrayBuffer): void {
    if (!this.ws || !this.isConnected) return

    try {
      this.ws.send(Buffer.from(buffer))
    } catch (err) {
      console.error('[Transcription] Send error:', err)
    }
  }

  async stop(): Promise<void> {
    this.clearKeepAlive()

    if (this.ws) {
      try {
        // Send CloseStream message for clean shutdown
        if (this.isConnected) {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }))
        }
        this.ws.close()
      } catch (err) {
        console.error('[Transcription] Close error:', err)
      }
      this.ws = null
    }

    this.isConnected = false
    this.broadcastStatus('disconnected')
    console.log('[Transcription] Stopped')
  }

  getFullTranscript(): string {
    return this.fullTranscript.join('\n')
  }

  clearTranscript(): void {
    this.fullTranscript = []
    this.currentInterim = ''
  }

  private broadcastTranscript(data: {
    text: string
    isFinal: boolean
    fullTranscript: string
    speaker?: number
  }): void {
    const payload = data

    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcription:update', payload)
      }
    } catch (err) {
      console.error('[Transcription] Broadcast to overlay failed:', err)
    }

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('transcription:update', payload)
      }
    } catch (err) {
      console.error('[Transcription] Broadcast to dashboard failed:', err)
    }
  }

  private broadcastStatus(status: string): void {
    const payload = { status }

    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcription:status', payload)
      }
    } catch (err) {
      console.error('[Transcription] Broadcast status to overlay failed:', err)
    }

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('transcription:status', payload)
      }
    } catch (err) {
      console.error('[Transcription] Broadcast status to dashboard failed:', err)
    }
  }

  private clearKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
  }
}
