import { describe, expect, it } from 'vitest'
import {
  buildSessionSummaryPrompt,
  buildSessionTitlePrompt,
  notesTemplateHeadings,
} from '../services/sessionNotesPrompt'

const YOUTUBE_DEMO_TRANSCRIPT = `You: Hello. How are you? I'm good. Thank you.

You: I'm going to start a YouTube video now. So that we can test how it works. On a video call.

Them: Just stop there one second just so I understand. It only runs ten minutes of the day.

You: Just understand all the time to

Them: Did you say? That's it. You train ten minutes a day? Ten minutes a day. Malik is up 700,000.

Them: The crazy thing is that's in the last six months. One thing that's gonna blow people's mind is I don't have to do anything until here for two years here. This is the process that I`

describe('notesTemplateHeadings', () => {
  it('keeps titles and drops empty names', () => {
    expect(notesTemplateHeadings([
      { title: 'Overview' },
      { title: '' },
      { title: 'Open questions' },
    ])).toEqual(['Overview', 'Open questions'])
  })
})

describe('buildSessionSummaryPrompt', () => {
  it('grounds notes in the YouTube-demo transcript instead of inventing an AI/ML meeting', () => {
    const prompt = buildSessionSummaryPrompt({
      transcript: YOUTUBE_DEMO_TRANSCRIPT,
      slice: 8000,
      modeName: 'Meeting Notes',
      notesHeadings: ['Overview', 'Key discussions', 'Open questions'],
    })

    expect(prompt).toContain('start a YouTube video now')
    expect(prompt).toContain('Malik is up 700,000')
    expect(prompt).toContain('Do not infer an industry')
    expect(prompt).toContain('AI/ML training')
    expect(prompt).toContain('Optional headings')
    expect(prompt).toContain('Overview')
    expect(prompt).not.toContain('who attended')
    expect(prompt).not.toContain('Analyze this meeting')
  })
})

describe('buildSessionTitlePrompt', () => {
  it('rejects the hallucinated AI/ML platform title as a bad example', () => {
    const prompt = buildSessionTitlePrompt(YOUTUBE_DEMO_TRANSCRIPT)
    expect(prompt).toContain('YouTube video call test')
    expect(prompt).toContain('AI/ML Platform Testing and Training Efficiency Discussion')
    expect(prompt).toContain('Do not invent a meeting type')
    expect(prompt).toContain('start a YouTube video now')
  })
})
