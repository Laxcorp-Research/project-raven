import { TITLE_TRANSCRIPT_SLICE } from '../constants'

export function notesTemplateHeadings(
  notesTemplate: Array<{ title: string }> | null | undefined,
): string[] {
  if (!notesTemplate?.length) return []
  return notesTemplate.map((section) => section.title).filter(Boolean)
}

export function buildSessionTitlePrompt(transcript: string): string {
  return `<task>Write a 3-7 word title for this session transcript. Output ONLY the title text.</task>

<rules>
- Ground the title in what people actually said. Do not invent a meeting type, product, or industry that is never named.
- Casual chat, a demo, or a YouTube video on a call is a valid topic. Do not upgrade it into a "platform" or "efficiency" discussion.
- Words like "train" or numbers do not mean AI/ML unless those words appear.
</rules>

<transcript>
${transcript.slice(0, TITLE_TRANSCRIPT_SLICE)}
</transcript>

<examples>
Good: "YouTube video call test", "Q4 sales review", "Catch-up with Sam"
Bad: "AI/ML Platform Testing and Training Efficiency Discussion" (domain not in the transcript)
Bad: "I'd be happy to help...", "Here's a title:", "The conversation is about..."
</examples>

Title:`
}

export function buildSessionSummaryPrompt(opts: {
  transcript: string
  slice: number
  modeName?: string | null
  notesHeadings?: string[]
}): string {
  const headings = opts.notesHeadings?.filter(Boolean) ?? []
  const modeLine = opts.modeName
    ? `\nSession mode name (do not let this invent a topic): ${opts.modeName}`
    : ''
  const headingLine = headings.length
    ? `\nOptional headings (use only when the transcript supports them; skip the rest): ${headings.join(', ')}`
    : ''

  return `Write a title and notes for this transcript.${modeLine}${headingLine}

The transcript may be a meeting, a casual chat, a live demo, or audio from a video playing on the call. Treat it as speech, not as a brief you must complete.

HARD RULES:
- Only state facts that appear in the transcript. Do not infer an industry, product, platform, or meeting purpose that is never named.
- Do not upgrade casual or fragmented speech into corporate or technical jargon. "Train ten minutes a day" is not "AI/ML training" unless those words appear.
- If speakers talk over each other, test a YouTube video, or the audio is incomplete, say that. Do not invent a coherent professional agenda to fill the gaps.
- If there is not enough to recap, use a short What was said section and one line that the transcript is incomplete. Do not pad with Open Questions or Next Steps the speakers did not raise.

FORMAT:
- Title: 5-10 words, no quotes, from the actual topic.
- Use ## headings that fit THIS transcript.
- Bullets starting with "- ".
- **Bold** names and numbers that were actually said.

Respond in this exact format:
TITLE: [your title here]
SUMMARY:
[your markdown summary here]

TRANSCRIPT:
${opts.transcript.slice(0, opts.slice)}`
}
