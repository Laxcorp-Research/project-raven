/**
 * Ask-my-meetings: local Q&A across all indexed session transcripts.
 *
 * Retrieval is fully local (on-device embeddings via ragService); only the
 * final answer generation calls the user's own notes model. Answers cite the
 * source session(s). Chunks are cached in memory and invalidated when the
 * index changes (new session indexed, or a session deleted).
 */

import { databaseService } from './database'
import { embedText, cosineSimilarity } from './ragService'
import { getNotesProvider } from './ai/providerFactory'
import {
  SESSION_QA_TOP_K,
  SESSION_QA_MAX_CONTEXT_TOKENS,
  SESSION_QA_MAX_TOKENS,
  SESSION_SCOPED_QA_TRANSCRIPT_SLICE,
  SESSION_QA_HISTORY_MAX_CHARS,
  SESSION_QA_SUMMARY_MAX_TOKENS,
  SESSION_QA_SUMMARY_INPUT_SLICE,
} from '../constants'
import { createLogger } from '../logger'

const log = createLogger('SessionQA')

interface ParsedChunk {
  sessionId: string
  chunkText: string
  embedding: number[]
}

let cache: ParsedChunk[] | null = null

export function invalidateSessionQaCache(): void {
  cache = null
}

function getChunks(): ParsedChunk[] {
  if (cache) return cache
  const rows = databaseService.getAllSessionChunks()
  const parsed: ParsedChunk[] = []
  for (const row of rows) {
    try {
      parsed.push({
        sessionId: row.sessionId,
        chunkText: row.chunkText,
        embedding: JSON.parse(row.embeddingJson) as number[],
      })
    } catch (err) {
      log.warn('Skipping corrupted session chunk embedding', err)
    }
  }
  cache = parsed
  return parsed
}

export interface QaSource {
  sessionId: string
  title: string
  startedAt: number
}

export interface QaContext {
  index: number
  title: string
  date: string
  text: string
}

export function buildQaPrompt(
  question: string,
  contexts: QaContext[],
  recent: QaTurn[] = [],
  summary = '',
): string {
  const blocks = contexts
    .map((c) => `[${c.index}] (from "${c.title}", ${c.date}):\n${c.text}`)
    .join('\n\n')

  return `You are the user's sharp, candid thinking partner, discussing their past meetings with them. Use the excerpts below (retrieved from their meeting history) as your source of truth.

How to respond:
- Actually engage and give a real, specific answer — analysis, sentiment, what happened — grounded in the excerpts.
- Cite the meeting(s) you drew from inline, like [1] or [2].
- Don't invent specific facts, names, numbers, or dates that aren't in the excerpts. If the excerpts genuinely don't cover the question, say you could not find it in their meetings.
- Talk like a person, not a report. Be concise but substantive.

MEETING EXCERPTS:
${blocks}${conversationBlock(summary, recent)}

QUESTION: ${question}`
}

// ── Single-session Q&A ───────────────────────────────────────────────
// For one session the whole transcript usually fits the context window, so we
// feed it directly rather than retrieving chunks — simpler and more accurate.

export interface QaTurn {
  question: string
  answer: string
}

function conversationBlock(summary: string, recent: QaTurn[]): string {
  const parts: string[] = []
  if (summary.trim()) {
    parts.push(`EARLIER IN THIS CONVERSATION (summary of older messages):\n${summary.trim()}`)
  }
  if (recent.length) {
    const turns = recent.map((turn) => `User: ${turn.question}\nYou: ${turn.answer}`).join('\n\n')
    parts.push(`RECENT MESSAGES:\n${turns}`)
  }
  return parts.length ? `\n\n${parts.join('\n\n')}` : ''
}

/**
 * Keep the most recent turns that fit within a character budget (walking from
 * newest to oldest), returned in chronological order. Bounds prompt size for
 * long chats without an arbitrary turn cap. The newest turn is always kept even
 * if it alone exceeds the budget, so a single long exchange is never dropped.
 */
