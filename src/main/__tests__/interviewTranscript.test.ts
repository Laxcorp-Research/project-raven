import { describe, expect, it } from 'vitest';
import { normalizeInterviewTerms, prepareInterviewTranscript } from '../services/interviewTranscript';

describe('interview transcript preparation', () => {
  it('normalizes commonly misheard technical terms', () => {
    expect(normalizeInterviewTerms('play right with type script in get hub actions')).toBe('Playwright with TypeScript in GitHub Actions');
  });

  it('merges consecutive fragments and selects the latest completed remote question', () => {
    const result = prepareInterviewTranscript('Them: How would you debug a play right test\nThem: that fails in sea eye?\nYou: I would inspect it.');
    expect(result.transcript).toContain('Them: How would you debug a Playwright test that fails in CI?');
    expect(result.latestCompletedQuestion).toContain('Playwright test that fails in CI?');
  });

  it('does not classify an unfinished remote tail as the current question', () => {
    const result = prepareInterviewTranscript('Them: Tell me about a difficult release?\nYou: I handled one last year.\nThem (still speaking): And could you also explain');
    expect(result.hasUnfinishedRemoteSpeech).toBe(true);
    expect(result.latestCompletedQuestion).toBe('Tell me about a difficult release?');
  });

  it('removes overlapping words while joining fragments', () => {
    const result = prepareInterviewTranscript('Interviewer: How do retries work\nInterviewer: retries work with idempotency?');
    expect(result.latestCompletedQuestion).toBe('How do retries work with idempotency?');
  });
});
