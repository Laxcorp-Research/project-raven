/**
 * AudioWorklet processor code as a blob URL.
 * Includes keep-alive mechanism to prevent stalling.
 */

const processorCode = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.isCapturing = true;
    this.frameCount = 0;

    this.port.onmessage = (event) => {
      if (event.data.command === 'stop') {
        this.isCapturing = false;
      } else if (event.data.command === 'start') {
        this.isCapturing = true;
      }
    };

    this.port.postMessage({ type: 'init', message: 'AudioWorklet processor initialized' });
  }

  process(inputs, outputs, parameters) {
    this.frameCount++;

    if (this.frameCount % 128 === 0) {
      this.port.postMessage({ type: 'heartbeat', frames: this.frameCount });
    }

    if (!this.isCapturing) {
      return true;
    }

    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0];

    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];

      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage({
          type: 'audio',
          buffer: this.buffer.slice(0),
        });
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
`;

const workletUrls: Map<string, string> = new Map()

export function getWorkletUrl(processorName: string = 'audio-capture-processor'): string {
  if (!workletUrls.has(processorName)) {
    const code = processorCode.replace(/audio-capture-processor/g, processorName)
    const blob = new Blob([code], { type: 'application/javascript' })
    workletUrls.set(processorName, URL.createObjectURL(blob))
  }
  return workletUrls.get(processorName) as string
}
