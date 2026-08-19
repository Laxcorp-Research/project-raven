/**
 * Summary Service
 * Generates session titles and summaries using the Notes model slot.
 */

import { databaseService } from './database'
import { getNotesProvider } from './ai/providerFactory'
import { createLogger } from '../logger'
import { SUMMARY_MAX_TOKENS, SUMMARY_TRANSCRIPT_SLICE, SUMMARY_MIN_TRANSCRIPT_LENGTH } from '../constants'
import {
  buildSessionSummaryPrompt,
  notesTemplateHeadings,
} from './sessionNotesPrompt'

const log = createLogger('Summary')

interface SummaryResult {
  title: string
  summary: string
}

export async function generateSessionSummary(
  transcript: string,
  modeId: string | null,
): Promise<SummaryResult> {
  if (!transcript || transcript.trim().length < SUMMARY_MIN_TRANSCRIPT_LENGTH) {
    return { title: 'Untitled session', summary: '' }
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

    const text = await provider.generateShort({ prompt, maxTokens: SUMMARY_MAX_TOKENS })

    const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|SUMMARY:)/s)
    const summaryMatch = text.match(/SUMMARY:\s*([\s\S]+)/)

    const title = titleMatch?.[1]?.trim() || 'Untitled session'
    const summary = summaryMatch?.[1]?.trim() || ''

    return { title, summary }
  } catch (error) {
    log.error('Failed to generate summary:', error)
    return { title: 'Untitled session', summary: '' }
  }
}
