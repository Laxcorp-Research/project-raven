/**
 * DualAudioCapture — Production-grade dual-stream audio capture.
 *
 * Captures both microphone (your voice) and system audio (others' voices).
 */

import { createLogger } from '../lib/logger'
import { MicrophoneCapture, type AudioDevice } from './microphoneCapture'

const log = createLogger('DualAudioCapture')

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
      log.warn('Already recording')
      return { mic: false, system: false }
    }

    this.onChunk = onChunk
    this._isRecording = true
    this.micChunkCount = 0
    this.systemChunkCount = 0

    log.log('Starting capture (sequential)...')
    log.log('Callback registered:', !!this.onChunk)

    const isMac = navigator.userAgent.includes('Mac')
    let micResult = false
    let systemResult = false

    if (isMac) {
      log.log('Starting system audio (native helper)...')
      systemResult = await this.startSystemAudio()
      log.log('System audio result:', systemResult)

      if (systemResult) {
        micResult = this.startNativeMic()
      } else {
        micResult = false
      }
      log.log('Native mic result:', micResult)
    } else {
      log.log('Starting microphone...')
      micResult = await this.micCapture.start((chunk) => {
        this.micChunkCount++
        if (this.micChunkCount <= 5 || this.micChunkCount % 100 === 0) {
          log.log(`Mic callback #${this.micChunkCount}, forwarding...`)
        }
        if (this.onChunk && this._isRecording) {
          this.onChunk(chunk, 'mic')
        }
      }, micDeviceId)
      log.log('Microphone result:', micResult)

      await new Promise((resolve) => setTimeout(resolve, 300))

      log.log('Starting system audio (native helper)...')
      systemResult = await this.startSystemAudio()
      log.log('System audio result:', systemResult)
    }

    log.log(`Final results — Mic: ${micResult}, System: ${systemResult}`)

    if (!micResult && !systemResult) {
      this._isRecording = false
      log.error('Both captures failed')
    }

    return { mic: micResult, system: systemResult }
  }

  async stop(): Promise<void> {
    if (!this._isRecording) return

    log.log(
      `Stopping... Mic chunks: ${this.micChunkCount}, System chunks: ${this.systemChunkCount}`
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
    log.log('Stopped')
  }

  private async startSystemAudio(): Promise<boolean> {
    try {
      const started = await window.raven.systemAudioStart()
      if (!started) {
        log.warn('Native system audio failed to start')
        return false
      }

      this.systemAudioUnsubscribe = window.raven.onSystemAudioChunk((chunk) => {
        this.systemChunkCount++
        if (this.systemChunkCount <= 5 || this.systemChunkCount % 100 === 0) {
          const byteLength = chunk.data instanceof ArrayBuffer
            ? chunk.data.byteLength
            : chunk.data.byteLength
          log.log(
            `System callback #${this.systemChunkCount}, bytes: ${byteLength}`
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

      log.log('Native system audio started')
      return true
    } catch (err) {
      log.error('Native system audio error:', err)
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
          log.log(
            `Native mic #${this.micChunkCount}, bytes: ${byteLength}`
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

      log.log('Native mic started')
      return true
    } catch (err) {
      log.error('Native mic error:', err)
      return false
    }
  }

  private stopNativeMic(): void {
    if (this.nativeMicUnsubscribe) {
      this.nativeMicUnsubscribe()
      this.nativeMicUnsubscribe = null
    }
    log.log('Native mic stopped')
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
    log.log('Native system audio stopped')
  }
}
