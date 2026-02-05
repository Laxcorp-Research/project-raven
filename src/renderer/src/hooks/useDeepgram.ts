let ws: WebSocket | null = null
let keepAliveInterval: ReturnType<typeof setInterval> | null = null

type TranscriptCallback = (text: string, isFinal: boolean) => void
type StatusCallback = (status: 'connected' | 'disconnected' | 'error') => void

export function startDeepgram(
  apiKey: string,
  _language: string,
  onTranscript: TranscriptCallback,
  onStatus: StatusCallback
): void {
  if (ws) stopDeepgram()

  const url =
    'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&interim_results=true&punctuate=true&diarize=true&sample_rate=16000&channels=1&encoding=linear16'

  ws = new WebSocket(url, ['token', apiKey])

  ws.onopen = () => {
    console.log('[Deepgram] Connected (Nova-3, multi-language)')
    onStatus('connected')

    keepAliveInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'KeepAlive' }))
      }
    }, 8000)
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      const transcript = data.channel?.alternatives?.[0]?.transcript
      const isFinal = data.is_final

      if (transcript) {
        const speaker = data.channel?.alternatives?.[0]?.words?.[0]?.speaker
        const prefix = speaker !== undefined ? `[Speaker ${speaker}]: ` : ''
        onTranscript(prefix + transcript, isFinal)
      }
    } catch (err) {
      console.error('[Deepgram] Parse error:', err)
    }
  }

  ws.onerror = () => {
    console.error('[Deepgram] WebSocket error')
    onStatus('error')
  }

  ws.onclose = () => {
    console.log('[Deepgram] Disconnected')
    onStatus('disconnected')
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval)
      keepAliveInterval = null
    }
    ws = null
  }
}

export function sendAudio(buffer: ArrayBuffer): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(buffer)
  }
}

export function stopDeepgram(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
  if (ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'CloseStream' }))
    }
    ws.close()
    ws = null
  }
}
