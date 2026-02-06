import { useEffect, useRef } from 'react'
import { TitleBar } from './TitleBar'
import { TabBar } from './TabBar'
import { ResponsePanel } from './ResponsePanel'
import { TranscriptPanel } from './TranscriptPanel'
import { InputBar } from './InputBar'
import { StatusBar } from './StatusBar'
import { Settings } from './Settings'
import { useAppStore } from '../stores/appStore'
import { startMicrophoneCapture, stopMicrophoneCapture } from '../hooks/useAudioCapture'
import { startDeepgram, sendAudio, stopDeepgram } from '../hooks/useDeepgram'

export function Overlay() {
  const { activeTab, isRecording, setRecording, setAiLoading, setAiResponse, setActiveTab } = useAppStore()
  const isRecordingRef = useRef(isRecording)

  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  useEffect(() => {
    // Global hotkey: AI suggestion
    const unsubAi = window.raven.onHotkeyAiSuggestion(async () => {
      const state = useAppStore.getState()
      if (!state.transcript.trim() || !state.anthropicApiKey) return

      setAiLoading(true)
      setActiveTab('response')
      try {
        const result = await window.raven.getAiSuggestion(state.anthropicApiKey, state.transcript)
        setAiResponse(result.success ? result.text : `❌ ${result.error}`)
      } catch {
        setAiResponse('❌ Failed to get AI suggestion.')
      }
      setAiLoading(false)
    })

    // Global hotkey: Toggle recording
    const unsubRec = window.raven.onHotkeyToggleRecording(async () => {
      if (isRecordingRef.current) {
        stopMicrophoneCapture()
        stopDeepgram()
        try {
          await window.raven.systemAudioStop()
          console.log('[Recording] System audio stopped')
        } catch (err) {
          console.warn('[Recording] System audio stop failed:', err)
        }
        useAppStore.getState().setRecording(false)
      } else {
        const apiKey = useAppStore.getState().deepgramApiKey
        if (!apiKey) return

        try {
          startDeepgram(
            apiKey,
            'multi',
            (text, isFinal) => {
              useAppStore.getState().appendTranscript(text, isFinal)
            },
            (status) => {
              if (status === 'error') {
                stopMicrophoneCapture()
                useAppStore.getState().setRecording(false)
              }
            }
          )

          try {
            await window.raven.systemAudioStart()
            console.log('[Recording] System audio started')
          } catch (err) {
            console.warn('[Recording] System audio failed, continuing mic-only:', err)
          }

          await startMicrophoneCapture((audioBuffer) => {
            sendAudio(audioBuffer)
          })

          useAppStore.getState().setRecording(true)
        } catch (err) {
          console.error('Hotkey recording error:', err)
          stopMicrophoneCapture()
          stopDeepgram()
        }
      }
    })

    return () => {
      unsubAi()
      unsubRec()
    }
  }, [setAiLoading, setAiResponse, setActiveTab])

  return (
    <div className="relative flex flex-col h-screen rounded-xl overflow-hidden select-none" style={{ background: 'rgba(17, 24, 39, 0.92)' }}>
      <TitleBar />
      <TabBar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'response' ? <ResponsePanel /> : <TranscriptPanel />}
      </div>
      <StatusBar />
      <InputBar />
      <Settings />
    </div>
  )
}
