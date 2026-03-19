import { useState, useRef, useEffect, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import ravenLogo from '../../../../../logo/raven.svg'
import { useAppMode } from '../../hooks/useAppMode'
import { createLogger } from '../../lib/logger'

const log = createLogger('SessionDetail')

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
  insightsJson?: string | null
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

type Tab = 'summary' | 'transcript' | 'usage' | 'insights'

const MAX_TITLE_LENGTH = 200

export function SessionDetail({ session, onBack, onUpdateTitle }: SessionDetailProps) {
  const { isPro } = useAppMode()
  const [activeTab, setActiveTab] = useState<Tab>('summary')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState(session.title)
  const [showTitleTooltip, setShowTitleTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [copySuccess, setCopySuccess] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [tabDimensions, setTabDimensions] = useState({
    summary: { left: 0, width: 0 },
    transcript: { left: 0, width: 0 },
    usage: { left: 0, width: 0 },
    insights: { left: 0, width: 0 },
  })
  const [messages, setMessages] = useState<SessionMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const titleRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const summaryTabRef = useRef<HTMLButtonElement>(null)
  const transcriptTabRef = useRef<HTMLButtonElement>(null)
  const usageTabRef = useRef<HTMLButtonElement>(null)
  const insightsTabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    window.raven.storeGet('displayName').then((name) => {
      setDisplayName((name as string) || '')
    }).catch(() => {})
  }, [])

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
          insights: insightsTabRef.current
            ? { left: insightsTabRef.current.offsetLeft, width: insightsTabRef.current.offsetWidth }
            : { left: 0, width: 0 },
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
      log.error('Failed to copy:', err)
    }
  }

  const userName = displayName || 'You'
  const transcriptText = session.transcript
    .map((entry) => `${entry.source === 'mic' ? userName : 'Them'}: ${entry.text}`)
    .join('\n')
  const hasTranscript = transcriptText.trim().length > 0

  const loadMessages = async () => {
    setLoadingMessages(true)
    try {
      const msgs = await window.raven.sessions.getMessages(session.id)
      setMessages(msgs)
    } catch (error) {
      log.error('Failed to load messages:', error)
    }
    setLoadingMessages(false)
  }

  const getCopyText = () => {
    if (activeTab === 'summary') return session.summary || ''
    if (activeTab === 'transcript') return transcriptText
    if (activeTab === 'usage') {
      return messages
        .map((message) => `${message.role === 'user' ? userName : 'Raven'}: ${message.content}`)
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
            ) : session.title === 'Untitled Session' && hasTranscript ? (
              <div className="px-2 py-1 -mx-2">
                <div className="h-7 bg-gray-200 rounded w-[60%] animate-pulse" />
              </div>
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
            {isPro && (
              <button
                ref={insightsTabRef}
                onClick={() => setActiveTab('insights')}
                className={`relative z-10 px-5 py-1.5 text-sm font-medium rounded-full transition-colors duration-200 ${
                  activeTab === 'insights'
                    ? 'text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Insights
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 h-0 relative">
          <div ref={scrollContainerRef} className="h-full overflow-y-auto">
            <div className="max-w-[900px] mx-auto w-full px-6 pb-16">
              {(hasTranscript || (activeTab === 'usage' && messages.length > 0)) &&
                !(activeTab === 'summary' && !session.summary && hasTranscript) && (
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
                <SummaryTab summary={session.summary} hasTranscript={hasTranscript} sessionId={session.id} />
              )}
              {activeTab === 'transcript' && (
                <TranscriptTab transcript={session.transcript} displayName={displayName} />
              )}
              {activeTab === 'usage' && (
                <UsageTab messages={messages} loading={loadingMessages} />
              )}
              {activeTab === 'insights' && (
                <InsightsTab sessionId={session.id} transcript={transcriptText} hasTranscript={hasTranscript} savedInsights={session.insightsJson ?? null} />
              )}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
      </div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className="space-y-6 max-w-3xl animate-pulse">
      <p className="text-sm text-gray-400 mb-4">Generating summary...</p>
      <div>
        <div className="h-5 bg-gray-200 rounded w-2/5 mb-4" />
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-200 mt-2 flex-shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-[90%]" />
          </div>
          <div className="flex items-start gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-200 mt-2 flex-shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-[75%]" />
          </div>
          <div className="flex items-start gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-200 mt-2 flex-shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-[85%]" />
          </div>
        </div>
      </div>
      <div>
        <div className="h-5 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-200 mt-2 flex-shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-[80%]" />
          </div>
          <div className="flex items-start gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-200 mt-2 flex-shrink-0" />
            <div className="h-4 bg-gray-200 rounded w-[60%]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryTab({ summary, hasTranscript, sessionId }: { summary: string | null; hasTranscript: boolean; sessionId: string }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(summary || '')
  const [savedSummary, setSavedSummary] = useState(summary)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSavedSummary(summary)
    setEditText(summary || '')
  }, [summary])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
    }
  }, [editing])

  const handleSave = async (text: string) => {
    if (text === savedSummary) return
    setSavedSummary(text)
    try {
      await window.raven.sessions.update(sessionId, { summary: text })
    } catch (err) {
      console.error('Failed to save summary:', err)
    }
  }

  const handleChange = (text: string) => {
    setEditText(text)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => handleSave(text), 1000)
  }

  if (!savedSummary && hasTranscript && !editing) {
    return <SummarySkeleton />
  }

  if (editing) {
    return (
      <div className="max-w-3xl">
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            handleSave(editText)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleSave(editText)
              setEditing(false)
            }
          }}
          className="w-full min-h-[400px] p-4 text-sm text-gray-700 leading-relaxed border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 resize-y font-mono"
          placeholder="Write your notes here..."
        />
        <p className="text-xs text-gray-400 mt-2">Markdown supported. Auto-saves as you type. Press Escape or click outside to exit.</p>
      </div>
    )
  }

  if (!savedSummary || !hasTranscript) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-gray-400 text-lg hover:text-gray-500 transition-colors cursor-text"
      >
        Write your notes here...
      </button>
    )
  }

  const sections = parseSummary(savedSummary)

  return (
    <div
      className="space-y-6 max-w-3xl cursor-text group"
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      <div className="flex items-center justify-between mb-2">
        <div />
        <button
          onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          className="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-blue-500 transition-all flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          Edit
        </button>
      </div>
      {sections.map((section, index) => (
        <div key={index}>
          {section.heading && (
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              {section.heading.replace(/\*\*/g, '')}
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

function TranscriptTab({ transcript, displayName }: { transcript: TranscriptEntry[]; displayName: string }) {
  if (!transcript || transcript.length === 0) {
    return <p className="text-gray-400 text-lg">No transcript available</p>
  }

  const userName = displayName || 'You'
  const utterances = parseTranscript(transcript, userName)

  return (
    <div className="space-y-4">
      {utterances.map((utterance, index) => (
        <div key={index}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-sm font-medium ${
              utterance.isUser ? 'text-blue-600' : 'text-gray-500'
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

    const headingMatch = trimmed.match(/^##\s+(.+)$/) || trimmed.match(/^\*\*(.+?)\*\*\s*:?\s*$/)

    if (headingMatch) {
      if (currentSection.content || currentSection.items.length > 0 || currentSection.heading) {
        sections.push(currentSection)
      }
      currentSection = { heading: headingMatch[1], content: '', items: [] }
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
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
  isUser: boolean
  timestamp?: string
  text: string
}

function parseTranscript(transcript: TranscriptEntry[], userName: string): Utterance[] {
  return transcript
    .filter((entry) => entry.text && entry.text.trim())
    .map((entry) => ({
      speaker: entry.source === 'mic' ? userName : 'Them',
      isUser: entry.source === 'mic',
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

interface ParsedInsights {
  sentiment: unknown
  topics: unknown
  keyPhrases: unknown
}

function stripCodeFences(s: string): string {
  return s.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}

function tryParseJson(val: unknown): unknown {
  if (!val) return null
  if (typeof val !== 'string') return val
  try {
    return JSON.parse(stripCodeFences(val))
  } catch {
    return val
  }
}

function parseInsightsJson(raw: string): ParsedInsights | null {
  try {
    const data = JSON.parse(raw)
    const parsed = {
      sentiment: tryParseJson(data.sentiment),
      topics: tryParseJson(data.topics),
      keyPhrases: tryParseJson(data.keyPhrases),
    }
    if (!parsed.sentiment && !parsed.topics && !parsed.keyPhrases) return null
    return parsed
  } catch { return null }
}

function formatSentiment(raw: string): string {
  if (!raw) return 'Unknown'
  let s = raw
  const toIdx = s.toLowerCase().indexOf('to_')
  if (toIdx > 0) s = s.slice(toIdx + 3)
  return s
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

function sentimentColor(raw: string): string {
  const s = raw?.toLowerCase() || ''
  if (s.includes('positive')) return 'text-green-700 bg-green-50 border-green-200'
  if (s.includes('negative')) return 'text-red-700 bg-red-50 border-red-200'
  return 'text-amber-700 bg-amber-50 border-amber-200'
}

function sentimentDot(raw: string): string {
  const s = raw?.toLowerCase() || ''
  if (s.includes('positive')) return 'bg-green-500'
  if (s.includes('negative')) return 'bg-red-500'
  return 'bg-amber-500'
}

function SentimentCard({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const overall = d.overall_sentiment as Record<string, unknown> | undefined
  const shifts = d.key_sentiment_shifts as Array<Record<string, string>> | undefined
  const speakers = d.per_speaker_sentiment as Record<string, unknown> | undefined

  return (
    <div className="space-y-5">
      {overall && (
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${sentimentColor(overall.sentiment as string)}`}>
            {formatSentiment(overall.sentiment as string)}
          </span>
          {typeof overall.confidence_score === 'number' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Confidence</span>
              <div className="h-2 bg-gray-100 rounded-full w-24">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${overall.confidence_score * 100}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-600">{Math.round(overall.confidence_score * 100)}%</span>
            </div>
          )}
        </div>
      )}
      {typeof overall?.reasoning === 'string' && (
        <p className="text-sm text-gray-600 leading-relaxed">{overall.reasoning}</p>
      )}
      {shifts && shifts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Sentiment Shifts</h4>
          <div className="space-y-3">
            {shifts.map((shift, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center pt-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${sentimentDot(shift.sentiment)}`} />
                  {i < shifts.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-gray-900">{shift.moment}</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${sentimentColor(shift.sentiment)}`}>
                      {formatSentiment(shift.sentiment)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{shift.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {speakers && Object.keys(speakers).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Per Speaker</h4>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(speakers).map(([name, info]) => {
              const s = info as Record<string, unknown>
              return (
                <div key={name} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-sm font-semibold text-gray-800 mb-1.5">{name}</p>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${sentimentColor(s.sentiment as string)}`}>
                    {formatSentiment(s.sentiment as string)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TopicsCard({ data }: { data: unknown }) {
  if (!Array.isArray(data)) return null
  return (
    <div className="space-y-3">
      {data.map((topic, i) => {
        const t = topic as Record<string, unknown>
        const pct = t.approximate_duration_percent as number | undefined
        return (
          <div key={i} className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-semibold text-gray-800">{t.topic as string}</h4>
              {pct != null && <span className="text-xs text-gray-400">{pct}% of meeting</span>}
            </div>
            <p className="text-xs text-gray-600">{t.description as string}</p>
            {pct != null && (
              <div className="mt-2 h-1.5 bg-gray-200 rounded-full">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function KeyPhrasesCard({ data }: { data: unknown }) {
  if (!Array.isArray(data)) return null
  return (
    <div className="flex flex-wrap gap-2">
      {data.map((phrase, i) => (
        <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-full">
          {typeof phrase === 'string' ? phrase : JSON.stringify(phrase)}
        </span>
      ))}
    </div>
  )
}

function InsightsTab({ sessionId, transcript, hasTranscript, savedInsights }: { sessionId: string; transcript: string; hasTranscript: boolean; savedInsights: string | null }) {
  const [insights, setInsights] = useState<ParsedInsights | null>(() => savedInsights ? parseInsightsJson(savedInsights) : null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!hasTranscript) return
    setIsAnalyzing(true)
    setError(null)

    try {
      const result = await window.raven.proxyAnalyzeSession({
        transcript,
        features: ['sentiment', 'topics', 'key_phrases'],
        sessionId,
      })

      console.log('[Insights] Result:', JSON.stringify(result)?.slice(0, 200))

      if (!result) {
        setError('Empty response from server')
        setIsAnalyzing(false)
        return
      }
      if (result?.error) {
        setError(result.error as string)
      } else {
        const rawInsights = {
          sentiment: result.sentiment || null,
          topics: result.topics || null,
          keyPhrases: result.keyPhrases || null,
        }
        console.log('[Insights] Parsed:', Object.keys(rawInsights).map(k => `${k}: ${rawInsights[k as keyof typeof rawInsights] ? 'yes' : 'no'}`).join(', '))
        const hasAny = Object.values(rawInsights).some(v => v !== null)
        if (hasAny) {
          const insightsStr = JSON.stringify(rawInsights)
          try {
            await window.raven.sessions.update(sessionId, { insightsJson: insightsStr } as Record<string, unknown>)
          } catch (saveErr) {
            console.warn('[Insights] Failed to save:', saveErr)
          }
          const parsed = parseInsightsJson(insightsStr)
          console.log('[Insights] Parsed result:', parsed ? 'valid' : 'null')
          setInsights(parsed)
        } else {
          setError('No insights generated. The transcript may be too short or unclear.')
        }
      }
    } catch (err) {
      console.error('[Insights] Error:', err)
      setError(err instanceof Error ? err.message : 'Analysis failed')
    }

    setIsAnalyzing(false)
  }

  if (!hasTranscript) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-lg">No transcript to analyze</p>
        <p className="text-sm text-gray-400 mt-1">Record a session first</p>
      </div>
    )
  }

  if (!insights) {
    return (
      <div className="text-center py-12">
        <div className="mb-4">
          <svg className="w-12 h-12 mx-auto text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </div>
        <h3 className="text-gray-900 font-medium mb-2">AI-Powered Meeting Insights</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
          Generate sentiment analysis, topic detection, and key phrases from your meeting transcript.
        </p>
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            'Generate Insights'
          )}
        </button>
        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-3xl">
      {insights.sentiment != null && (
        <div className="border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Sentiment Analysis
          </h3>
          <SentimentCard data={insights.sentiment} />
        </div>
      )}

      {insights.topics != null && (
        <div className="border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            Topics Discussed
          </h3>
          <TopicsCard data={insights.topics} />
        </div>
      )}

      {insights.keyPhrases != null && (
        <div className="border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
            Key Phrases
          </h3>
          <KeyPhrasesCard data={insights.keyPhrases} />
        </div>
      )}

      <div className="pt-1">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className="text-sm text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
        >
          {isAnalyzing ? 'Re-analyzing...' : 'Re-analyze'}
        </button>
      </div>
    </div>
  )
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
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center">
                <img src={ravenLogo} alt="Raven" className="w-4 h-4" draggable={false} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-400">• {formatTime(message.createdAt)}</span>
                </div>
                <div className="text-gray-700 leading-relaxed prose prose-sm prose-gray max-w-none [&_strong]:font-semibold [&_strong]:text-gray-900 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                  <Markdown>{message.content}</Markdown>
                </div>
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
