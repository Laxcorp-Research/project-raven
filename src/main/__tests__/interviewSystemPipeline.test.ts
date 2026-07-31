import { describe, expect, it } from 'vitest'
import { assessInterviewAnswer, buildInterviewContext } from '../services/interviewCopilot'
import { isActionableInterviewQuestion, prepareInterviewTranscript } from '../services/interviewTranscript'
import { normalizeSavedSplitRatio, shouldUseSplitView } from '../../renderer/src/components/overlay/overlayLayout'

describe('deterministic interview system pipeline', () => {
  it('waits for the completed rapid multipart question', () => {
    const unfinished = prepareInterviewTranscript('Interviewer (still speaking): Tell me how you would test checkout across UI and API')
    expect(unfinished.hasUnfinishedRemoteSpeech).toBe(true)
    expect(unfinished.latestCompletedQuestion).toBe('')

    const completed = prepareInterviewTranscript('Interviewer (still speaking): Tell me how you would test checkout across UI and API\nInterviewer: Tell me how you would test checkout across UI and API, and how would you prioritize it for a release tomorrow?')
    expect(completed.hasUnfinishedRemoteSpeech).toBe(false)
    expect(completed.latestCompletedQuestion).toMatch(/UI and API.*prioritize.*tomorrow/i)
  })

  it('retains long background and the newest corrected constraint', () => {
    const transcript = [
      'Interviewer: Checkout releases tomorrow and duplicate charges caused the prior incident.',
      'Interviewer: We use Playwright for UI and REST API tests with six parallel workers.',
      'Candidate: I would start with idempotency and critical-path coverage.',
      'Interviewer: Actually, assume the API is eventually consistent. What would you change?',
    ].join('\n')
    const context = buildInterviewContext(transcript)
    expect(context.question).toMatch(/eventually consistent/i)
    expect(context.memory.constraints.join(' ')).toMatch(/tomorrow|eventually consistent/i)
    expect(context.memory.technicalFacts.join(' ')).toMatch(/API/i)
  })

  it('selects an interruption clarification without losing speaker separation', () => {
    const prepared = prepareInterviewTranscript([
      'Interviewer: Explain how you would add a fixed wait?',
      'Candidate: I would first inspect the trace.',
      'Interviewer: No—clarification: avoid fixed waits. How would you use observable readiness?',
    ].join('\n'))
    expect(prepared.transcript).toContain('Candidate: I would first inspect the trace.')
    expect(prepared.latestCompletedQuestion).toMatch(/observable readiness/i)
    expect(prepared.latestCompletedQuestion).not.toMatch(/add a fixed wait/i)
  })

  it('preserves separate microphone/system speaker lines in synthetic overlap order', () => {
    const prepared = prepareInterviewTranscript('Candidate: I would add a delay.\nInterviewer: No, use observable readiness. What would you poll?')
    expect(prepared.transcript.split('\n')).toEqual([
      'Candidate: I would add a delay.',
      'Interviewer: No, use observable readiness. What would you poll?',
    ])
  })

  it('suppresses a rhetorical confirmation while accepting real short follow-ups', () => {
    expect(isActionableInterviewQuestion('That makes sense, right?')).toBe(false)
    expect(isActionableInterviewQuestion('Why?')).toBe(true)
    const prepared = prepareInterviewTranscript('Interviewer: What tradeoff would you choose?\nCandidate: I prefer bounded polling.\nInterviewer: That makes sense, right?')
    expect(prepared.latestCompletedQuestion).toBe('What tradeoff would you choose?')
  })

  it('connects a short follow-up to preceding interview memory', () => {
    const context = buildInterviewContext('Interviewer: Why choose bounded polling for the REST API?\nCandidate: It observes readiness without a fixed sleep.\nInterviewer: Why?')
    expect(context.question).toBe('Why?')
    expect([...context.memory.constraints, ...context.memory.technicalFacts].join(' ')).toMatch(/fixed sleep|REST API/i)
  })

  it('scores coding requirements and refuses unsupported certainty', () => {
    const coding = buildInterviewContext('', 'Fix this function and explain time complexity, space complexity, and tradeoffs.')
    const assessment = assessInterviewAnswer(coding, 'Use await fetch, check response.ok, bound retry polling with maxAttempts and an AbortSignal timeout, and throw on error. Time is O(n) and space is O(1), with a latency tradeoff.')
    expect(assessment.missing).toEqual([])
    const unknown = buildInterviewContext('', 'Does an undocumented consistency mode guarantee rollback?')
    expect(unknown.guidance).toMatch(/uncertainty.*instead of inventing/i)
  })

  it('keeps transcript and response side by side only at supported widths and restores safe ratios', () => {
    expect(shouldUseSplitView(899, true)).toBe(false)
    expect(shouldUseSplitView(1100, true)).toBe(true)
    expect(normalizeSavedSplitRatio(0.42)).toBe(0.42)
    expect(normalizeSavedSplitRatio(0.95)).not.toBe(0.95)
  })
})
