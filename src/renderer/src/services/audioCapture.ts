/**
 * AudioCapture — runs in the renderer process (overlay window).
 * Captures microphone audio via Web Audio API, converts to 16-bit PCM,
 * and calls a callback with each chunk for forwarding to main process.
 */

export type AudioChunkCallback = (chunk: Int16Array) => void

export interface AudioDevice {
  deviceId: string
  label: string
}

export class AudioCapture {
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private workletNode: AudioWorkletNode | null = null
  private processorNode: ScriptProcessorNode | null = null
  private onChunk: AudioChunkCallback | null = null
  private _isRecording = false

  get isRecording(): boolean {
    return this._isRecording
  }

  /**
   * List available audio input devices.
   * Must be called after at least one getUserMedia call (for labels).
   */
  static async getDevices(): Promise<AudioDevice[]> {
    try {
      // Need a brief getUserMedia to unlock device labels
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
      console.error('[AudioCapture] Failed to enumerate devices:', err)
      return []
    }
  }

  /**
   * Start capturing audio from the specified device (or default).
   */
  async start(onChunk: AudioChunkCallback, deviceId?: string): Promise<void> {
    if (this._isRecording) {
      console.warn('[AudioCapture] Already recording')
      return
    }

    this.onChunk = onChunk

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1
        }
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.audioContext = new AudioContext({ sampleRate: 16000 })
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)

      // Use ScriptProcessorNode (deprecated but widely supported).
      // AudioWorklet is better but adds complexity — can upgrade later.
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1)

      this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this._isRecording || !this.onChunk) return

        const float32 = event.inputBuffer.getChannelData(0)
        const int16 = this.float32ToInt16(float32)
        this.onChunk(int16)
      }

      this.sourceNode.connect(this.processorNode)
      this.processorNode.connect(this.audioContext.destination)

      this._isRecording = true
      console.log('[AudioCapture] Started recording')
    } catch (err) {
      console.error('[AudioCapture] Failed to start:', err)
      this.cleanup()
      throw err
    }
  }

  /**
   * Stop capturing audio.
   */
  async stop(): Promise<void> {
    if (!this._isRecording) return

    this._isRecording = false
    this.cleanup()
    console.log('[AudioCapture] Stopped recording')
  }

  private cleanup(): void {
    try {
      this.processorNode?.disconnect()
      this.sourceNode?.disconnect()
      this.audioContext?.close()
      this.stream?.getTracks().forEach((track) => track.stop())
    } catch (err) {
      console.error('[AudioCapture] Cleanup error:', err)
    }

    this.processorNode = null
    this.sourceNode = null
    this.audioContext = null
    this.stream = null
    this.onChunk = null
  }

  /**
   * Convert Float32Array [-1, 1] to Int16Array for Deepgram.
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
