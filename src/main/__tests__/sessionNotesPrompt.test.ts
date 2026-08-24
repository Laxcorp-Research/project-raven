import { describe, expect, it } from 'vitest'
import {
  buildSessionSummaryPrompt,
  buildSessionTitlePrompt,
  notesTemplateSections,
} from '../services/sessionNotesPrompt'

const YOUTUBE_DEMO_TRANSCRIPT = `You: Hello. How are you? I'm good. Thank you.

You: I'm going to start a YouTube video now. So that we can test how it works. On a video call.

Them: Just stop there one second just so I understand. It only runs ten minutes of the day.

You: Just understand all the time to

Them: Did you say? That's it. You train ten minutes a day? Ten minutes a day. Malik is up 700,000.

Them: The crazy thing is that's in the last six months. One thing that's gonna blow people's mind is I don't have to do anything until here for two years here. This is the process that I`

describe('notesTemplateSections', () => {
  it('keeps title + instructions and drops sections with no title', () => {
    expect(notesTemplateSections([
      { title: 'Overview', instructions: 'Purpose of the meeting and who attended.' },
      { title: '', instructions: 'ignored because there is no title' },
      { title: 'Open questions', instructions: '' },
    ])).toEqual([
      { title: 'Overview', instructions: 'Purpose of the meeting and who attended.' },
      { title: 'Open questions', instructions: '' },
    ])
  })

  it('returns an empty array for null or empty templates', () => {
    expect(notesTemplateSections(null)).toEqual([])
    expect(notesTemplateSections(undefined)).toEqual([])
    expect(notesTemplateSections([])).toEqual([])
  })
})

describe('buildSessionSummaryPrompt', () => {
  it('grounds notes in the YouTube-demo transcript instead of inventing an AI/ML meeting', () => {
    const prompt = buildSessionSummaryPrompt({
      transcript: YOUTUBE_DEMO_TRANSCRIPT,
      slice: 8000,
      modeName: 'Meeting Notes',
      notesSections: [
        { title: 'Overview', instructions: 'Purpose of the meeting and who attended.' },
        { title: 'Key discussions', instructions: 'The substantive topics covered.' },
        { title: 'Open questions', instructions: '' },
      ],
    })

    expect(prompt).toContain('start a YouTube video now')
    expect(prompt).toContain('Malik is up 700,000')
    expect(prompt).toContain('Do not infer an industry')
    expect(prompt).toContain('AI/ML training')
    expect(prompt).not.toContain('Analyze this meeting')
  })

  it('sends each section title AND its instructions to the model', () => {
    const prompt = buildSessionSummaryPrompt({
      transcript: YOUTUBE_DEMO_TRANSCRIPT,
      slice: 8000,
      modeName: 'Meeting Notes',
      notesSections: [
        { title: 'Overview', instructions: 'Purpose of the meeting and who attended.' },
        { title: 'Open questions', instructions: '' },
      ],
    })

    expect(prompt).toContain('NOTES TEMPLATE')
    expect(prompt).toContain('Overview: Purpose of the meeting and who attended.')
    // a section with no instructions still lists its title as a hint
    expect(prompt).toContain('- Open questions')
  })

  it('includes the mandatory action-items rule for spoken commitments', () => {
    const prompt = buildSessionSummaryPrompt({ transcript: 'hello there', slice: 8000 })
    expect(prompt).toContain('Action items')
    expect(prompt).toContain('MUST include')
  })

  it('omits the notes-template block when no sections are provided', () => {
    const prompt = buildSessionSummaryPrompt({ transcript: 'hello there', slice: 8000 })
    expect(prompt).not.toContain('NOTES TEMPLATE')
    expect(prompt).toContain('TITLE:')
    expect(prompt).toContain('SUMMARY:')
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
