/**
 * AudioManager — main process coordinator.
 * Receives audio chunks from the overlay renderer via IPC.
 * Tracks recording state. Broadcasts state to all windows.
 * In Phase B2, this will forward chunks to Deepgram.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { getSetting } from './store'
import { TranscriptionService } from './transcriptionService'
import { sessionManager } from './services/sessionManager'

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
  }

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard
    this.overlayWindow = overlay
    this.transcriptionService.setWindows(dashboard, overlay)
  }

  private registerIpcHandlers(): void {
    // Recording state management
    ipcMain.handle('audio:start-recording', async (_event, deviceId?: string) => {
      console.log('[AudioManager] Starting recording...')
      const deepgramKey = getSetting('deepgramApiKey')

      if (deepgramKey) {
        this.transcriptionService.setApiKey(deepgramKey)
        this.transcriptionService.clearTranscript()
        console.log('[AudioManager] Starting transcription service...')
        const result = await this.transcriptionService.start()
        console.log('[AudioManager] Transcription service result:', result)
        if (!result.success) {
          console.error('[AudioManager] Transcription failed to start:', result.error)
        }
      } else {
        console.warn('[AudioManager] No Deepgram API key — transcription disabled')
      }

      // Start a new session
      sessionManager.startSession(null)

      this.isRecording = true
      this.chunkCount = 0
      this.recordingStartTime = Date.now()
      this.broadcastRecordingState(true)
      console.log(
        '[AudioManager] Recording started',
        deviceId ? `device: ${deviceId}` : '(default)'
      )
      return { success: true }
    })

    ipcMain.handle('audio:stop-recording', async () => {
      await this.transcriptionService.stop()

      // End the session
      const session = sessionManager.endSession()
      if (session) {
        console.log('[AudioManager] Session saved with', session.transcript.length, 'entries')
      }

      this.isRecording = false
      const duration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0
      this.recordingStartTime = null
      this.broadcastRecordingState(false)
      console.log(
        `[AudioManager] Recording stopped. Chunks received: ${this.chunkCount}, Duration: ${Math.round(
          duration / 1000
        )}s`
      )
      return { success: true, duration }
    })

    // Receive audio chunks from overlay renderer (now with source tag)
    ipcMain.on('audio:chunk', (_event, buffer: ArrayBuffer, source: 'mic' | 'system') => {
      if (!this.isRecording) return
      this.chunkCount++

      if (this.chunkCount <= 3) {
        console.log(
          `[AudioManager] Received chunk from ${source}, size: ${buffer.byteLength}`
        )
      }

      if (this.chunkCount % 50 === 0) {
        console.log(
          `[AudioManager] Received ${this.chunkCount} chunks (source: ${source}, size: ${buffer.byteLength})`
        )
      }

      this.transcriptionService.sendAudio(buffer, source)
    })

    ipcMain.handle('audio:get-state', async () => {
      return {
        isRecording: this.isRecording,
        duration: this.recordingStartTime ? Date.now() - this.recordingStartTime : 0
      }
    })

    ipcMain.handle('audio:get-transcript', async () => {
      return this.transcriptionService.getFullTranscript()
    })

    ipcMain.handle('audio:clear-transcript', async () => {
      this.transcriptionService.clearTranscript()
      return { success: true }
    })

    ipcMain.handle('audio:get-transcript-entries', async () => {
      return this.transcriptionService.getTranscriptEntries()
    })
  }

  private broadcastRecordingState(isRecording: boolean): void {
    const payload = { isRecording }

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('audio:recording-state-changed', payload)
      }
    } catch (err) {
      console.error('[AudioManager] Failed to send to dashboard:', err)
    }

    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('audio:recording-state-changed', payload)
      }
    } catch (err) {
      console.error('[AudioManager] Failed to send to overlay:', err)
    }
  }

  getIsRecording(): boolean {
    return this.isRecording
  }
}
