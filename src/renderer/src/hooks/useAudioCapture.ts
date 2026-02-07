let audioContext: AudioContext | null = null
let mediaStream: MediaStream | null = null
let processor: ScriptProcessorNode | null = null
let nativeMicUnsubscribe: (() => void) | null = null

export async function startMicrophoneCapture(
  onAudioData: (int16Buffer: ArrayBuffer) => void
): Promise<void> {
  const isMac = navigator.userAgent.includes('Mac')
  if (isMac && window.raven?.onNativeMicChunk) {
    nativeMicUnsubscribe = window.raven.onNativeMicChunk((chunk) => {
      const bytes = chunk.data instanceof ArrayBuffer
        ? new Uint8Array(chunk.data)
        : new Uint8Array(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength)
      const alignedLength = bytes.byteLength - (bytes.byteLength % 2)
      const alignedBuffer = new ArrayBuffer(alignedLength)
      new Uint8Array(alignedBuffer).set(bytes.subarray(0, alignedLength))
      onAudioData(alignedBuffer)
    })
    return
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 16000,
      channelCount: 1,
    },
  })

  audioContext = new AudioContext({ sampleRate: 16000 })
  const source = audioContext.createMediaStreamSource(mediaStream)

  processor = audioContext.createScriptProcessor(4096, 1, 1)
  processor.onaudioprocess = (event) => {
    const float32Data = event.inputBuffer.getChannelData(0)
    const int16Data = new Int16Array(float32Data.length)
    for (let i = 0; i < float32Data.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Data[i]))
      int16Data[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    onAudioData(int16Data.buffer)
  }

  source.connect(processor)
  processor.connect(audioContext.destination)
}

export function stopMicrophoneCapture(): void {
  if (nativeMicUnsubscribe) {
    nativeMicUnsubscribe()
    nativeMicUnsubscribe = null
  }
  processor?.disconnect()
  processor = null
  audioContext?.close()
  audioContext = null
  mediaStream?.getTracks().forEach((track) => track.stop())
  mediaStream = null
}
