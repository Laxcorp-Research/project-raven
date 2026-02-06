/**
 * Production-grade microphone capture using AudioWorkletNode.
 * Uses shared AudioContext and downsamples to 16kHz for Deepgram.
 */

import { getWorkletUrl } from './worklet'
import { getSharedAudioContext, releaseSharedAudioContext } from './sharedAudioContext'

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
  private heartbeatCount = 0
  private workletLoaded = false

  get isRecording(): boolean {
    return this._isRecording
  }

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

  async start(onChunk: MicChunkCallback, deviceId?: string): Promise<boolean> {
    if (this._isRecording) {
      console.warn('[MicrophoneCapture] Already recording')
      return true
    }

    this.onChunk = onChunk
    this.chunkCount = 0
    this.heartbeatCount = 0

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      }

      console.log('[MicrophoneCapture] Requesting microphone access...')
      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      console.log('[MicrophoneCapture] Microphone access granted')

      const audioTrack = this.stream.getAudioTracks()[0]
      const settings = audioTrack.getSettings()
      console.log('[MicrophoneCapture] Track settings:', settings)

      this.audioContext = await getSharedAudioContext()
      console.log('[MicrophoneCapture] Using shared AudioContext, sampleRate:', this.audioContext.sampleRate)

      if (!this.workletLoaded) {
        const workletUrl = getWorkletUrl('mic-capture-processor')
        console.log('[MicrophoneCapture] Loading AudioWorklet...')
        try {
          await this.audioContext.audioWorklet.addModule(workletUrl)
          this.workletLoaded = true
          console.log('[MicrophoneCapture] AudioWorklet module loaded')
        } catch (err) {
          const errObj = err as { name?: string; message?: string }
          if (
            errObj.name === 'InvalidStateError' ||
            errObj.message?.includes('already been added')
          ) {
            this.workletLoaded = true
            console.log('[MicrophoneCapture] AudioWorklet module already loaded')
          } else {
            throw err
          }
        }
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.workletNode = new AudioWorkletNode(this.audioContext, 'mic-capture-processor')

      const nativeSampleRate = this.audioContext.sampleRate

      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'init') {
          console.log('[MicrophoneCapture] Worklet:', event.data.message)
        } else if (event.data.type === 'heartbeat') {
          this.heartbeatCount++
          if (this.heartbeatCount <= 3 || this.heartbeatCount % 10 === 0) {
            console.log(
              `[MicrophoneCapture] Heartbeat #${this.heartbeatCount}, frames: ${event.data.frames}`
            )
          }
        } else if (event.data.type === 'audio' && this._isRecording && this.onChunk) {
          const float32 = event.data.buffer as Float32Array

          const downsampled = this.downsample(float32, nativeSampleRate, 16000)
          const int16 = this.float32ToInt16(downsampled)

          this.chunkCount++
          if (this.chunkCount <= 5 || this.chunkCount % 100 === 0) {
            console.log(
              `[MicrophoneCapture] Chunk #${this.chunkCount}, original: ${float32.length}, downsampled: ${int16.length}`
            )
          }

          this.onChunk(int16)
        }
      }

      this.sourceNode.connect(this.workletNode)

      const silentGain = this.audioContext.createGain()
      silentGain.gain.value = 0
      this.workletNode.connect(silentGain)
      silentGain.connect(this.audioContext.destination)

      console.log('[MicrophoneCapture] Audio graph connected')

      this._isRecording = true
      console.log('[MicrophoneCapture] Started successfully')
      return true
    } catch (err) {
      console.error('[MicrophoneCapture] Failed to start:', err)
      await this.cleanup()
      return false
    }
  }

  async stop(): Promise<void> {
    if (!this._isRecording) return

    console.log(
      `[MicrophoneCapture] Stopping... Chunks: ${this.chunkCount}, Heartbeats: ${this.heartbeatCount}`
    )
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
      this.stream?.getTracks().forEach((track) => track.stop())
      await releaseSharedAudioContext()
    } catch (err) {
      console.error('[MicrophoneCapture] Cleanup error:', err)
    }

    this.workletNode = null
    this.sourceNode = null
    this.audioContext = null
    this.stream = null
    this.onChunk = null
  }

  private downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) {
      return buffer
    }

    const ratio = fromRate / toRate
    const newLength = Math.floor(buffer.length / ratio)
    const result = new Float32Array(newLength)

    for (let i = 0; i < newLength; i++) {
      result[i] = buffer[Math.floor(i * ratio)]
    }

    return result
  }

  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return int16
  }
}
