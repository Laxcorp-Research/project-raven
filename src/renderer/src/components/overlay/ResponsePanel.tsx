import { useEffect, useRef, useState } from 'react'

export function ResponsePanel() {
  const [transcript, setTranscript] = useState('')
  const [transcriptionStatus, setTranscriptionStatus] = useState('disconnected')
  const [isRecording, setIsRecording] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiAction, setAiAction] = useState('')
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubTranscript = window.raven.onTranscriptUpdate((data) => {
      setTranscript(data.fullTranscript)
    })

    const unsubStatus = window.raven.onTranscriptionStatus((data) => {
      setTranscriptionStatus(data.status)
    })

    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording)
    })

    window.raven.getTranscript().then((data) => {
      setTranscript(data)
    })

    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
    })

    return () => {
      unsubTranscript()
      unsubStatus()
      unsubRecording()
    }
  }, [])

  useEffect(() => {
    if (!transcript) return
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  useEffect(() => {
    const unsub = window.raven.onClaudeResponse((data) => {
      if (data.type === 'start') {
        setAiResponse('')
        setAiError('')
        setAiLoading(true)
        setAiAction(data.action || 'assist')
      } else if (data.type === 'delta') {
        setAiResponse(data.fullText || '')
        setAiLoading(false)
      } else if (data.type === 'done') {
        setAiResponse(data.fullText || '')
        setAiLoading(false)
      } else if (data.type === 'error') {
        setAiError(data.error || 'Something went wrong')
        setAiLoading(false)
      }
    })
    return () => unsub()
  }, [])

  if (!transcript) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        {(aiResponse || aiLoading || aiError) && (
          <div className="mx-1 mb-3 p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">
                ✨ {aiAction === 'what-should-i-say' ? 'Say this' : aiAction === 'follow-up' ? 'Follow-up' : aiAction === 'recap' ? 'Recap' : 'Assist'}
              </span>
            </div>
            {aiLoading && (
              <div className="flex items-center gap-1.5 text-white/50 text-sm">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                <span className="ml-1">Thinking...</span>
              </div>
            )}
            {aiError && <div className="text-red-400 text-sm">{aiError}</div>}
            {aiResponse && (
              <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">{aiResponse}</div>
            )}
          </div>
        )}
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="text-3xl mb-3">🐦‍⬛</div>
          <p className="text-gray-400 text-sm">
            Start recording and ask for help,
            <br />
            or use a quick action below.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            Press{' '}
            <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 text-xs font-mono">⌘ Enter</kbd> for
            instant AI assist
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
      {(aiResponse || aiLoading || aiError) && (
        <div className="mb-2 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full">
              ✨ {aiAction === 'what-should-i-say' ? 'Say this' : aiAction === 'follow-up' ? 'Follow-up' : aiAction === 'recap' ? 'Recap' : 'Assist'}
            </span>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-1.5 text-white/50 text-sm">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
              <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
              <span className="ml-1">Thinking...</span>
            </div>
          )}
          {aiError && <div className="text-red-400 text-sm">{aiError}</div>}
          {aiResponse && (
            <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">{aiResponse}</div>
          )}
        </div>
      )}
      {isRecording && transcriptionStatus === 'connected' && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
          <span className="text-green-400/70 text-xs">Live transcription</span>
        </div>
      )}

      <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">{transcript}</div>
      <div ref={transcriptEndRef} />
    </div>
  )
}
