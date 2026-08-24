import { useState, useRef, useCallback } from 'react'

export interface QaSource {
  sessionId: string
  title: string
  startedAt: number
}

export interface AskExchange {
  id: string
  question: string
  answer?: string
  sources?: QaSource[]
  error?: string
  loading: boolean
}

export interface AskResponse {
  answer?: string
  sources?: QaSource[]
  summary?: string
  foldedCount?: number
  error?: string
}

export type AskFn = (
  question: string,
  ctx: { summary: string; recent: Array<{ question: string; answer: string }> },
  onToken: (text: string) => void,
) => Promise<AskResponse>

/** Min gap between partial saves while an answer streams in. */
const PARTIAL_PERSIST_MS = 700

/**
 * Serializable conversation state persisted between app launches. The DB
 * treats this as an opaque blob (see database migration 018); the shape is
 * owned here so persistence needs no schema changes as it evolves.
 */
export interface AskConversationState {
  exchanges: AskExchange[]
  summary: string
  summarizedUpTo: number
}

export interface UseAskConversationOptions {
  /** Hydrate a saved conversation. Read once at mount — switch conversations
   *  by remounting with a new React `key`, not by changing this prop. */
  initial?: AskConversationState | null
  /** Called after each completed turn with the full serializable state so the
   *  caller can persist it (per-session row, or a standalone thread). */
  onPersist?: (state: AskConversationState) => void
}

export function sanitizeInitialExchanges(exchanges: AskExchange[] | undefined): AskExchange[] {
  if (!Array.isArray(exchanges)) return []
  // A persisted conversation can never have an in-flight turn; force loading
  // off so a crash mid-answer doesn't restore a permanent spinner.
  return exchanges.map((e) => ({ ...e, loading: false }))
}

/**
 * Drives an Ask conversation with compounding memory. The renderer holds the
 * running summary + how many answered turns have been folded into it; each ask
 * sends {summary, recent-unsummarized-turns}. When the backend folds overflow
 * turns into the summary, it returns the updated summary + foldedCount, which
 * we persist here. Older context is never dropped — only compacted.
 *
 * Optionally hydrates from a saved conversation and reports state changes via
 * onPersist so the caller can store the thread.
 */
export function useAskConversation(ask: AskFn, opts: UseAskConversationOptions = {}) {
  const { initial, onPersist } = opts
  // exchangesRef is the source of truth so we can persist a deterministic
  // snapshot right after each mutation without racing React's batched state.
  const exchangesRef = useRef<AskExchange[]>(sanitizeInitialExchanges(initial?.exchanges))
  const [exchanges, setExchangesState] = useState<AskExchange[]>(exchangesRef.current)
  const [busy, setBusy] = useState(false)
  const summaryRef = useRef(initial?.summary ?? '')
  const summarizedUpToRef = useRef(initial?.summarizedUpTo ?? 0)
  const onPersistRef = useRef(onPersist)
  onPersistRef.current = onPersist

  const commit = useCallback((next: AskExchange[]) => {
    exchangesRef.current = next
    setExchangesState(next)
  }, [])

  const persist = useCallback(() => {
    // Persist the whole conversation, including an in-flight turn (coerced to
    // loading:false so a reload never shows a stuck spinner). Persisting the
    // question up front + partials means navigating away mid-answer never
    // loses the turn — the answer keeps generating in main and its completion
    // is saved even after this component unmounts.
    const snapshot: AskConversationState = {
      exchanges: exchangesRef.current.map((e) => ({ ...e, loading: false })),
      summary: summaryRef.current,
      summarizedUpTo: summarizedUpToRef.current,
    }
    onPersistRef.current?.(snapshot)
  }, [])

  const submit = useCallback(
    async (raw: string) => {
      const question = raw.trim()
      if (!question || busy) return

      const completed = exchangesRef.current
        .filter((e) => e.answer)
        .map((e) => ({ question: e.question, answer: e.answer as string }))
      const recent = completed.slice(summarizedUpToRef.current)

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setBusy(true)
      commit([...exchangesRef.current, { id, question, loading: true }])
      // Save the question immediately so a fast navigate-away can't lose it.
      persist()

      let lastPartialPersist = Date.now()
      try {
        const res = await ask(question, { summary: summaryRef.current, recent }, (text) => {
          // Stream: append each delta and drop the spinner on the first token.
          commit(
            exchangesRef.current.map((e) =>
              e.id === id ? { ...e, loading: false, answer: (e.answer || '') + text } : e,
            ),
          )
          const now = Date.now()
          if (now - lastPartialPersist > PARTIAL_PERSIST_MS) {
            lastPartialPersist = now
            persist()
          }
        })
        // Persist the compounded summary so the next turn keeps earlier context.
        if (res && typeof res.foldedCount === 'number' && res.foldedCount > 0 && typeof res.summary === 'string') {
          summaryRef.current = res.summary
          summarizedUpToRef.current += res.foldedCount
        }
        // Prefer the authoritative full answer; fall back to the streamed text.
        const streamed = exchangesRef.current.find((e) => e.id === id)?.answer
        const finalAnswer = res?.answer ?? streamed
        commit(
          exchangesRef.current.map((e) =>
            e.id === id
              ? {
                  ...e,
                  loading: false,
                  answer: finalAnswer,
                  sources: res?.sources,
                  error: finalAnswer ? undefined : res?.error || 'Could not answer that question.',
                }
              : e,
          ),
        )
        persist()
      } catch {
        commit(
          exchangesRef.current.map((e) =>
            e.id === id ? { ...e, loading: false, error: 'Could not answer that question.' } : e,
          ),
        )
        persist()
      } finally {
        setBusy(false)
      }
    },
    [ask, busy, commit, persist],
  )

  return { exchanges, busy, submit }
}
