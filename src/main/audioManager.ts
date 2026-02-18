/**
 * AudioManager — main process coordinator for recording lifecycle.
 * Owns the full pipeline: native capture -> AEC -> Deepgram transcription.
 * The renderer only calls start/stop — all audio plumbing lives here.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { getSetting } from './store'
import { TranscriptionService } from './transcriptionService'
import { sessionManager } from './services/sessionManager'
import { setProcessedAudioCallback, startCapture, stopCapture } from './systemAudioNative'
import { createLogger } from './logger'

const log = createLogger('Audio')

export class AudioManager {
  private isRecording = false
  private dashboardWindow: BrowserWindow | null = null
  private overlayWindow: BrowserWindow | null = null
  private chunkCount = 0
  private recordingStartTime: number | null = null
  private transcriptionService: TranscriptionService

  constructor() {
    this.transcriptionService = new TranscriptionService()
    this.registerIpcHandlers()
    this.setupAudioPipeline()
  }

  /**
   * Wire up the audio pipeline: native capture -> AEC -> Deepgram.
   * processedAudioCallback fires for every AEC-processed chunk.
   */
  private setupAudioPipeline(): void {
    setProcessedAudioCallback((buffer: Buffer, source: 'mic' | 'system') => {
      if (!this.isRecording) return

      this.chunkCount++
      if (this.chunkCount <= 3) {
        log.debug(`AEC-processed chunk from ${source}, size: ${buffer.byteLength}`)
      }
      if (this.chunkCount % 50 === 0) {
        log.debug(`${this.chunkCount} chunks processed (source: ${source})`)
      }

      this.transcriptionService.sendAudio(buffer, source)
    })
    log.info('Audio pipeline configured (native -> AEC -> Deepgram)')
  }

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard
    this.overlayWindow = overlay
    this.transcriptionService.setWindows(dashboard, overlay)
  }

  private registerIpcHandlers(): void {
    ipcMain.handle('audio:start-recording', async (_event, deviceId?: string) => {
      log.info('Starting recording...')
      const deepgramKey = getSetting('deepgramApiKey')

      if (deepgramKey) {
        this.transcriptionService.setApiKey(deepgramKey)
        this.transcriptionService.clearTranscript()
        const result = await this.transcriptionService.start()
        if (!result.success) {
          log.error('Transcription failed to start:', result.error)
        }
      } else {
        log.warn('No Deepgram API key — transcription disabled')
      }

      const captureStarted = startCapture()
      if (!captureStarted) {
        log.warn('Native audio capture failed to start')
      }

      sessionManager.startSession(null)

      this.isRecording = true
      this.chunkCount = 0
      this.recordingStartTime = Date.now()
      this.broadcastRecordingState(true)
      log.info(
        'Recording started',
        deviceId ? `device: ${deviceId}` : '(default)'
      )
      return { success: true }
    })

    ipcMain.handle('audio:stop-recording', async () => {
      stopCapture()
      await this.transcriptionService.stop()

      const session = sessionManager.endSession()
      if (session) {
        log.info('Session saved with', session.transcript.length, 'entries')
      }

      this.transcriptionService.clearTranscript()

      this.isRecording = false
      const duration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0
      this.recordingStartTime = null
      this.broadcastRecordingState(false, session?.id || null)

      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.show()
        this.dashboardWindow.focus()
      }
      log.info(
        `Recording stopped. Chunks: ${this.chunkCount}, Duration: ${Math.round(duration / 1000)}s`
      )
      return { success: true, duration }
    })

    ipcMain.handle('audio:get-state', async () => {
      return {
        isRecording: this.isRecording,
        duration: this.recordingStartTime ? Date.now() - this.recordingStartTime : 0
      }
    })

    ipcMain.handle('audio:get-transcript', async () => {
      return this.transcriptionService.getFullTranscriptWithInterims()
    })

    ipcMain.handle('audio:clear-transcript', async () => {
      this.transcriptionService.clearTranscript()
      return { success: true }
    })

    ipcMain.handle('audio:get-transcript-entries', async () => {
      return this.transcriptionService.getTranscriptEntries()
    })
  }

  private broadcastRecordingState(isRecording: boolean, endedSessionId: string | null = null): void {
    const payload = { isRecording, endedSessionId }

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('audio:recording-state-changed', payload)
      }
    } catch (err) {
      log.error('Failed to send to dashboard:', err)
    }

    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('audio:recording-state-changed', payload)
      }
    } catch (err) {
      log.error('Failed to send to overlay:', err)
    }
  }

  getIsRecording(): boolean {
    return this.isRecording
  }
}
