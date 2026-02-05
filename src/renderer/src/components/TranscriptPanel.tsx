import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'

export function TranscriptPanel() {
  const { transcript, interimText, isRecording } = useAppStore()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, interimText])

  if (!transcript && !interimText) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-gray-600 text-xs">
            {isRecording ? 'Listening...' : 'Start recording to see the transcript'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
        {transcript}
        {interimText && <span className="text-gray-500 italic">{interimText}</span>}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
