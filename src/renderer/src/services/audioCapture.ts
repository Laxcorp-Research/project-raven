/**
 * DualAudioCapture — captures microphone (You) and system audio (Them) separately.
 * Uses Electron's desktopCapturer for system audio — no picker required.
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

  get isRecording(): boolean {
    return this._isRecording
  }

  /**
   * List available audio input devices (microphones).
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
      return { mic: false, system: false }
    }

    this.onChunk = onChunk
    this._isRecording = true

    const [micResult, systemResult] = await Promise.all([
      this.startMicrophone(micDeviceId),
      this.startSystemAudio()
    ])

    console.log(`[DualAudioCapture] Started — Mic: ${micResult}, System: ${systemResult}`)

    return { mic: micResult, system: systemResult }
  }

  /**
   * Start microphone capture (Your voice).
   */
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
      await this.setupAudioProcessing(this.micState, 'mic')

      console.log('[DualAudioCapture] Microphone started')
      return true
    } catch (err) {
      console.error('[DualAudioCapture] Microphone failed:', err)
      return false
    }
  }

  /**
   * Start system audio capture (Their voices) using desktopCapturer.
   */
  private async startSystemAudio(): Promise<boolean> {
    try {
      const sources = await window.raven.desktopGetSources()

      if (!sources || sources.length === 0) {
        console.warn('[DualAudioCapture] No desktop sources available')
        return false
      }

      const screenSource =
        sources.find((s: { id: string; name: string }) => s.id.startsWith('screen:') && s.name.toLowerCase().includes('screen')) ||
        sources.find((s: { id: string }) => s.id.startsWith('screen:')) ||
        sources[0]

      console.log('[DualAudioCapture] Using source:', screenSource.name, screenSource.id)

      const stream = await (navigator.mediaDevices as {
        getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
      }).getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        } as MediaTrackConstraints,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id,
            minWidth: 1,
            maxWidth: 1,
            minHeight: 1,
            maxHeight: 1,
            maxFrameRate: 1
          }
        } as MediaTrackConstraints
      })

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        console.warn('[DualAudioCapture] No audio track in system capture')
        stream.getTracks().forEach((t) => t.stop())
        return false
      }

      stream.getVideoTracks().forEach((t) => t.stop())

      this.systemState.stream = new MediaStream(audioTracks)
      await this.setupAudioProcessing(this.systemState, 'system')

      console.log('[DualAudioCapture] System audio started')
      return true
    } catch (err: unknown) {
      const errObj = err as { name?: string; message?: string }
      if (errObj.name === 'NotAllowedError' || errObj.message?.includes('Permission denied')) {
        console.error(
          '[DualAudioCapture] Screen Recording permission required. Grant in System Preferences > Privacy > Screen Recording'
        )
      } else if (errObj.message?.includes('Could not start audio source')) {
        console.warn('[DualAudioCapture] No system audio available (nothing playing?)')
      } else {
        console.error('[DualAudioCapture] System audio failed:', err)
      }
      return false
    }
  }

  /**
   * Set up Web Audio processing for a stream.
   */
  private async setupAudioProcessing(state: StreamState, source: AudioSource): Promise<void> {
    if (!state.stream) return

    state.audioContext = new AudioContext({ sampleRate: 16000 })

    if (state.audioContext.state === 'suspended') {
      console.log(`[DualAudioCapture] Resuming suspended AudioContext for ${source}`)
      await state.audioContext.resume()
    }

    console.log(`[DualAudioCapture] AudioContext state for ${source}: ${state.audioContext.state}`)

    state.sourceNode = state.audioContext.createMediaStreamSource(state.stream)
    state.processorNode = state.audioContext.createScriptProcessor(4096, 1, 1)

    let processCount = 0
    state.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      processCount++

      if (processCount <= 3 || processCount % 100 === 0) {
        console.log(`[DualAudioCapture] ${source} chunk #${processCount}`)
      }

      if (!this._isRecording || !this.onChunk) return

      const float32 = event.inputBuffer.getChannelData(0)
      const int16 = this.float32ToInt16(float32)
      this.onChunk(int16, source)
    }

    state.sourceNode.connect(state.processorNode)
    state.processorNode.connect(state.audioContext.destination)

    console.log(`[DualAudioCapture] Audio processing setup complete for ${source}`)
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
