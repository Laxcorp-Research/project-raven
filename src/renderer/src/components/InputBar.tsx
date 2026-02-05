import { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { startMicrophoneCapture, stopMicrophoneCapture } from '../hooks/useAudioCapture'
import { startDeepgram, sendAudio, stopDeepgram } from '../hooks/useDeepgram'

export function InputBar() {
  const { isRecording, setRecording, setAiLoading, setAiResponse, setActiveTab } = useAppStore()
  const [question, setQuestion] = useState('')

  const toggleRecording = async () => {
    if (isRecording) {
      stopMicrophoneCapture()
      stopDeepgram()
      setRecording(false)
    } else {
      const apiKey = useAppStore.getState().deepgramApiKey
      if (!apiKey) {
        useAppStore.getState().setShowSettings(true)
        return
      }

      try {
        // Start Deepgram WebSocket first
        startDeepgram(
          apiKey,
          'multi',
          (text, isFinal) => {
            useAppStore.getState().appendTranscript(text, isFinal)
          },
          (status) => {
            console.log('[Deepgram Status]', status)
            if (status === 'error') {
              stopMicrophoneCapture()
              useAppStore.getState().setRecording(false)
            }
          }
        )

        // Then start mic capture, sending audio chunks to Deepgram
        await startMicrophoneCapture((audioBuffer) => {
          sendAudio(audioBuffer)
        })

        setRecording(true)
      } catch (err) {
        console.error('Recording error:', err)
        stopMicrophoneCapture()
        stopDeepgram()
      }
    }
  }

  const handleAsk = async () => {
    const state = useAppStore.getState()
    const currentTranscript = state.transcript
    const anthropicKey = state.anthropicApiKey

    if (!anthropicKey) {
      useAppStore.getState().setShowSettings(true)
      return
    }

    if (!currentTranscript.trim() && !question.trim()) return

    setAiLoading(true)
    setActiveTab('response')
    const userQ = question.trim() || undefined
    setQuestion('')

    try {
      const result = await window.raven.getAiSuggestion(anthropicKey, currentTranscript, userQ)
      if (result.success) {
        setAiResponse(result.text)
      } else {
        setAiResponse(`❌ ${result.error}`)
      }
    } catch (error: any) {
      setAiResponse(`❌ Failed to get AI suggestion: ${error.message}`)
    }
    setAiLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleAsk()
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-white/5">
      {/* Record button */}
      <button
        onClick={toggleRecording}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20'
            : 'bg-white/10 hover:bg-white/15'
        }`}
        title={isRecording ? 'Stop recording' : 'Start recording'}
      >
        {isRecording ? (
          <div className="w-2.5 h-2.5 bg-white rounded-sm" />
        ) : (
          <div className="w-2.5 h-2.5 bg-red-400 rounded-full" />
        )}
      </button>

      {/* Text input */}
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question... (⌘+Enter)"
        className="flex-1 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500/50 focus:bg-white/[0.07] transition-colors"
      />

      {/* Send button */}
      <button
        onClick={handleAsk}
        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors flex-shrink-0"
      >
        Ask
      </button>
    </div>
  )
}
