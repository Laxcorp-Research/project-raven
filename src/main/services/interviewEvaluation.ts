export interface InterviewEvaluationScenario {
  id: string;
  category: 'behavioral' | 'coding' | 'debugging' | 'strategy' | 'continuity' | 'grounding';
  question: string;
  required: Array<{ label: string; patterns: RegExp[] }>;
  forbidden?: Array<{ label: string; pattern: RegExp }>;
  maxWords: number;
}

export interface InterviewEvaluationResult {
  scenarioId: string;
  matched: number;
  total: number;
  coverage: number;
  missing: string[];
  forbidden: string[];
  wordCount: number;
  withinWordLimit: boolean;
  latencyMs: number;
  repaired: boolean;
}

export const CONTINUOUS_INTERVIEW_SCENARIOS: InterviewEvaluationScenario[] = [
  {
    id: 'behavioral-grounded-star',
    category: 'behavioral',
    question: 'Tell me about pushing back on disabling a flaky test. Use the supplied owner, trace, isolation, and restored-test outcome without inventing a metric.',
    required: [
      { label: 'candidate action', patterns: [/\bI\s+(?:used|assigned|investigated|fixed|proposed|quarantined)/i] },
      { label: 'trace evidence', patterns: [/\btrace/i] },
      { label: 'owner', patterns: [/\bowner/i] },
      { label: 'restored test', patterns: [/re-enabled|restored|reintroduced/i] },
    ],
    forbidden: [{ label: 'invented metric', pattern: /\b\d+(?:\.\d+)?%/ }],
    maxWords: 180,
  },
  {
    id: 'coding-async-safety',
    category: 'coding',
    question: 'Repair an async polling helper without a fixed sleep.',
    required: [
      { label: 'await fetch', patterns: [/await\s+fetch/i] },
      { label: 'status handling', patterns: [/response\.(?:ok|status)/i] },
      { label: 'bounded retry', patterns: [/attempt|maxAttempts|retry|poll/i] },
      { label: 'cancellation or timeout', patterns: [/AbortSignal|signal|timeout/i] },
    ],
    forbidden: [{ label: 'invalid timeout scope', pattern: /try[\s\S]*const timeoutId[\s\S]*catch[\s\S]*clearTimeout\(timeoutId\)/i }],
    maxWords: 280,
  },
  {
    id: 'debugging-evidence-first',
    category: 'debugging',
    question: 'Diagnose an 8% CI flake caused by shared account and fixed order data.',
    required: [
      { label: 'shared-state cause', patterns: [/shared|collision|race/i] },
      { label: 'trace evidence', patterns: [/trace|video|screenshot/i] },
      { label: 'isolation', patterns: [/unique|isolat|per-worker/i] },
      { label: 'reject hard wait', patterns: [/avoid[^.]{0,50}(?:hard wait|waitForTimeout)|(?:hard wait|waitForTimeout)[^.]{0,50}(?:mask|not|avoid)/i] },
    ],
    maxWords: 180,
  },
  {
    id: 'payment-failure-modes',
    category: 'strategy',
    question: 'Test idempotent payments with 504 retries and duplicated, out-of-order webhooks.',
    required: [
      { label: 'idempotency', patterns: [/idempoten|duplicate charge/i] },
      { label: '504 retry', patterns: [/504|retry/i] },
      { label: 'duplicate event', patterns: [/duplicate event|dedup|at-least-once/i] },
      { label: 'out-of-order event', patterns: [/out[- ]of[- ]order|reorder/i] },
      { label: 'persistent state', patterns: [/database|persist|ledger|state/i] },
    ],
    maxWords: 220,
  },
  {
    id: 'cross-turn-continuity',
    category: 'continuity',
    question: 'Create a first-day plan retaining the deadline, API, smoke, trace, quarantine, and isolation decisions.',
    required: [
      { label: 'deadline', patterns: [/two days|two-day|timebox|day one/i] },
      { label: 'API', patterns: [/\bAPI\b/i] },
      { label: 'smoke path', patterns: [/smoke|critical path/i] },
      { label: 'trace', patterns: [/trace/i] },
      { label: 'quarantine', patterns: [/quarantin/i] },
      { label: 'isolation', patterns: [/isolat|unique account|test data/i] },
    ],
    maxWords: 180,
  },
];

export function evaluateInterviewResponse(
  scenario: InterviewEvaluationScenario,
  answer: string,
  metadata: { latencyMs?: number; repaired?: boolean } = {},
): InterviewEvaluationResult {
  const missing = scenario.required
    .filter((requirement) => !requirement.patterns.some((pattern) => pattern.test(answer)))
    .map((requirement) => requirement.label);
  const forbidden = (scenario.forbidden || [])
    .filter((item) => item.pattern.test(answer))
    .map((item) => item.label);
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const matched = scenario.required.length - missing.length;
  return {
    scenarioId: scenario.id,
    matched,
    total: scenario.required.length,
    coverage: scenario.required.length === 0 ? 1 : matched / scenario.required.length,
    missing,
    forbidden,
    wordCount,
    withinWordLimit: wordCount <= scenario.maxWords,
    latencyMs: metadata.latencyMs || 0,
    repaired: metadata.repaired === true,
  };
}

export function aggregateInterviewEvaluation(results: InterviewEvaluationResult[]): {
  coverage: number;
  repairCount: number;
  forbiddenCount: number;
  averageLatencyMs: number;
  passed: boolean;
} {
  const matched = results.reduce((sum, result) => sum + result.matched, 0);
  const total = results.reduce((sum, result) => sum + result.total, 0);
  const coverage = total === 0 ? 1 : matched / total;
  const forbiddenCount = results.reduce((sum, result) => sum + result.forbidden.length, 0);
  return {
    coverage,
    repairCount: results.filter((result) => result.repaired).length,
    forbiddenCount,
    averageLatencyMs: results.length === 0 ? 0 : results.reduce((sum, result) => sum + result.latencyMs, 0) / results.length,
    passed: coverage >= 0.95 && forbiddenCount === 0 && results.every((result) => result.withinWordLimit),
  };
}
