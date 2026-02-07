/**
 * DualAudioCapture — Production-grade dual-stream audio capture.
 *
 * Captures both microphone (your voice) and system audio (others' voices).
 */

import { MicrophoneCapture, type AudioDevice } from './microphoneCapture'

export type AudioSource = 'mic' | 'system'
export type AudioChunkCallback = (chunk: Int16Array, source: AudioSource) => void
export type { AudioDevice }

export class DualAudioCapture {
  private micCapture: MicrophoneCapture
  private onChunk: AudioChunkCallback | null = null
  private _isRecording = false
  private micChunkCount = 0
  private systemChunkCount = 0
  private systemAudioUnsubscribe: (() => void) | null = null
  private nativeMicUnsubscribe: (() => void) | null = null

  constructor() {
    this.micCapture = new MicrophoneCapture()
  }

  get isRecording(): boolean {
    return this._isRecording
  }

  static async getDevices(): Promise<AudioDevice[]> {
    return MicrophoneCapture.getDevices()
  }

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
    this.micChunkCount = 0
    this.systemChunkCount = 0

    console.log('[DualAudioCapture] Starting capture (sequential)...')
    console.log('[DualAudioCapture] Callback registered:', !!this.onChunk)

    const isMac = navigator.userAgent.includes('Mac')
    let micResult = false
    let systemResult = false

    if (isMac) {
      console.log('[DualAudioCapture] Starting system audio (native helper)...')
      systemResult = await this.startSystemAudio()
      console.log('[DualAudioCapture] System audio result:', systemResult)

      if (systemResult) {
        micResult = this.startNativeMic()
      } else {
        micResult = false
      }
      console.log('[DualAudioCapture] Native mic result:', micResult)
    } else {
      console.log('[DualAudioCapture] Starting microphone...')
      micResult = await this.micCapture.start((chunk) => {
        this.micChunkCount++
        if (this.micChunkCount <= 5 || this.micChunkCount % 100 === 0) {
          console.log(`[DualAudioCapture] Mic callback #${this.micChunkCount}, forwarding...`)
        }
        if (this.onChunk && this._isRecording) {
          this.onChunk(chunk, 'mic')
        }
      }, micDeviceId)
      console.log('[DualAudioCapture] Microphone result:', micResult)

      await new Promise((resolve) => setTimeout(resolve, 300))

      console.log('[DualAudioCapture] Starting system audio (native helper)...')
      systemResult = await this.startSystemAudio()
      console.log('[DualAudioCapture] System audio result:', systemResult)
    }

    console.log(`[DualAudioCapture] Final results — Mic: ${micResult}, System: ${systemResult}`)

    if (!micResult && !systemResult) {
      this._isRecording = false
      console.error('[DualAudioCapture] Both captures failed')
    }

    return { mic: micResult, system: systemResult }
  }

  async stop(): Promise<void> {
    if (!this._isRecording) return

    console.log(
      `[DualAudioCapture] Stopping... Mic chunks: ${this.micChunkCount}, System chunks: ${this.systemChunkCount}`
    )
    this._isRecording = false

    const isMac = navigator.userAgent.includes('Mac')
    if (isMac) {
      this.stopNativeMic()
      await this.stopSystemAudio()
    } else {
      await Promise.all([
        this.micCapture.stop(),
        this.stopSystemAudio()
      ])
    }

    this.onChunk = null
    console.log('[DualAudioCapture] Stopped')
  }

  private async startSystemAudio(): Promise<boolean> {
    try {
      const started = await window.raven.systemAudioStart()
      if (!started) {
        console.warn('[DualAudioCapture] Native system audio failed to start')
        return false
      }

      this.systemAudioUnsubscribe = window.raven.onSystemAudioChunk((chunk) => {
        this.systemChunkCount++
        if (this.systemChunkCount <= 5 || this.systemChunkCount % 100 === 0) {
          const byteLength = chunk.data instanceof ArrayBuffer
            ? chunk.data.byteLength
            : chunk.data.byteLength
          console.log(
            `[DualAudioCapture] System callback #${this.systemChunkCount}, bytes: ${byteLength}`
          )
        }

        const bytes = chunk.data instanceof ArrayBuffer
          ? new Uint8Array(chunk.data)
          : new Uint8Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength)
        const int16 = this.toAlignedInt16(bytes)

        if (this.onChunk && this._isRecording) {
          this.onChunk(int16, 'system')
        }
      })

      console.log('[DualAudioCapture] Native system audio started')
      return true
    } catch (err) {
      console.error('[DualAudioCapture] Native system audio error:', err)
      return false
    }
  }

  private startNativeMic(): boolean {
    try {
      this.nativeMicUnsubscribe = window.raven.onNativeMicChunk((chunk) => {
        this.micChunkCount++
        if (this.micChunkCount <= 5 || this.micChunkCount % 100 === 0) {
          const byteLength = chunk.data instanceof ArrayBuffer
            ? chunk.data.byteLength
            : chunk.data.byteLength
          console.log(
            `[DualAudioCapture] Native mic #${this.micChunkCount}, bytes: ${byteLength}`
          )
        }

        const bytes = chunk.data instanceof ArrayBuffer
          ? new Uint8Array(chunk.data)
          : new Uint8Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength)
        const int16 = this.toAlignedInt16(bytes)

        if (this.onChunk && this._isRecording) {
          this.onChunk(int16, 'mic')
        }
      })

      console.log('[DualAudioCapture] Native mic started')
      return true
    } catch (err) {
      console.error('[DualAudioCapture] Native mic error:', err)
      return false
    }
  }

  private stopNativeMic(): void {
    if (this.nativeMicUnsubscribe) {
      this.nativeMicUnsubscribe()
      this.nativeMicUnsubscribe = null
    }
    console.log('[DualAudioCapture] Native mic stopped')
  }

  private toAlignedInt16(bytes: Uint8Array): Int16Array {
    const alignedLength = bytes.byteLength - (bytes.byteLength % 2)
    const alignedBuffer = new ArrayBuffer(alignedLength)
    new Uint8Array(alignedBuffer).set(bytes.subarray(0, alignedLength))
    return new Int16Array(alignedBuffer)
  }

  private async stopSystemAudio(): Promise<void> {
    if (this.systemAudioUnsubscribe) {
      this.systemAudioUnsubscribe()
      this.systemAudioUnsubscribe = null
    }
    await window.raven.systemAudioStop()
    console.log('[DualAudioCapture] Native system audio stopped')
  }
}
