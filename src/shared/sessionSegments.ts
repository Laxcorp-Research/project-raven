/**
 * Recording segments for resumable sessions.
 *
 * A session recorded in one sitting has no segments (segments_json is NULL).
 * Each time a saved session is resumed, a segment is appended, so the
 * session's duration can ignore the gap between sittings and the transcript
 * can show where the break was.
 */

/** One recording sitting. `endedAt` is null while it is live. */
export interface SessionSegment {
  startedAt: number
  endedAt: number | null
}

export function parseSessionSegments(json: string | null | undefined): SessionSegment[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is SessionSegment =>
        !!s && typeof s === 'object'
        && typeof (s as SessionSegment).startedAt === 'number'
        && ((s as SessionSegment).endedAt === null || typeof (s as SessionSegment).endedAt === 'number'),
    )
  } catch {
    return []
  }
}

/** True once a session has been recorded in more than one sitting. */
export function wasResumed(json: string | null | undefined): boolean {
  return parseSessionSegments(json).length > 1
}

/**
 * For a transcript in timestamp order, find where each later sitting begins.
 * Returns a map from transcript index to the segment that starts at that
 * entry, so a renderer can put a "Resumed" divider before it. The first
 * segment never gets a divider; a segment with no entries after its start
 * is skipped.
 */
export function findSegmentBreaks(
  timestamps: ReadonlyArray<number>,
  segments: ReadonlyArray<SessionSegment>,
): Map<number, SessionSegment> {
  const breaks = new Map<number, SessionSegment>()
  if (segments.length < 2) return breaks

  const later = [...segments].sort((a, b) => a.startedAt - b.startedAt).slice(1)
  let from = 0
  for (const segment of later) {
    let idx = -1
    for (let i = from; i < timestamps.length; i++) {
      if (timestamps[i] >= segment.startedAt) {
        idx = i
        break
      }
    }
    if (idx === -1) continue
    // Two sittings with nothing said in between collapse onto the same
    // entry; the later sitting's divider wins so the label is the most
    // recent resume, which is the one the reader is looking for.
    breaks.set(idx, segment)
    from = idx
  }
  return breaks
}
