import { useState, useEffect, useRef, useCallback } from 'react'
import Markdown from 'react-markdown'
import { useAskConversation, type AskFn } from '../../lib/useAskConversation'

interface AskViewProps {
  onBack: () => void
  onSessionSelect: (session: { id: string }) => void
}

function formatSourceDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AskView({ onBack, onSessionSelect }: AskViewProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const ask = useCallback<AskFn>((question, ctx) => window.raven.sessions.ask(question, ctx), [])
  const { exchanges, busy, submit } = useAskConversation(ask)

  useEffect(() => {
    // Lazily index sessions recorded before this feature existed. The embedding
    // model only loads here, when the user actually opens Ask.
    window.raven.sessions.ensureIndex().catch(() => {})
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [exchanges])

  const send = () => {
    const q = input
    setInput('')
    void submit(q)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="max-w-[820px] mx-auto w-full px-6 pt-8 pb-4 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors mb-4 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm">Back</span>
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">Ask my meetings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ask a question and Raven answers from your past sessions — all processed locally.
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-[820px] mx-auto w-full px-6 pb-6 space-y-6">
          {exchanges.length === 0 && (
            <div className="flex flex-col items-center text-center pt-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/25">
                <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Ask across all your meetings</h3>
              <p className="text-sm text-gray-500 mt-1.5 max-w-md">
                Try &quot;What did we decide about pricing?&quot; or &quot;What are my open action items?&quot;
              </p>
            </div>
          )}

          {exchanges.map((exchange) => (
            <div key={exchange.id} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 text-white px-4 py-2 text-sm">
                  {exchange.question}
                </div>
              </div>

              {exchange.loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  Searching your meetings...
                </div>
              ) : exchange.error ? (
                <p className="text-sm text-red-500">{exchange.error}</p>
              ) : (
                <div className="space-y-3">
                  <div className="text-gray-700 leading-relaxed prose prose-sm prose-gray max-w-none [&_strong]:font-semibold [&_strong]:text-gray-900 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                    <Markdown>{exchange.answer || ''}</Markdown>
                  </div>
                  {exchange.sources && exchange.sources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-gray-400">Sources:</span>
                      {exchange.sources.map((source) => (
                        <button
                          key={source.sessionId}
                          onClick={() => onSessionSelect({ id: source.sessionId })}
                          className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full px-2.5 py-1 transition-colors"
                          title={`Open "${source.title}"`}
                        >
                          <span className="max-w-[200px] truncate">{source.title}</span>
                          {source.startedAt > 0 && (
                            <span className="text-blue-400">{formatSourceDate(source.startedAt)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 bg-gradient-to-t from-white via-white to-transparent">
        <div className="max-w-[820px] mx-auto w-full px-6 py-4">
          <div className="flex items-end gap-2 rounded-2xl border border-gray-200/70 bg-white/70 backdrop-blur-xl shadow-lg shadow-gray-900/5 pl-4 pr-2 py-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask about your past meetings..."
              rows={1}
              className="flex-1 bg-transparent resize-none max-h-32 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Ask"
              className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center shadow-sm hover:from-blue-400 hover:to-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? (
                <div className="w-4 h-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
