import { useState, useEffect, useRef, useCallback } from 'react'
import Markdown from 'react-markdown'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import {
  useAskConversation,
  type AskFn,
  type AskConversationState,
} from '../../lib/useAskConversation'

interface AskViewProps {
  onBack: () => void
  onSessionSelect: (session: { id: string }) => void
}

interface ConversationMeta {
  id: string
  title: string
  updatedAt: number
}

function formatSourceDate(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** First question, trimmed, as the auto-title for a new thread. */
function deriveTitle(state: AskConversationState): string {
  const first = state.exchanges.find((e) => e.question?.trim())?.question?.trim() ?? ''
  const t = first.replace(/\s+/g, ' ').slice(0, 48)
  return t || 'New chat'
}

export function AskView({ onBack, onSessionSelect }: AskViewProps) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  // undefined = loading the selected thread; null = empty (new) thread.
  const [activeInitial, setActiveInitial] = useState<AskConversationState | null | undefined>(undefined)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  // Ids known to exist in the DB. A brand-new chat only gets created on its
  // first persisted turn, so we don't litter the sidebar with empty threads.
  const createdRef = useRef<Set<string>>(new Set())

  const refreshList = useCallback(async (): Promise<ConversationMeta[]> => {
    try {
      const list = await window.raven.askConversations.list()
      setConversations(list)
      list.forEach((c) => createdRef.current.add(c.id))
      return list
    } catch {
      return []
    }
  }, [])

  const openConversation = useCallback(async (id: string) => {
    setActiveInitial(undefined)
    setActiveId(id)
    try {
      const conv = await window.raven.askConversations.get(id)
      setActiveInitial(conv?.state ?? null)
    } catch {
      setActiveInitial(null)
    }
  }, [])

  const startNewChat = useCallback(() => {
    const id = globalThis.crypto.randomUUID()
    setActiveId(id)
    setActiveInitial(null)
  }, [])

  useEffect(() => {
    // Lazily index sessions recorded before this feature existed. The embedding
    // model only loads here, when the user actually opens Ask.
    window.raven.sessions.ensureIndex().catch(() => {})
    void (async () => {
      const list = await refreshList()
      if (list.length > 0) {
        await openConversation(list[0].id)
      } else {
        startNewChat()
      }
    })()
  }, [refreshList, openConversation, startNewChat])

  const handlePersist = useCallback(
    async (state: AskConversationState) => {
      const id = activeId
      if (!id) return
      try {
        if (!createdRef.current.has(id)) {
          // First turn of a new chat: materialize it, auto-titled.
          await window.raven.askConversations.create(id, deriveTitle(state))
          createdRef.current.add(id)
        }
        await window.raven.askConversations.save(id, { state })
        await refreshList()
      } catch {
        // Persistence is best-effort; the in-memory chat still works.
      }
    },
    [activeId, refreshList],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await window.raven.askConversations.delete(id)
      } catch {
        // ignore
      }
      createdRef.current.delete(id)
      const list = await refreshList()
      if (id === activeId) {
        if (list.length > 0) await openConversation(list[0].id)
        else startNewChat()
      }
    },
    [activeId, refreshList, openConversation, startNewChat],
  )

  const commitRename = useCallback(
    async (id: string) => {
      const title = renameText.trim().slice(0, 80)
      setRenamingId(null)
      if (!title) return
      try {
        await window.raven.askConversations.rename(id, title)
        await refreshList()
      } catch {
        // ignore
      }
    },
    [renameText, refreshList],
  )

  const showEmptyActiveInSidebar = activeId != null && !createdRef.current.has(activeId)

  return (
    <div className="h-full flex overflow-hidden">
      <aside className="w-64 shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/40">
        <div className="px-3 pt-4 pb-2 shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-600 transition-colors mb-3 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Back</span>
          </button>
          <button
            onClick={startNewChat}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
          >
            <Plus size={16} />
            New chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3 space-y-0.5">
          {showEmptyActiveInSidebar && (
            <div className="flex items-center px-3 py-2 rounded-lg text-sm bg-blue-50 text-blue-700 font-medium">
              <span className="truncate">New chat</span>
            </div>
          )}
          {conversations.map((c) => {
            const active = c.id === activeId
            if (renamingId === c.id) {
              return (
                <div key={c.id} className="flex items-center gap-1 px-2 py-1">
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename(c.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    className="flex-1 min-w-0 text-sm px-2 py-1 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button onClick={() => void commitRename(c.id)} className="p-1 text-green-600 hover:text-green-700" aria-label="Save name">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setRenamingId(null)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Cancel rename">
                    <X size={14} />
                  </button>
                </div>
              )
            }
            return (
              <div
                key={c.id}
                className={`group flex items-center gap-1 pl-3 pr-1.5 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                  active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                }`}
                onClick={() => { if (c.id !== activeId) void openConversation(c.id) }}
              >
                <span className="flex-1 min-w-0 truncate" title={c.title}>{c.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setRenamingId(c.id); setRenameText(c.title) }}
                  className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Rename "${c.title}"`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void handleDelete(c.id) }}
                  className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Delete "${c.title}"`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="px-6 pt-6 pb-3 shrink-0 border-b border-gray-50">
          <h1 className="text-xl font-semibold text-gray-900">Ask my meetings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Answered locally from your past sessions. Only your own model call leaves your device.
          </p>
        </div>
        {activeInitial === undefined || activeId == null ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <AskChat
            key={activeId}
            initial={activeInitial}
            onPersist={handlePersist}
            onSessionSelect={onSessionSelect}
          />
        )}
      </main>
    </div>
  )
}

function AskChat({
  initial,
  onPersist,
  onSessionSelect,
}: {
  initial: AskConversationState | null
  onPersist: (state: AskConversationState) => void
  onSessionSelect: (session: { id: string }) => void
}) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const ask = useCallback<AskFn>(
    (question, ctx, onToken) => window.raven.sessions.askStream('all', null, question, ctx, onToken),
    [],
  )
  const { exchanges, busy, submit } = useAskConversation(ask, { initial, onPersist })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exchanges])

  const send = () => {
    const q = input
    setInput('')
    void submit(q)
  }

  const hasExchanges = exchanges.length > 0

  const inputBar = (
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
  )

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-[820px] mx-auto w-full px-6 pt-6 pb-6 space-y-6">
          {!hasExchanges && (
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
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 bg-gradient-to-t from-white via-white to-transparent">
        <div className="max-w-[820px] mx-auto w-full px-6 py-4">{inputBar}</div>
      </div>
    </div>
  )
}
