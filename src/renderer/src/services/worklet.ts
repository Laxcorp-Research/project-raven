/**
 * AudioWorklet processor code as a blob URL.
 * This avoids module loading issues in Electron.
 */

const processorCode = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.isCapturing = true;

    this.port.onmessage = (event) => {
      if (event.data.command === 'stop') {
        this.isCapturing = false;
      } else if (event.data.command === 'start') {
        this.isCapturing = true;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.isCapturing) return true;

    const input = inputs[0];
    if (!input || !input[0]) return true;

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

let workletUrl: string | null = null;

export function getWorkletUrl(): string {
  if (!workletUrl) {
    const blob = new Blob([processorCode], { type: 'application/javascript' });
    workletUrl = URL.createObjectURL(blob);
  }
  return workletUrl;
}
