import { useState, type KeyboardEvent } from 'react'

interface OverlayInputProps {
  onSend: (message: string) => void
  onQuickAction: (action: string) => void
  isRecording: boolean
}

const QUICK_ACTIONS = [
  { label: '✨ Assist', action: 'assist' },
  { label: '💬 What should I say?', action: 'what-should-i-say' },
  { label: '🔄 Follow-up', action: 'follow-up' },
  { label: '📋 Recap', action: 'recap' }
]

export function OverlayInput({ onSend, onQuickAction, isRecording }: OverlayInputProps) {
  const [message, setMessage] = useState('')

  const handleQuickAction = async (action: string) => {
    const transcript = await window.raven.getTranscript()
    window.raven.claudeGetResponse({ transcript, action })
    onQuickAction(action)
  }

  const handleSubmit = async () => {
    const trimmed = message.trim()
    if (!trimmed) return
    const transcript = await window.raven.getTranscript()
    window.raven.claudeGetResponse({ transcript, action: 'custom', customPrompt: trimmed })
    onSend(trimmed)
    setMessage('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-gray-700/50 p-3 space-y-2">
      {/* Quick Action Chips */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_ACTIONS.map((qa) => (
          <button
            key={qa.action}
            onClick={() => handleQuickAction(qa.action)}
            className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 hover:text-white transition-colors border border-gray-600/30"
          >
            {qa.label}
          </button>
        ))}
      </div>

      {/* Text Input */}
      <div className="flex items-center gap-2">
        {/* Recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-red-400 font-medium">REC</span>
          </div>
        )}

        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Raven anything..."
          className="flex-1 bg-gray-800/50 border border-gray-600/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
        />

        <button
          onClick={handleSubmit}
          disabled={!message.trim()}
          className="p-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
          title="Send (Enter)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" x2="11" y1="2" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}
