/**
 * Summary Service
 * Generates session titles and summaries using the Notes model slot.
 */

import { databaseService } from './database'
import { getNotesProvider } from './ai/providerFactory'
import { createLogger } from '../logger'
import { SUMMARY_MAX_TOKENS, SUMMARY_TRANSCRIPT_SLICE, SUMMARY_MIN_TRANSCRIPT_LENGTH } from '../constants'
import { PLACEHOLDER_SESSION_TITLE, isPlaceholderSessionTitle } from '../../shared/sessionDisplay'
import {
  buildSessionSummaryPrompt,
  notesTemplateHeadings,
} from './sessionNotesPrompt'

const log = createLogger('Summary')

interface SummaryResult {
  title: string
  summary: string
}

/** Pull TITLE/SUMMARY out of a notes-model reply. Models often ignore the exact labels. */
export function parseSessionNotesResponse(text: string): SummaryResult {
  const cleaned = text
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  if (!cleaned) {
    return { title: PLACEHOLDER_SESSION_TITLE, summary: '' }
  }

  const titleMatch = cleaned.match(
    /(?:^|\n)\s*(?:\*{0,2}|_{0,2}|#{1,3}\s*)?(?:TITLE|Title)\s*[:-]\s*(.+)/,
  )
  const summaryMatch = cleaned.match(
    /(?:^|\n)\s*(?:\*{0,2}|_{0,2}|#{1,3}\s*)?(?:SUMMARY|Summary)\s*[:-]\s*([\s\S]+)/,
  )

  let title = titleMatch?.[1]?.trim().replace(/^\*+|\*+$/g, '') ?? ''
  if (title.includes('\n')) title = title.split('\n')[0].trim()

  let summary = summaryMatch?.[1]?.trim() ?? ''

  if (!summary) {
    const heading = cleaned.match(/^#{1,3}\s+(.+)$/m)
    if (!title && heading) title = heading[1].trim()
    summary = cleaned
      .replace(titleMatch?.[0] ?? '', '')
      .replace(/^#{1,3}\s+.+\n?/, '')
      .trim()
  }

  if (!title && summary) {
    const firstLine = summary.split('\n').find((line) => line.replace(/^#+\s*/, '').trim()) ?? ''
    title = firstLine.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim().slice(0, 80)
  }

  if (isPlaceholderSessionTitle(title) && summary) {
    const firstLine = summary.split('\n').find((line) => line.replace(/^#+\s*/, '').trim()) ?? ''
    const derived = firstLine.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim().slice(0, 80)
    if (derived && !isPlaceholderSessionTitle(derived)) title = derived
  }

  return {
    title: title || PLACEHOLDER_SESSION_TITLE,
    summary,
  }
}

export async function generateSessionSummary(
  transcript: string,
  modeId: string | null,
): Promise<SummaryResult> {
  if (!transcript || transcript.trim().length < SUMMARY_MIN_TRANSCRIPT_LENGTH) {
    return { title: PLACEHOLDER_SESSION_TITLE, summary: '' }
  }

  let modeName: string | null = null
  let notesHeadings: string[] = []
  if (modeId) {
    const mode = databaseService.getMode(modeId)
    if (mode) {
      modeName = mode.name
      notesHeadings = notesTemplateHeadings(mode.notesTemplate)
    }
  }

  const prompt = buildSessionSummaryPrompt({
    transcript,
    slice: SUMMARY_TRANSCRIPT_SLICE,
    modeName,
    notesHeadings,
  })

  try {
    const provider = await getNotesProvider()

    // maxTokens is a product hint; the provider uses the model max so
    // thinking-capable notes models can still emit a title and summary.
    const text = await provider.generateShort({ prompt, maxTokens: SUMMARY_MAX_TOKENS })
    if (!text.trim()) {
      throw new Error('Notes model returned no text')
    }

    const parsed = parseSessionNotesResponse(text)
    if (!parsed.summary.trim()) {
      log.warn('Notes model reply had no usable summary:', text.slice(0, 240))
    }
    return parsed
  } catch (error) {
    log.error('Failed to generate summary:', error)
    throw error
  }
}
