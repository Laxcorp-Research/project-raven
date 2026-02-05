import { useState, useEffect } from 'react'
import { OverlayToolbar } from './OverlayToolbar'
import { ResponsePanel } from './ResponsePanel'
import { OverlayInput } from './OverlayInput'

export function OverlayWindow() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [stealthEnabled, setStealthEnabled] = useState(true)

  useEffect(() => {
    // Listen for stealth changes from dashboard
    const unsubStealth = window.raven.onStealthChanged((enabled: boolean) => {
      setStealthEnabled(enabled)
    })

    // Listen for recording state changes from main process
    const unsubRecording = window.raven.onRecordingStateChanged((state) => {
      setIsRecording(state.isRecording)
    })

    // Listen for AI suggestion hotkey
    const unsubAi = window.raven.onHotkeyAiSuggestion(() => {
      console.log('AI suggestion hotkey triggered')
    })

    // Load initial stealth state
    window.raven.storeGet('stealthEnabled').then((enabled) => {
      if (typeof enabled === 'boolean') setStealthEnabled(enabled)
    })

    // Load initial recording state
    window.raven.audioGetState().then((state) => {
      setIsRecording(state.isRecording)
    })

    return () => {
      unsubStealth()
      unsubRecording()
      unsubAi()
    }
  }, [])

  const handleHide = () => {
    window.raven.windowHide()
  }

  const handleQuickAction = (action: string) => {
    console.log('Quick action:', action)
    setIsExpanded(true)
  }

  const handleSendMessage = (message: string) => {
    console.log('Send message:', message)
    setIsExpanded(true)
  }

  return (
    <div className="flex flex-col h-screen bg-transparent">
      <div className="flex flex-col h-full m-2 rounded-2xl bg-gray-900/80 backdrop-blur-xl border border-gray-700/50 shadow-2xl overflow-hidden">
        {/* Pill Toolbar */}
        <OverlayToolbar
          stealthEnabled={stealthEnabled}
          isExpanded={isExpanded}
          onToggleExpand={() => setIsExpanded((prev) => !prev)}
          onHide={handleHide}
        />

        {/* Response Panel - collapsible */}
        {isExpanded && <ResponsePanel />}

        {/* Input Bar */}
        <OverlayInput onSend={handleSendMessage} onQuickAction={handleQuickAction} isRecording={isRecording} />
      </div>
    </div>
  )
}
