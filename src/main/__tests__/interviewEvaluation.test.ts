import { describe, expect, it } from 'vitest';
import { aggregateInterviewEvaluation, CONTINUOUS_INTERVIEW_SCENARIOS, evaluateInterviewResponse } from '../services/interviewEvaluation';

const COMPLETE_ANSWERS: Record<string, string> = {
  'behavioral-grounded-star': 'I quarantined only the test, assigned an owner, used a Playwright trace, fixed the shared-account isolation problem, and re-enabled it. The result was a restored test backed by evidence, and I learned to contain risk without hiding it.',
  'coding-async-safety': 'Use await fetch, check response.ok, pass an AbortSignal with a timeout, and bound polling with maxAttempts and retry backoff.',
  'debugging-evidence-first': 'The shared account creates a race. I would capture a Playwright trace, give every worker unique isolated data, and avoid waitForTimeout because a hard wait masks the collision.',
  'payment-failure-modes': 'Verify idempotency across a 504 retry, deduplicate each duplicate event from at-least-once delivery, process out-of-order webhooks safely, and assert the database ledger state.',
  'cross-turn-continuity': 'On day one of the two-day timebox, I would quarantine the flake, collect a trace, isolate unique account test data, automate the API risk, and finish with the checkout critical-path smoke suite.',
};

describe('continuous interview evaluation', () => {
  it('passes a complete grounded response set at the 95% quality gate', () => {
    const results = CONTINUOUS_INTERVIEW_SCENARIOS.map((scenario) => evaluateInterviewResponse(scenario, COMPLETE_ANSWERS[scenario.id], { latencyMs: 3000 }));
    const aggregate = aggregateInterviewEvaluation(results);
    expect(aggregate.coverage).toBe(1);
    expect(aggregate.forbiddenCount).toBe(0);
    expect(aggregate.averageLatencyMs).toBe(3000);
    expect(aggregate.passed).toBe(true);
  });

  it('fails omissions, invented metrics, and unsafe code', () => {
    const behavioral = CONTINUOUS_INTERVIEW_SCENARIOS[0];
    const result = evaluateInterviewResponse(behavioral, 'I helped the team and improved stability by 73%.');
    expect(result.coverage).toBeLessThan(0.5);
    expect(result.forbidden).toContain('invented metric');
    expect(aggregateInterviewEvaluation([result]).passed).toBe(false);
  });
});
