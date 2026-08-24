/**
 * Talk ratio — share of words spoken by You (mic) vs Them (system audio).
 *
 * This is a word-count approximation, not true speaking seconds: the STT
 * services do not persist per-utterance durations, so word share is the only
 * signal available both live and retroactively. Keyed on `source` (the hard
 * capture-source split), which is reliable, rather than diarization.
 */

export interface TalkRatio {
  youWords: number
  themWords: number
  totalWords: number
  youPct: number
  themPct: number
}

interface TalkRatioEntry {
  source: 'mic' | 'system'
  text: string
  /** Interim entries (isFinal === false) are excluded. Missing = treated as final. */
  isFinal?: boolean
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

export function computeTalkRatio(entries: TalkRatioEntry[] | null | undefined): TalkRatio {
  let youWords = 0
  let themWords = 0

  if (entries) {
    for (const entry of entries) {
      if (entry.isFinal === false) continue
      if (!entry.text) continue
      const words = countWords(entry.text)
      if (entry.source === 'mic') youWords += words
      else if (entry.source === 'system') themWords += words
    }
  }

  const totalWords = youWords + themWords
  // Derive themPct from youPct so the two always sum to exactly 100.
  const youPct = totalWords > 0 ? Math.round((youWords / totalWords) * 100) : 0
  const themPct = totalWords > 0 ? 100 - youPct : 0

  return { youWords, themWords, totalWords, youPct, themPct }
}
