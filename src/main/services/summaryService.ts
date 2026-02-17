/**
 * Summary Service
 * Generates session titles and summaries using the user's configured AI provider
 */

import { databaseService } from './database'
import { getProviderFromStore } from './ai/providerFactory'
import { createLogger } from '../logger'
import { SUMMARY_MAX_TOKENS, SUMMARY_TRANSCRIPT_SLICE, SUMMARY_MIN_TRANSCRIPT_LENGTH } from '../constants'

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

  let modeContext = ''
  if (modeId) {
    const mode = databaseService.getMode(modeId)
    if (mode) {
      modeContext = `\nContext: This is a "${mode.name}" session.`
      if (mode.notesTemplate) {
        modeContext += `\nThe user wants notes structured around: ${JSON.stringify(mode.notesTemplate)}`
      }
    }
  }

  const prompt = `Analyze this meeting/conversation transcript and generate:
1. A concise, descriptive title (5-10 words, no quotes)
2. A comprehensive summary with intelligent sections

${modeContext}

TRANSCRIPT:
${transcript.slice(0, SUMMARY_TRANSCRIPT_SLICE)}

---

Generate a summary following these rules:

FORMAT REQUIREMENTS:
- Use ## for section headings (choose headings that fit the content)
- Use bullet points starting with "- " for each item
- Use **bold** for key labels, names, numbers, or emphasis within bullets
- Be specific and actionable, not vague

SECTION EXAMPLES (adapt to content):
- **Action Items** - specific tasks with owners if mentioned
- **Key Decisions** - what was decided
- **Discussion Points** - main topics covered
- **Recommendations** - suggested approaches
- **Open Questions** - unresolved items
- **Timeline/Roadmap** - if dates or phases mentioned
- **Metrics/Data** - if numbers discussed
- **Next Steps** - immediate follow-ups

Choose 3-7 sections that best fit the actual content. Don't force sections that don't apply.

Respond in this exact format:
TITLE: [your title here]
SUMMARY:
[your markdown summary here]`

  try {
    const provider = await getProviderFromStore()

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