export function budgetHistory(history: QaTurn[], maxChars = SESSION_QA_HISTORY_MAX_CHARS): QaTurn[] {
  const kept: QaTurn[] = []
  let used = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i]
    const size = turn.question.length + turn.answer.length
    if (kept.length > 0 && used + size > maxChars) break
    kept.unshift(turn)
    used += size
  }
  return kept
}

type NotesProvider = Awaited<ReturnType<typeof getNotesProvider>>

/** Conversation context carried into an Ask call: a running summary of older
 * turns plus the recent turns not yet folded into it. */
export interface AskContext {
  summary?: string
  recent?: QaTurn[]
}

/**
 * Fold older turns into the running summary (ChatGPT/Claude-style memory): the
 * prior summary plus the turns being retired are merged into an updated
 * summary, so earlier context is never dropped — only compacted. Best-effort:
 * on failure it returns the prior summary unchanged (recent turns still carry
 * context), so a summarization hiccup never breaks an answer.
 */
export async function summarizeConversation(
  provider: NotesProvider,
  priorSummary: string,
  turns: QaTurn[],
): Promise<string> {
  if (!turns.length) return priorSummary
  const text = turns.map((t) => `User: ${t.question}\nAssistant: ${t.answer}`).join('\n\n')
  const prompt = `You are maintaining a running memory of a Q&A conversation so it can continue without losing context. Merge the PRIOR SUMMARY and the NEW MESSAGES into one updated summary. Preserve everything that could matter later: what the user asked, what was established, and specific names, numbers, decisions, and conclusions. Output ONLY the updated summary.

PRIOR SUMMARY:
${priorSummary.trim() || '(none yet)'}

NEW MESSAGES:
${text.slice(-SESSION_QA_SUMMARY_INPUT_SLICE)}`
  try {
    const out = await provider.generateShort({ prompt, maxTokens: SESSION_QA_SUMMARY_MAX_TOKENS })
    return out.trim() || priorSummary
  } catch (err) {
    log.warn('Conversation summarization failed; keeping prior summary', err)
    return priorSummary
  }
}

/**
 * Split the unsummarized recent turns into {kept verbatim, folded into summary}.
 * Only the overflow beyond the recent-char budget is folded, so short chats do
 * no extra work and long chats compound their summary instead of dropping.
 */
export async function compactForAsk(
  provider: NotesProvider,
  priorSummary: string,
  recent: QaTurn[],
): Promise<{ summary: string; recent: QaTurn[]; foldedCount: number }> {
  const kept = budgetHistory(recent, SESSION_QA_HISTORY_MAX_CHARS)
  if (kept.length === recent.length) {
    return { summary: priorSummary, recent: kept, foldedCount: 0 }
  }
  const toFold = recent.slice(0, recent.length - kept.length)
  const summary = await summarizeConversation(provider, priorSummary, toFold)
  return { summary, recent: kept, foldedCount: toFold.length }
}

export function buildSessionScopedQaPrompt(
  question: string,
  transcript: string,
  recent: QaTurn[] = [],
  summary = '',
): string {
  return `You are the user's sharp, candid thinking partner. You have carefully read the meeting transcript below and you talk with them about it like a trusted colleague would — naturally, specifically, and honestly.

How to respond:
- Actually engage with what they're asking. Give your real read: what happened, how it landed, the sentiment and subtext between the lines, what was strong, what was weak, and what they may have missed. Point to concrete moments.
- For evaluative questions like "how did I do?", give an honest assessment — strengths and weaknesses both — grounded in the transcript: the questions asked, how they were answered, and how the other participant reacted. Do not hedge or refuse just because no explicit score was stated.
- For specific factual questions, answer directly from the transcript.
- Stay grounded in what was actually said. Don't invent specific facts, names, numbers, or dates that aren't there; if something genuinely isn't in the transcript, say so briefly and still give your best grounded read.
- Talk like a person, not a report. Be concise but substantive, and skip boilerplate disclaimers.

TRANSCRIPT:
${transcript}${conversationBlock(summary, recent)}

QUESTION: ${question}`
}

export async function askSessionScoped(params: {
  question: string
  transcript: string
} & AskContext): Promise<
  { answer: string; summary: string; foldedCount: number } | { error: string }
