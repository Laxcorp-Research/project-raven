import { useState, useRef, useEffect, type ReactNode } from 'react'

interface TranscriptEntry {
  id: string
  source: 'mic' | 'system'
  text: string
  timestamp: number
  isFinal: boolean
}

interface SessionDetailData {
  id: string
  title: string
  transcript: TranscriptEntry[]
  summary: string | null
  durationSeconds: number
  startedAt: number
  modeId: string | null
}

interface SessionMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface SessionDetailProps {
  session: SessionDetailData
  onBack: () => void
  onUpdateTitle?: (sessionId: string, newTitle: string) => void
}

type Tab = 'summary' | 'transcript' | 'usage'

const MAX_TITLE_LENGTH = 200

export function SessionDetail({ session, onBack, onUpdateTitle }: SessionDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(session.title)
  const [showTitleTooltip, setShowTitleTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [tabDimensions, setTabDimensions] = useState({
    summary: { left: 0, width: 0 },
    transcript: { left: 0, width: 0 },
    usage: { left: 0, width: 0 },
  })
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const titleRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const summaryTabRef = useRef<HTMLButtonElement>(null)
  const transcriptTabRef = useRef<HTMLButtonElement>(null)
  const usageTabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.innerText = editedTitle
      titleRef.current.focus()
      const range = document.createRange()
      const selection = window.getSelection()
      range.selectNodeContents(titleRef.current)
      range.collapse(false)
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
  }, [isEditingTitle])

  useEffect(() => {
    setEditedTitle(session.title)
  }, [session.title])

  useEffect(() => {
    setMessages([])
    setLoadingMessages(false)
    setActiveTab('summary')
  }, [session.id])

  useEffect(() => {
    if (activeTab === 'usage' && messages.length === 0) {
      loadMessages()
    }
  }, [activeTab])

  useEffect(() => {
    const updateDimensions = () => {
      if (
        tabContainerRef.current &&
        summaryTabRef.current &&
        transcriptTabRef.current &&
        usageTabRef.current
      ) {
        setTabDimensions({
          summary: {
            left: summaryTabRef.current.offsetLeft,
            width: summaryTabRef.current.offsetWidth,
          },
          transcript: {
            left: transcriptTabRef.current.offsetLeft,
            width: transcriptTabRef.current.offsetWidth,
          },
          usage: {
            left: usageTabRef.current.offsetLeft,
            width: usageTabRef.current.offsetWidth,
          },
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [activeTab])

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  }

  const handleTitleClick = () => {
    setIsEditingTitle(true)
    setShowTitleTooltip(false)
  }

  const handleTitleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const handleTitleBlur = () => {
    const finalTitle = titleRef.current?.innerText?.trim() || session.title
    const newTitle = finalTitle.slice(0, MAX_TITLE_LENGTH)

    setEditedTitle(newTitle)
    setIsEditingTitle(false)

    if (newTitle !== session.title && onUpdateTitle) {
      onUpdateTitle(session.id, newTitle)
    }
  }

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      titleRef.current?.blur()
    }
    if (e.key === 'Escape') {
      setEditedTitle(session.title)
      setIsEditingTitle(false)
    }
  }

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopySuccess(type)
      setTimeout(() => setCopySuccess(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const transcriptText = session.transcript
    .map((entry) => `${entry.source === 'mic' ? 'You' : 'Them'}: ${entry.text}`)
    .join('\n')
  const hasTranscript = transcriptText.trim().length > 0

  const loadMessages = async () => {
    setLoadingMessages(true)
    try {
      const msgs = await window.raven.sessions.getMessages(session.id)
      setMessages(msgs)
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
    setLoadingMessages(false)
  }

  const getCopyText = () => {
    if (activeTab === 'summary') return session.summary || ''
    if (activeTab === 'transcript') return transcriptText
    if (activeTab === 'usage') {
      return messages
        .map((message) => `${message.role === 'user' ? 'You' : 'Raven'}: ${message.content}`)
        .join('\n\n')
    }
    return ''
  }

  const handleTitleChange = () => {
    if (titleRef.current) {
      const newValue = titleRef.current.innerText || ''
      if (newValue.length > MAX_TITLE_LENGTH) {
        const selection = window.getSelection()
        const range = selection?.getRangeAt(0)
        const cursorOffset = range?.startOffset || 0

        titleRef.current.innerText = newValue.slice(0, MAX_TITLE_LENGTH)

        const textNode = titleRef.current.firstChild
        if (textNode && selection) {
          const newRange = document.createRange()
          const newOffset = Math.min(cursorOffset, MAX_TITLE_LENGTH)
          newRange.setStart(textNode, newOffset)
          newRange.setEnd(textNode, newOffset)
          selection.removeAllRanges()
          selection.addRange(newRange)
        }
      }
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="max-w-[900px] mx-auto w-full px-6 pt-8 pb-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors mb-6 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Back</span>
          </button>

          <p className="text-sm text-gray-500 mb-1">{formatDate(session.startedAt)}</p>

          <div
            className="relative max-w-lg"
            onMouseEnter={() => !isEditingTitle && setShowTitleTooltip(true)}
            onMouseLeave={() => setShowTitleTooltip(false)}
            onMouseMove={handleTitleMouseMove}
          >
            {isEditingTitle ? (
              <div
                ref={titleRef}
                contentEditable
                onInput={handleTitleChange}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                suppressContentEditableWarning
                className="text-2xl font-semibold text-gray-900 cursor-text border border-transparent rounded-lg break-words px-2 py-1 -mx-2 tracking-normal outline-none"
                style={{
                  lineHeight: '1.2',
                  fontKerning: 'auto',
                  textRendering: 'optimizeLegibility',
                  minHeight: '1.2em',
                }}
              />
            ) : (
              <h1
                onClick={handleTitleClick}
                className="text-2xl font-semibold text-gray-900 cursor-text border border-transparent hover:border-gray-300 rounded-lg px-2 py-1 -mx-2 transition-colors break-words tracking-normal"
                style={{
                  lineHeight: '1.2',
                  fontKerning: 'auto',
                  textRendering: 'optimizeLegibility',
                }}
              >
                {session.title}
              </h1>
            )}

            {showTitleTooltip && !isEditingTitle && (
              <div
                className="absolute px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap z-10 pointer-events-none"
                style={{
                  left: tooltipPosition.x,
                  top: tooltipPosition.y + 25,
                  transform: 'translateX(-50%)',
                }}
              >
                Click to edit title
              </div>
            )}
          </div>
        </div>

        <div className="max-w-[900px] mx-auto w-full px-6 mb-6">
          <div ref={tabContainerRef} className="relative inline-flex bg-gray-100/80 rounded-full p-1">
            <div
              className="absolute top-1 bottom-1 bg-white rounded-full shadow-sm transition-all duration-200 ease-out"
              style={{
                left: tabDimensions[activeTab].left,
                width: tabDimensions[activeTab].width,
              }}
            />
            <button
              ref={summaryTabRef}
              onClick={() => setActiveTab('summary')}
              className={`relative z-10 px-5 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 ${
                activeTab === 'summary'
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Summary
            </button>
            <button
              ref={transcriptTabRef}
              onClick={() => setActiveTab('transcript')}
              className={`relative z-10 px-5 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 ${
                activeTab === 'transcript'
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Transcript
            </button>
            <button
              ref={usageTabRef}
              onClick={() => setActiveTab('usage')}
              className={`relative z-10 px-5 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 ${
                activeTab === 'usage'
                  ? 'text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Usage
            </button>
          </div>
        </div>

        <div className="flex-1 h-0 relative">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto">
            <div className="max-w-[900px] mx-auto w-full px-6 pb-16">
              {(hasTranscript || (activeTab === 'usage' && messages.length > 0)) && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => handleCopy(getCopyText(), activeTab)}
                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    {copySuccess === activeTab ? 'Copied!' : `Copy full ${activeTab}`}
                  </button>
                </div>
              )}

              {activeTab === 'summary' && (
                <SummaryTab summary={session.summary} hasTranscript={hasTranscript} />
              )}
              {activeTab === 'transcript' && (
                <TranscriptTab transcript={session.transcript} />
              )}
              {activeTab === 'usage' && (
                <UsageTab messages={messages} loading={loadingMessages} />
              )}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  )
}

function SummaryTab({ summary, hasTranscript }: { summary: string | null; hasTranscript: boolean }) {
  if (!summary || !hasTranscript) {
    return <p className="text-gray-400 text-lg">Write your notes here...</p>
  }

  const sections = parseSummary(summary)

  return (
    <div className="space-y-6 max-w-3xl">
      {sections.map((section, index) => (
        <div key={index}>
          {section.heading && (
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              {section.heading}
            </h3>
          )}
          {section.items.length > 0 ? (
            <ul className="space-y-2.5">
              {section.items.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                  <span className="text-gray-700 leading-relaxed">
                    {renderBoldText(item)}
                  </span>
                </li>
              ))}
            </ul>
          ) : section.content ? (
            <p className="text-gray-700 leading-relaxed">{renderBoldText(section.content)}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function TranscriptTab({ transcript }: { transcript: TranscriptEntry[] }) {
  if (!transcript || transcript.length === 0) {
    return <p className="text-gray-400 text-lg">No transcript available</p>
  }

  const utterances = parseTranscript(transcript)

  return (
    <div className="space-y-4">
      {utterances.map((utterance, index) => (
        <div key={index}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-medium ${
              utterance.speaker === 'You' ? 'text-blue-600' : 'text-gray-500'
            }`}>
              {utterance.speaker}
            </span>
            {utterance.timestamp && (
              <span className="text-sm text-gray-400">{utterance.timestamp}</span>
            )}
          </div>
          <p className="text-gray-700 leading-relaxed">{utterance.text}</p>
        </div>
      ))}
    </div>
  )
}

interface Section {
  heading?: string
  content: string
  items: string[]
}

function parseSummary(summary: string): Section[] {
  const lines = summary.split('\n')
  const sections: Section[] = []
  let currentSection: Section = { content: '', items: [] }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const headingMatch = trimmed.match(/^##\s+(.+)$/) || trimmed.match(/^\*\*(.+)\*\*$/)

    if (headingMatch) {
      if (currentSection.content || currentSection.items.length > 0 || currentSection.heading) {
        sections.push(currentSection)
      }
      currentSection = { heading: headingMatch[1], content: '', items: [] }
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      currentSection.items.push(trimmed.slice(2))
    } else {
      if (currentSection.items.length === 0) {
        currentSection.content += (currentSection.content ? ' ' : '') + trimmed
      } else {
        currentSection.items.push(trimmed)
      }
    }
  }

  if (currentSection.content || currentSection.items.length > 0 || currentSection.heading) {
    sections.push(currentSection)
  }

  return sections.length > 0 ? sections : [{ content: summary, items: [] }]
}

function renderBoldText(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

interface Utterance {
  speaker: string
  timestamp?: string
  text: string
}

function parseTranscript(transcript: TranscriptEntry[]): Utterance[] {
  return transcript
    .filter((entry) => entry.text && entry.text.trim())
    .map((entry) => ({
      speaker: entry.source === 'mic' ? 'You' : 'Them',
      timestamp: formatTimestamp(entry.timestamp),
      text: entry.text.trim(),
    }))
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function UsageTab({ messages, loading }: { messages: SessionMessage[]; loading: boolean }) {
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)

  const handleCopy = async (messageId: string, content: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedMessageId(messageId)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-gray-500">No AI interactions yet</p>
        <p className="text-sm text-gray-400 mt-1">Ask Raven for help during your session</p>
      </div>
    )
  }

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  return (
    <div className="space-y-6">
      {messages.map((message) => (
        <div
          key={message.id}
          onMouseEnter={() => setHoveredMessageId(message.id)}
          onMouseLeave={() => setHoveredMessageId(null)}
        >
          {message.role === 'user' ? (
            <div className="flex flex-col items-end">
              <div className="max-w-[80%] bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-md">
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
              <div
                className={`mt-1 transition-opacity duration-150 ${hoveredMessageId === message.id ? 'opacity-100' : 'opacity-0'}`}
              >
                <button
                  onClick={() => handleCopy(message.id, message.content)}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors relative group"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    {copiedMessageId === message.id ? 'Copied!' : 'Copy message'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C9.5 2 7.5 3.5 6.5 5.5C5 5 3 5.5 2 7C3 8 4.5 8.5 6 8.5C6 10 6.5 11.5 7.5 12.5L4 20H6L8.5 14C9.5 15 11 16 12 16C13 16 14.5 15 15.5 14L18 20H20L16.5 12.5C17.5 11.5 18 10 18 8.5C19.5 8.5 21 8 22 7C21 5.5 19 5 17.5 5.5C16.5 3.5 14.5 2 12 2ZM12 4C13.5 4 14.78 4.83 15.5 6C14.5 6.5 13.5 7 12 7C10.5 7 9.5 6.5 8.5 6C9.22 4.83 10.5 4 12 4ZM10 10C10.55 10 11 10.45 11 11C11 11.55 10.55 12 10 12C9.45 12 9 11.55 9 11C9 10.45 9.45 10 10 10ZM14 10C14.55 10 15 10.45 15 11C15 11.55 14.55 12 14 12C13.45 12 13 11.55 13 11C13 10.45 13.45 10 14 10Z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-400">• {formatTime(message.createdAt)}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{message.content}</p>
                <button
                  onClick={() => handleCopy(message.id, message.content)}
                  className={`flex items-center gap-1 mt-2 text-xs text-gray-400 hover:text-gray-600 transition-all duration-150 ${
                    hoveredMessageId === message.id ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  {copiedMessageId === message.id ? 'Copied!' : 'Copy message'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
