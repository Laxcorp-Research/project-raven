/**
 * Summary Service
 * Generates session titles and summaries using Claude
 */

import Anthropic from '@anthropic-ai/sdk'
import { databaseService } from './database'

interface NotesSection {
  id: string
  title: string
  instructions: string
}

interface SummaryResult {
  title: string
  summary: string
}

let anthropicClient: Anthropic | null = null

function getClient(apiKey: string): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

export async function generateSessionSummary(
  transcript: string,
  modeId: string | null,
  apiKey: string
): Promise<SummaryResult> {
  if (!transcript || transcript.trim().length < 20) {
    return {
      title: 'Untitled session',
      summary: '',
    }
  }

  const client = getClient(apiKey)

  let notesTemplate: NotesSection[] | null = null
  if (modeId) {
    const mode = databaseService.getMode(modeId)
    if (mode?.notesTemplate) {
      notesTemplate = mode.notesTemplate
    }
  }

  let systemPrompt: string
  let userPrompt: string

  if (notesTemplate && notesTemplate.length > 0) {
    const sectionsDescription = notesTemplate
      .map((section, index) => `${index + 1}. **${section.title}**: ${section.instructions}`)
      .join('\n')

    systemPrompt = `You are a meeting assistant that generates concise titles and structured summaries from transcripts.

Your task:
1. Generate a short, descriptive title (3-7 words) that captures the main topic
2. Generate a structured summary following the exact sections provided

Output format (use exactly this JSON structure):
{
  "title": "Your Generated Title",
  "summary": {
    "sections": [
      { "title": "Section Name", "content": "Bullet points or short paragraphs" }
    ]
  }
}

Important:
- Title should be professional and descriptive (e.g., "Q4 Sales Strategy Review", "Product Launch Planning Meeting")
- Each section should have 2-5 bullet points or a short paragraph
- If a section has no relevant content from the transcript, write "No information discussed"
- Be concise but capture key points`

    userPrompt = `Generate a title and summary for this transcript using these sections:

${sectionsDescription}

Transcript:
"""
${transcript.slice(0, 15000)}
"""

Respond with valid JSON only.`
  } else {
    systemPrompt = `You are a meeting assistant that generates concise titles and summaries from transcripts.

Your task:
1. Generate a short, descriptive title (3-7 words) that captures the main topic
2. Generate a well-organized summary with relevant sections based on the content

Output format (use exactly this JSON structure):
{
  "title": "Your Generated Title",
  "summary": {
    "sections": [
      { "title": "Overview", "content": "Brief overview" },
      { "title": "Key Points", "content": "Main discussion points" },
      { "title": "Action Items", "content": "Tasks or next steps if any" }
    ]
  }
}

Important:
- Title should be professional and descriptive
- Create 3-5 sections based on what's actually in the transcript
- Be concise but capture key points
- Adapt section titles to fit the content (e.g., "Technical Discussion", "Decisions Made", "Questions Raised")`

    userPrompt = `Generate a title and summary for this transcript:

"""
${transcript.slice(0, 15000)}
"""

Respond with valid JSON only.`
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude')
    }

    const jsonStr = textBlock.text.trim()
    const cleanJson = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(cleanJson)

    let formattedSummary = ''
    if (parsed.summary?.sections) {
      for (const section of parsed.summary.sections) {
        formattedSummary += `## ${section.title}\n${section.content}\n\n`
      }
    }

    return {
      title: parsed.title || 'Untitled session',
      summary: formattedSummary.trim(),
    }
  } catch (error) {
    console.error('[SummaryService] Failed to generate summary:', error)
    return {
      title: 'Untitled session',
      summary: '',
    }
  }
}
