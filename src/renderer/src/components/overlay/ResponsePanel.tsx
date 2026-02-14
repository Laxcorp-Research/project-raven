import { useState, useRef, useEffect } from 'react'
import { ChatTab } from './ChatTab'
import { TranscriptTab } from './TranscriptTab'

type Tab = 'chat' | 'transcript'

export function ResponsePanel() {
  const [activeTab, setActiveTab] = useState<Tab>('chat')
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const tabsRef = useRef<HTMLDivElement>(null)
  const chatTabRef = useRef<HTMLButtonElement>(null)
  const transcriptTabRef = useRef<HTMLButtonElement>(null)

  // Update indicator position when tab changes
  useEffect(() => {
    const activeRef = activeTab === 'chat' ? chatTabRef : transcriptTabRef
    const tabsContainer = tabsRef.current
    
    if (activeRef.current && tabsContainer) {
      const tabRect = activeRef.current.getBoundingClientRect()
      const containerRect = tabsContainer.getBoundingClientRect()
      
      setIndicatorStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width
      })
    }
  }, [activeTab])

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Tab Bar with sliding indicator */}
      <div className="relative border-b border-white/10">
        <div ref={tabsRef} className="flex px-4">
          <button
            ref={chatTabRef}
            onClick={() => setActiveTab('chat')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative z-10 ${
              activeTab === 'chat'
                ? 'text-cyan-400'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            Chat
          </button>
          <button
            ref={transcriptTabRef}
            onClick={() => setActiveTab('transcript')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative z-10 ${
              activeTab === 'transcript'
                ? 'text-cyan-400'
                : 'text-white/50 hover:text-white/70'
            }`}
          >
            Transcript
          </button>
        </div>
        
        {/* Sliding indicator */}
        <div
          className="absolute bottom-0 h-0.5 bg-cyan-400 transition-all duration-200 ease-out"
          style={{
            left: indicatorStyle.left,
            width: indicatorStyle.width
          }}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'chat' ? <ChatTab /> : <TranscriptTab />}
      </div>
    </div>
  )
}
