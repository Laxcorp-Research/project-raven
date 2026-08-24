/**
 * Builds the local transcript index that powers ask-my-meetings. Chunks a
 * session's transcript, embeds each chunk on-device (via ragService), and
 * stores the vectors in session_context_chunks. All work is local and free;
 * only ask-time answer generation uses the user's LLM key.
 */

import { databaseService, type TranscriptEntry } from './database'
import { chunkText, embedText } from './ragService'
import { invalidateSessionQaCache } from './sessionQaService'
import { getSetting } from '../store'
import {
  SESSION_INDEX_BACKFILL_SCAN,
  SESSION_INDEX_BACKFILL_LIMIT,
  SUMMARY_MIN_TRANSCRIPT_LENGTH,
} from '../constants'
import { createLogger } from '../logger'

const log = createLogger('SessionIndex')

function formatTranscript(transcript: TranscriptEntry[], displayName: string): string {
  return transcript
    .filter((entry) => entry.isFinal !== false && entry.text?.trim())
    .map((entry) => `${entry.source === 'mic' ? displayName : 'Them'}: ${entry.text}`)
    .join('\n')
}

/**
 * (Re)build the chunk index for one session. Idempotent: existing chunks for
 * the session are cleared first, so calling it again after an edit refreshes
 * the index. Best-effort by contract — callers should not await-block on it.
 */
export async function indexSession(sessionId: string): Promise<void> {
  const session = databaseService.getSession(sessionId)
  if (!session?.transcript?.length) return

  const displayName = (getSetting('displayName') as string) || 'You'
  const text = formatTranscript(session.transcript, displayName)
  if (text.trim().length < SUMMARY_MIN_TRANSCRIPT_LENGTH) return

  const chunks = chunkText(text)
  if (chunks.length === 0) return

  // Clear any prior chunks so re-indexing doesn't duplicate.
  databaseService.deleteSessionChunks(sessionId)

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedText(chunks[i])
    databaseService.insertSessionChunk({
      id: globalThis.crypto.randomUUID(),
      sessionId,
      chunkIndex: i,
      chunkText: chunks[i],
      embeddingJson: JSON.stringify(embedding),
    })
  }

  invalidateSessionQaCache()
  log.info(`Indexed ${chunks.length} chunks for session ${sessionId}`)
}

let backfillInFlight = false

/**
 * Index recent sessions that were never indexed (e.g. recorded before this
 * feature shipped). Capped per invocation so it never runs unbounded. Called
 * lazily when the Ask view opens, not on boot, so users who never use Ask
 * don't pay the embedding-model load cost.
 *
 * Guarded against concurrent runs: the Ask view mounts under React.StrictMode
 * (which double-fires effects in dev) and can be reopened rapidly, either of
 * which would otherwise kick off overlapping backfills that re-embed the same
 * sessions and race on the same chunk rows.
 */
export async function backfillSessionIndex(): Promise<void> {
  if (backfillInFlight) return
  backfillInFlight = true
  try {
    const indexed = databaseService.getIndexedSessionIds()
    const summaries = databaseService.getAllSessionSummaries(SESSION_INDEX_BACKFILL_SCAN)

    let done = 0
    for (const summary of summaries) {
      if (done >= SESSION_INDEX_BACKFILL_LIMIT) break
      if (indexed.has(summary.id)) continue
      if (!summary.endedAt) continue
      if (summary.durationSeconds <= 0) continue
      await indexSession(summary.id)
      done += 1
    }
    if (done > 0) log.info(`Backfilled session index for ${done} session(s)`)
  } catch (err) {
    log.error('Session index backfill failed (non-fatal):', err)
  } finally {
    backfillInFlight = false
  }
}
