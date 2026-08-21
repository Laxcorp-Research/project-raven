/** Matches the sessions.title DB default and sessionManager start title. */
export const PLACEHOLDER_SESSION_TITLE = 'Untitled Session'

/** Older summary fallbacks wrote a lowercase S. Treat both as untitled. */
const PLACEHOLDER_TITLES = new Set(['untitled session'])

/** Optimistic list spinner after a session ends, until notes IPC reports pending/done. */
export const SESSION_NOTES_PROCESSING_MS = 120_000

export function isPlaceholderSessionTitle(title: string | null | undefined): boolean {
  const trimmed = title?.trim() ?? ''
  if (!trimmed) return true
  return PLACEHOLDER_TITLES.has(trimmed.toLowerCase())
}

/**
 * List/header "processing" state for title+summary generation.
 * Pending IPC always wins (including retries hours later).
 * Without pending, only recently ended sessions with missing notes animate —
 * a 12-hour-old untitled row is stuck, not still calculating.
 */
export function shouldShowSessionNotesGenerating(opts: {
  isActive: boolean
  title: string | null | undefined
  durationSeconds: number
  updatedAt: number
  now: number
  pending: boolean
  hasSummary?: boolean
}): boolean {
  if (opts.isActive) return false
  if (opts.pending) return true
  if (opts.durationSeconds <= 0) return false

  const untitled = isPlaceholderSessionTitle(opts.title)
  const missingSummary = opts.hasSummary === false
  const notesMissing = untitled || missingSummary
  if (!notesMissing) return false

  return opts.now - opts.updatedAt < SESSION_NOTES_PROCESSING_MS
}
