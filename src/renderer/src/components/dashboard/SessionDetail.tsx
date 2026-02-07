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
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const titleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
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

  const handleTitleBlur = () => {
    setIsEditingTitle(false)
    if (editedTitle.trim() && editedTitle !== session.title) {
      onUpdateTitle?.(session.id, editedTitle.trim())
    } else {
      setEditedTitle(session.title)
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
      if (newValue.length <= MAX_TITLE_LENGTH) {
        setEditedTitle(newValue)
      } else {
        titleRef.current.innerText = newValue.slice(0, MAX_TITLE_LENGTH)
        setEditedTitle(newValue.slice(0, MAX_TITLE_LENGTH))
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-10 pt-8 pb-6">
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
          className="relative max-w-2xl"
          onMouseEnter={() => !isEditingTitle && setShowTitleTooltip(true)}
          onMouseLeave={() => setShowTitleTooltip(false)}
        >
          {isEditingTitle ? (
            <div
              ref={titleRef}
              contentEditable
              onInput={handleTitleChange}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              suppressContentEditableWarning
              className="text-3xl font-semibold text-gray-900 cursor-text border border-transparent rounded-lg break-words px-2 py-1 -mx-2 tracking-normal outline-none"
              style={{
                lineHeight: '1.2',
                fontKerning: 'auto',
                textRendering: 'optimizeLegibility',
                minHeight: '1.2em',
              }}
            >
              {editedTitle}
            </div>
          ) : (
            <h1
              onClick={handleTitleClick}
              className="text-3xl font-semibold text-gray-900 cursor-text border border-transparent hover:border-gray-300 rounded-lg px-2 py-1 -mx-2 transition-colors break-words tracking-normal"
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
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap z-10">
              Click to edit title
            </div>
          )}
        </div>
      </div>

      <div className="px-10 mb-6">
        <div className="inline-flex rounded-lg border border-gray-200 p-1">
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'summary'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('transcript')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'transcript'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Transcript
          </button>
          <button
            onClick={() => setActiveTab('usage')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'usage'
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Usage
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 pb-8">
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
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 flex-shrink-0" />
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
              utterance.speaker === 'You' ? 'text-cyan-600' : 'text-gray-500'
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
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
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
        <div key={message.id}>
          {message.role === 'user' ? (
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-blue-600 text-white px-4 py-3 rounded-2xl rounded-br-md">
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-400">• {formatTime(message.createdAt)}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{message.content}</p>
                <button
                  onClick={() => navigator.clipboard.writeText(message.content)}
                  className="flex items-center gap-1 mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy message
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
