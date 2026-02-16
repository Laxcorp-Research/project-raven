/**
 * Summary Service
 * Generates session titles and summaries using Claude
 */

import Anthropic from '@anthropic-ai/sdk'
import { databaseService } from './database'
import { createLogger } from '../logger'

const log = createLogger('Summary')

interface NotesSection {
  id: string
  title: string
  instructions: string
}

interface SummaryResult {
  title: string
  summary: string
}

export async function generateSessionSummary(
  transcript: string,
  modeId: string | null,
  apiKey: string
): Promise<SummaryResult> {
  if (!transcript || transcript.trim().length < 20) {
    return { title: 'Untitled session', summary: '' }
  }

  const anthropic = new Anthropic({ apiKey })

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
${transcript.slice(0, 8000)}

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
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    const text = textBlock.text || ''
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
