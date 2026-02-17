import { useEffect, useRef } from 'react'
import { createLogger } from '../lib/logger'
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

const log = createLogger('Overlay')

export function Overlay() {
  const { activeTab, isRecording, setAiLoading, setAiResponse, setActiveTab, clearTranscript } = useAppStore()
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
          log.log('System audio stopped')
        } catch (err) {
          log.warn('System audio stop failed:', err)
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
            log.log('System audio started')
          } catch (err) {
            log.warn('System audio failed, continuing mic-only:', err)
          }

          await startMicrophoneCapture((audioBuffer) => {
            sendAudio(audioBuffer)
          })

          useAppStore.getState().setRecording(true)
        } catch (err) {
          log.error('Hotkey recording error:', err)
          stopMicrophoneCapture()
          stopDeepgram()
        }
      }
    })

    // Global hotkey: Clear conversation
    const unsubClear = window.raven.onHotkeyClearConversation?.(() => {
      clearTranscript()
      setAiResponse('')
      void window.raven.clearTranscript()
    })

    // Global hotkey: Scroll up
    const unsubScrollUp = window.raven.onHotkeyScrollUp?.(() => {
      const container = document.querySelector('[data-scroll-container]')
      if (container) {
        container.scrollBy({ top: -150, behavior: 'smooth' })
      }
    })

    // Global hotkey: Scroll down
    const unsubScrollDown = window.raven.onHotkeyScrollDown?.(() => {
      const container = document.querySelector('[data-scroll-container]')
      if (container) {
        container.scrollBy({ top: 150, behavior: 'smooth' })
      }
    })

    return () => {
      unsubAi()
      unsubRec()
      unsubClear?.()
      unsubScrollUp?.()
      unsubScrollDown?.()
    }
  }, [setAiLoading, setAiResponse, setActiveTab, clearTranscript])

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
