import { useEffect, useRef, useState } from 'react'

export function ResponsePanel() {
  const [transcript, setTranscript] = useState('')
  const [transcriptionStatus, setTranscriptionStatus] = useState('disconnected')
  const [isRecording, setIsRecording] = useState(false)
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

  if (!transcript) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
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
