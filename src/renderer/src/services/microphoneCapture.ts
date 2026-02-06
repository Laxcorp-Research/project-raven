/**
 * Production-grade microphone capture using AudioWorkletNode.
 * Captures audio in a separate thread, converts to 16kHz mono Int16.
 */

import { getWorkletUrl } from './worklet'

export type MicChunkCallback = (chunk: Int16Array) => void

export interface AudioDevice {
  deviceId: string
  label: string
}

export class MicrophoneCapture {
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private onChunk: MicChunkCallback | null = null
  private _isRecording = false
  private chunkCount = 0

  get isRecording(): boolean {
    return this._isRecording
  }

  /**
   * List available microphone devices.
   */
  static async getDevices(): Promise<AudioDevice[]> {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      tempStream.getTracks().forEach((t) => t.stop())

      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone (${d.deviceId.slice(0, 6)})`
        }))
    } catch (err) {
      console.error('[MicrophoneCapture] Failed to enumerate devices:', err)
      return []
    }
  }

  /**
   * Start capturing microphone audio.
   */
  async start(onChunk: MicChunkCallback, deviceId?: string): Promise<boolean> {
    if (this._isRecording) {
      console.warn('[MicrophoneCapture] Already recording')
      return true
    }

    this.onChunk = onChunk
    this.chunkCount = 0

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      }

      console.log('[MicrophoneCapture] Requesting microphone access...')
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      console.log('[MicrophoneCapture] Microphone access granted')

      this.audioContext = new AudioContext({ sampleRate: 16000 })

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }
      console.log('[MicrophoneCapture] AudioContext state:', this.audioContext.state)

      const workletUrl = getWorkletUrl()
      console.log('[MicrophoneCapture] Loading AudioWorklet from blob URL')
      await this.audioContext.audioWorklet.addModule(workletUrl)
      console.log('[MicrophoneCapture] AudioWorklet module loaded')

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor')

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audio' && this._isRecording && this.onChunk) {
          const float32 = event.data.buffer as Float32Array
          const int16 = this.float32ToInt16(float32)

          this.chunkCount++
          if (this.chunkCount <= 5 || this.chunkCount % 100 === 0) {
            console.log(`[MicrophoneCapture] Chunk #${this.chunkCount}, size: ${int16.length}`)
          }

          this.onChunk(int16)
        }
      }

      this.sourceNode.connect(this.workletNode)
      this.workletNode.connect(this.audioContext.destination)

      this._isRecording = true
      console.log('[MicrophoneCapture] Started successfully')
      return true
    } catch (err: unknown) {
      console.error('[MicrophoneCapture] Failed to start:', err)
      await this.cleanup()

      const errObj = err as { name?: string }
      if (errObj.name === 'NotAllowedError') {
        console.error('[MicrophoneCapture] Microphone permission denied')
      }
      return false
    }
  }

  /**
   * Stop capturing.
   */
  async stop(): Promise<void> {
    if (!this._isRecording) return

    console.log(`[MicrophoneCapture] Stopping... Total chunks: ${this.chunkCount}`)
    this._isRecording = false

    if (this.workletNode) {
      this.workletNode.port.postMessage({ command: 'stop' })
    }

    await this.cleanup()
    console.log('[MicrophoneCapture] Stopped')
  }

  private async cleanup(): Promise<void> {
    try {
      this.workletNode?.disconnect()
      this.sourceNode?.disconnect()
      await this.audioContext?.close()
      this.stream?.getTracks().forEach((track) => track.stop())
    } catch (err) {
      console.error('[MicrophoneCapture] Cleanup error:', err)
    }

    this.workletNode = null
    this.sourceNode = null
    this.audioContext = null
    this.stream = null
    this.onChunk = null
  }

  /**
   * Convert Float32 audio samples to Int16 for Deepgram.
   */
  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return int16
  }
}
