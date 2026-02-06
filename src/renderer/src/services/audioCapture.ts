/**
 * DualAudioCapture — captures both microphone and system audio separately.
 * Microphone = You (outgoing)
 * System Audio = Them (incoming)
 */

export type AudioSource = 'mic' | 'system'
export type AudioChunkCallback = (chunk: Int16Array, source: AudioSource) => void

export interface AudioDevice {
  deviceId: string
  label: string
}

interface StreamState {
  stream: MediaStream | null
  audioContext: AudioContext | null
  sourceNode: MediaStreamAudioSourceNode | null
  processorNode: ScriptProcessorNode | null
}

export class DualAudioCapture {
  private micState: StreamState = { stream: null, audioContext: null, sourceNode: null, processorNode: null }
  private systemState: StreamState = { stream: null, audioContext: null, sourceNode: null, processorNode: null }
  private onChunk: AudioChunkCallback | null = null
  private _isRecording = false
  private _hasMicPermission = false
  private _hasSystemPermission = false

  get isRecording(): boolean {
    return this._isRecording
  }

  /**
   * List available audio input devices.
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
      console.error('[DualAudioCapture] Failed to enumerate devices:', err)
      return []
    }
  }

  /**
   * Start capturing both audio streams.
   */
  async start(onChunk: AudioChunkCallback, micDeviceId?: string): Promise<{ mic: boolean; system: boolean }> {
    if (this._isRecording) {
      console.warn('[DualAudioCapture] Already recording')
      return { mic: this._hasMicPermission, system: this._hasSystemPermission }
    }

    this.onChunk = onChunk
    this._isRecording = true

    const [micResult, systemResult] = await Promise.all([
      this.startMicrophone(micDeviceId),
      this.startSystemAudio()
    ])

    this._hasMicPermission = micResult
    this._hasSystemPermission = systemResult

    console.log(`[DualAudioCapture] Started — Mic: ${micResult}, System: ${systemResult}`)

    return { mic: micResult, system: systemResult }
  }

  private async startMicrophone(deviceId?: string): Promise<boolean> {
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

      this.micState.stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.micState.audioContext = new AudioContext({ sampleRate: 16000 })
      this.micState.sourceNode = this.micState.audioContext.createMediaStreamSource(this.micState.stream)
      this.micState.processorNode = this.micState.audioContext.createScriptProcessor(4096, 1, 1)

      this.micState.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this._isRecording || !this.onChunk) return
        const float32 = event.inputBuffer.getChannelData(0)
        const int16 = this.float32ToInt16(float32)
        this.onChunk(int16, 'mic')
      }

      this.micState.sourceNode.connect(this.micState.processorNode)
      this.micState.processorNode.connect(this.micState.audioContext.destination)

      console.log('[DualAudioCapture] Microphone started')
      return true
    } catch (err) {
      console.error('[DualAudioCapture] Microphone failed:', err)
      return false
    }
  }

  private async startSystemAudio(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: 1,
          height: 1,
          frameRate: 1
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 16000,
          channelCount: 1
        } as MediaTrackConstraints
      })

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        console.warn('[DualAudioCapture] No system audio track — user may not have shared audio')
        stream.getVideoTracks().forEach((t) => t.stop())
        return false
      }

      stream.getVideoTracks().forEach((t) => t.stop())

      this.systemState.stream = new MediaStream(audioTracks)
      this.systemState.audioContext = new AudioContext({ sampleRate: 16000 })
      this.systemState.sourceNode = this.systemState.audioContext.createMediaStreamSource(this.systemState.stream)
      this.systemState.processorNode = this.systemState.audioContext.createScriptProcessor(4096, 1, 1)

      this.systemState.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!this._isRecording || !this.onChunk) return
        const float32 = event.inputBuffer.getChannelData(0)
        const int16 = this.float32ToInt16(float32)
        this.onChunk(int16, 'system')
      }

      this.systemState.sourceNode.connect(this.systemState.processorNode)
      this.systemState.processorNode.connect(this.systemState.audioContext.destination)

      console.log('[DualAudioCapture] System audio started')
      return true
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'NotAllowedError') {
        console.warn('[DualAudioCapture] System audio permission denied or cancelled')
      } else {
        console.error('[DualAudioCapture] System audio failed:', err)
      }
      return false
    }
  }

  /**
   * Stop all audio capture.
   */
  async stop(): Promise<void> {
    if (!this._isRecording) return

    this._isRecording = false

    this.cleanupState(this.micState)
    this.cleanupState(this.systemState)

    this.micState = { stream: null, audioContext: null, sourceNode: null, processorNode: null }
    this.systemState = { stream: null, audioContext: null, sourceNode: null, processorNode: null }
    this.onChunk = null

    console.log('[DualAudioCapture] Stopped')
  }

  private cleanupState(state: StreamState): void {
    try {
      state.processorNode?.disconnect()
      state.sourceNode?.disconnect()
      state.audioContext?.close()
      state.stream?.getTracks().forEach((track) => track.stop())
    } catch (err) {
      console.error('[DualAudioCapture] Cleanup error:', err)
    }
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
