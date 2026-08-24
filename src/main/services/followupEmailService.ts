/**
 * Follow-up email drafting. Stateless: takes a session's notes + transcript,
 * returns a draft the user can copy. Runs on the user's own notes model via
 * getNotesProvider(); nothing is persisted.
 */

import { getNotesProvider } from './ai/providerFactory'
import { parseActionItems } from '../../shared/actionItems'
import { FOLLOWUP_MAX_TOKENS, FOLLOWUP_TRANSCRIPT_SLICE } from '../constants'
import { createLogger } from '../logger'

const log = createLogger('FollowupEmail')

export interface FollowupEmailParams {
  title: string
  summary: string | null
  actionItemsJson: string | null
  /** Formatted transcript ("You: ... / Them: ..."). */
  transcript: string
  senderName?: string | null
}

export function buildFollowupEmailPrompt(params: FollowupEmailParams): string {
  const items = parseActionItems(params.actionItemsJson)
  const actionItemsBlock = items.length
    ? items
        .map(
          (item) =>
            `- ${item.task}${item.assignee ? ` (owner: ${item.assignee})` : ''}${item.deadline ? ` (due: ${item.deadline})` : ''}`,
        )
        .join('\n')
    : '(none captured)'

  const sender = params.senderName?.trim() || 'the sender'
  const transcriptTail = params.transcript.slice(-FOLLOWUP_TRANSCRIPT_SLICE)

  return `Draft a follow-up email that ${sender} will send after this conversation. Write it in their voice: professional, warm, and concise.

HARD RULES:
- Base the email ONLY on what was actually discussed in the notes and transcript below. Do not invent commitments, names, dates, numbers, or facts that are not present.
- If the notes are thin, keep the email short rather than padding it with invented detail.
- Write from the sender's first-person point of view ("I", "we"). Do not address it from Raven.

INCLUDE:
- A one or two sentence thank-you / recap opener.
- The key points or decisions that were actually discussed.
- A short "Next steps" list built from the action items below (include owners and deadlines when known). Omit this section if there are genuinely no next steps.
- A brief closing line.

OUTPUT:
- Output ONLY the email body. No preamble like "Here is the draft", no explanation.
- You may start with a "Subject:" line if it helps, then the body.
- Plain text with simple line breaks. A short bulleted next-steps list is fine.

MEETING TITLE: ${params.title}

SUMMARY:
${params.summary?.trim() || '(no summary available)'}

ACTION ITEMS:
${actionItemsBlock}

TRANSCRIPT (may be truncated):
${transcriptTail}`
}

export async function draftFollowupEmail(
  params: FollowupEmailParams,
): Promise<{ email: string } | { error: string }> {
  if (!params.transcript?.trim() && !params.summary?.trim()) {
    return { error: 'Not enough content to draft a follow-up email.' }
  }

  let provider
  try {
    provider = await getNotesProvider()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No AI provider configured'
    return { error: message }
  }

  try {
    const email = await provider.generateShort({
      prompt: buildFollowupEmailPrompt(params),
      maxTokens: FOLLOWUP_MAX_TOKENS,
    })
    const trimmed = email.trim()
    if (!trimmed) {
      return { error: 'The model returned an empty draft. Try again.' }
    }
    return { email: trimmed }
  } catch (err) {
    log.error('Follow-up email generation failed:', err)
    const message = err instanceof Error ? err.message : 'Failed to draft follow-up email'
    return { error: message }
  }
}
