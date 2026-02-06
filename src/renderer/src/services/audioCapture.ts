/**
 * DualAudioCapture — Production-grade audio capture.
 *
 * Microphone: AudioWorkletNode (production-grade)
 * System Audio: Native ScreenCaptureKit (to be implemented)
 *
 * Gracefully degrades to mic-only if system audio unavailable.
 */

import { MicrophoneCapture, type AudioDevice } from './microphoneCapture'
import { SystemAudioCapture } from './systemAudioCapture'

export type AudioSource = 'mic' | 'system'
export type AudioChunkCallback = (chunk: Int16Array, source: AudioSource) => void
export type { AudioDevice }

export class DualAudioCapture {
  private micCapture: MicrophoneCapture
  private systemCapture: SystemAudioCapture
  private onChunk: AudioChunkCallback | null = null
  private _isRecording = false

  constructor() {
    this.micCapture = new MicrophoneCapture()
    this.systemCapture = new SystemAudioCapture()
  }

  get isRecording(): boolean {
    return this._isRecording
  }

  /**
   * List available microphone devices.
   */
  static async getDevices(): Promise<AudioDevice[]> {
    return MicrophoneCapture.getDevices()
  }

  /**
   * Start capturing audio from both sources.
   */
  async start(
    onChunk: AudioChunkCallback,
    micDeviceId?: string
  ): Promise<{ mic: boolean; system: boolean }> {
    if (this._isRecording) {
      console.warn('[DualAudioCapture] Already recording')
      return { mic: false, system: false }
    }

    this.onChunk = onChunk
    this._isRecording = true

    console.log('[DualAudioCapture] Starting capture...')

    const [micResult, systemResult] = await Promise.all([
      this.micCapture.start((chunk) => {
        if (this.onChunk) this.onChunk(chunk, 'mic')
      }, micDeviceId),
      this.systemCapture.start((chunk) => {
        if (this.onChunk) this.onChunk(chunk, 'system')
      })
    ])

    console.log(`[DualAudioCapture] Results — Mic: ${micResult}, System: ${systemResult}`)

    if (!micResult && !systemResult) {
      this._isRecording = false
      console.error('[DualAudioCapture] Both captures failed')
    }

    return { mic: micResult, system: systemResult }
  }

  /**
   * Stop all captures.
   */
  async stop(): Promise<void> {
    if (!this._isRecording) return

    console.log('[DualAudioCapture] Stopping...')
    this._isRecording = false

    await Promise.all([
      this.micCapture.stop(),
      this.systemCapture.stop()
    ])

    this.onChunk = null
    console.log('[DualAudioCapture] Stopped')
  }
}
