/**
 * System audio capture placeholder.
 * This will be replaced with a native ScreenCaptureKit module for production.
 * For now, it returns false (system audio not available).
 */

export type SystemAudioChunkCallback = (chunk: Int16Array) => void

export class SystemAudioCapture {
  private _isRecording = false

  get isRecording(): boolean {
    return this._isRecording
  }

  /**
   * Start capturing system audio.
   * Returns false until native module is implemented.
   */
  async start(_onChunk: SystemAudioChunkCallback): Promise<boolean> {
    console.log('[SystemAudioCapture] Native module not yet implemented')
    console.log('[SystemAudioCapture] System audio will be available after native ScreenCaptureKit integration')
    return false
  }

  async stop(): Promise<void> {
    this._isRecording = false
    console.log('[SystemAudioCapture] Stopped')
  }
}