> {
  if (!params.question?.trim()) {
    return { error: 'Ask a question first.' }
  }
  if (!params.transcript?.trim()) {
    return { error: 'This session has no transcript to search.' }
  }

  let provider
  try {
    provider = await getNotesProvider()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'No AI provider configured' }
  }

  const { summary, recent, foldedCount } = await compactForAsk(
    provider,
    params.summary ?? '',
    params.recent ?? [],
  )

  try {
    const answer = await provider.generateShort({
      prompt: buildSessionScopedQaPrompt(
        params.question,
        params.transcript.slice(0, SESSION_SCOPED_QA_TRANSCRIPT_SLICE),
        recent,
        summary,
      ),
      maxTokens: SESSION_QA_MAX_TOKENS,
    })
    const trimmed = answer.trim()
    if (!trimmed) {
      return { error: 'The model returned an empty answer. Try again.' }
    }
    return { answer: trimmed, summary, foldedCount }
  } catch (err) {
    log.error('Session-scoped QA generation failed:', err)
    return { error: err instanceof Error ? err.message : 'Failed to answer the question' }
  }
}

export async function askQuestion(
  question: string,
  ctx: AskContext = {},
): Promise<
  { answer: string; sources: QaSource[]; summary: string; foldedCount: number } | { error: string }
> {
  if (!question?.trim()) {
    return { error: 'Ask a question first.' }
  }

  const chunks = getChunks()
  if (chunks.length === 0) {
    return { error: 'No meetings have been indexed yet. Record a session first.' }
  }

  let provider
  try {
    provider = await getNotesProvider()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'No AI provider configured' }
  }

  const compacted = await compactForAsk(provider, ctx.summary ?? '', ctx.recent ?? [])

  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedText(question)
  } catch (err) {
    log.error('Failed to embed question:', err)
    return { error: 'Failed to process the question. Try again.' }
  }

  const scored = chunks
    .map((chunk) => ({ chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)

  const picked: ParsedChunk[] = []
  let tokenCount = 0
  for (const { chunk } of scored.slice(0, SESSION_QA_TOP_K)) {
    const approxTokens = chunk.chunkText.split(/\s+/).length
    if (tokenCount + approxTokens > SESSION_QA_MAX_CONTEXT_TOKENS) break
    picked.push(chunk)
    tokenCount += approxTokens
  }

  if (picked.length === 0) {
    return { error: 'No relevant meetings found for that question.' }
  }

  const metaCache = new Map<string, { title: string; startedAt: number }>()
  const contexts: QaContext[] = []
  const sources = new Map<string, QaSource>()

  picked.forEach((chunk, i) => {
    let meta = metaCache.get(chunk.sessionId)
    if (!meta) {
      const m = databaseService.getSessionMeta(chunk.sessionId)
      meta = m ? { title: m.title, startedAt: m.startedAt } : { title: 'Untitled Session', startedAt: 0 }
      metaCache.set(chunk.sessionId, meta)
    }
    const date = meta.startedAt ? new Date(meta.startedAt).toLocaleDateString() : 'unknown date'
    contexts.push({ index: i + 1, title: meta.title, date, text: chunk.chunkText })
    if (!sources.has(chunk.sessionId)) {
      sources.set(chunk.sessionId, {
        sessionId: chunk.sessionId,
        title: meta.title,
        startedAt: meta.startedAt,
      })
    }
  })

  try {
    const answer = await provider.generateShort({
      prompt: buildQaPrompt(question, contexts, compacted.recent, compacted.summary),
      maxTokens: SESSION_QA_MAX_TOKENS,
    })
    const trimmed = answer.trim()
    if (!trimmed) {
      return { error: 'The model returned an empty answer. Try again.' }
    }
    return {
      answer: trimmed,
      sources: Array.from(sources.values()),
      summary: compacted.summary,
      foldedCount: compacted.foldedCount,
    }
  } catch (err) {
    log.error('Session QA generation failed:', err)
    return { error: err instanceof Error ? err.message : 'Failed to answer the question' }
  }
}
