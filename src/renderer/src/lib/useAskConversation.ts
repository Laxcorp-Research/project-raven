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
) => Promise<AskResponse>

/**
 * Drives an Ask conversation with compounding memory. The renderer holds the
 * running summary + how many answered turns have been folded into it; each ask
 * sends {summary, recent-unsummarized-turns}. When the backend folds overflow
 * turns into the summary, it returns the updated summary + foldedCount, which
 * we persist here. Older context is never dropped — only compacted.
 */
export function useAskConversation(ask: AskFn) {
  const [exchanges, setExchanges] = useState<AskExchange[]>([])
  const [busy, setBusy] = useState(false)
  const summaryRef = useRef('')
  const summarizedUpToRef = useRef(0)

  const submit = useCallback(
    async (raw: string) => {
      const question = raw.trim()
      if (!question || busy) return

      const completed = exchanges
        .filter((e) => e.answer)
        .map((e) => ({ question: e.question, answer: e.answer as string }))
      const recent = completed.slice(summarizedUpToRef.current)

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setBusy(true)
      setExchanges((prev) => [...prev, { id, question, loading: true }])

      try {
        const res = await ask(question, { summary: summaryRef.current, recent })
        // Persist the compounded summary so the next turn keeps earlier context.
        if (res && typeof res.foldedCount === 'number' && res.foldedCount > 0 && typeof res.summary === 'string') {
          summaryRef.current = res.summary
          summarizedUpToRef.current += res.foldedCount
        }
        setExchanges((prev) =>
          prev.map((e) =>
            e.id === id
              ? {
                  ...e,
                  loading: false,
                  answer: res?.answer,
                  sources: res?.sources,
                  error: res?.answer ? undefined : res?.error || 'Could not answer that question.',
                }
              : e,
          ),
        )
      } catch {
        setExchanges((prev) =>
          prev.map((e) => (e.id === id ? { ...e, loading: false, error: 'Could not answer that question.' } : e)),
        )
      } finally {
        setBusy(false)
      }
    },
    [ask, busy, exchanges],
  )

  return { exchanges, busy, submit }
}
