export interface ScoreCriterion {
  label: string
  patterns: RegExp[]
  severity?: 'critical' | 'advisory'
}

export interface InterviewTurnScoreInput {
  scenarioId: string
  expectedTranscript: string
  actualTranscript: string
  answer: string
  contextCriteria: ScoreCriterion[]
  correctnessCriteria: ScoreCriterion[]
  usefulnessCriteria: ScoreCriterion[]
  forbidden?: ScoreCriterion[]
  latencyMs: number
  targetLatencyMs: number
  maximumLatencyMs: number
}

export interface InterviewTurnScore {
  scenarioId: string
  transcriptionAccuracy: number
  contextAccuracy: number
  correctness: number
  usefulness: number
  latency: number
  overall: number
  wordErrorRate: number
  missing: string[]
  missingCritical: string[]
  missingAdvisory: string[]
  forbidden: string[]
  latencyMs: number
  criticalPassed: boolean
  status: 'passed' | 'incomplete' | 'failed'
  passed: boolean
}

export interface InterviewSystemScoreSummary {
  turns: number
  transcriptionAccuracy: number
  contextAccuracy: number
  correctness: number
  usefulness: number
  latency: number
  overall: number
  passedTurns: number
  criticalPassedTurns: number
  criticalPassRate: number
  completenessPassRate: number
  status: 'passed' | 'incomplete' | 'failed'
  passed: boolean
}

const SCORE_WEIGHTS = {
  transcriptionAccuracy: 0.2,
  contextAccuracy: 0.25,
  correctness: 0.3,
  usefulness: 0.15,
  latency: 0.1,
} as const

export function scoreInterviewTurn(input: InterviewTurnScoreInput): InterviewTurnScore {
  const wordErrorRate = calculateWordErrorRate(input.expectedTranscript, input.actualTranscript)
  const transcriptionAccuracy = clamp01(1 - wordErrorRate)
  const context = scoreCriteria(input.answer, input.contextCriteria, 'advisory')
  const correct = scoreCriteria(input.answer, input.correctnessCriteria, 'critical')
  const useful = scoreCriteria(input.answer, input.usefulnessCriteria, 'advisory')
  const forbidden = (input.forbidden || [])
    .filter((criterion) => criterion.patterns.some((pattern) => pattern.test(input.answer)))
    .map((criterion) => criterion.label)
  const correctness = forbidden.length === 0 ? correct.score : 0
  const latency = scoreLatency(input.latencyMs, input.targetLatencyMs, input.maximumLatencyMs)
  const overall = weightedScore({ transcriptionAccuracy, contextAccuracy: context.score, correctness, usefulness: useful.score, latency })
  const missing = [...context.missing, ...correct.missing, ...useful.missing]
  const missingCritical = [
    ...correct.missingCritical,
    ...forbidden,
    ...context.missingCritical,
    ...useful.missingCritical,
  ]
  const missingAdvisory = [
    ...context.missingAdvisory,
    ...correct.missingAdvisory,
    ...useful.missingAdvisory,
  ]
  const criticalPassed = correctness >= 0.8 && forbidden.length === 0 && missingCritical.length === 0
  const passed = transcriptionAccuracy >= 0.85
    && context.score >= 0.8
    && correctness >= 0.8
    && useful.score >= 0.7
    && latency > 0
    && forbidden.length === 0

  return {
    scenarioId: input.scenarioId,
    transcriptionAccuracy,
    contextAccuracy: context.score,
    correctness,
    usefulness: useful.score,
    latency,
    overall,
    wordErrorRate,
    missing,
    missingCritical,
    missingAdvisory,
    forbidden,
    latencyMs: input.latencyMs,
    criticalPassed,
    status: !criticalPassed ? 'failed' : passed ? 'passed' : 'incomplete',
    passed,
  }
}

export function aggregateInterviewSystemScores(scores: InterviewTurnScore[]): InterviewSystemScoreSummary {
  const average = (key: keyof Pick<InterviewTurnScore, 'transcriptionAccuracy' | 'contextAccuracy' | 'correctness' | 'usefulness' | 'latency' | 'overall'>) => (
    scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score[key], 0) / scores.length
  )
  const summary = {
    turns: scores.length,
    transcriptionAccuracy: average('transcriptionAccuracy'),
    contextAccuracy: average('contextAccuracy'),
    correctness: average('correctness'),
    usefulness: average('usefulness'),
    latency: average('latency'),
    overall: average('overall'),
    passedTurns: scores.filter((score) => score.passed).length,
    criticalPassedTurns: scores.filter((score) => score.criticalPassed).length,
    criticalPassRate: scores.length === 0 ? 0 : scores.filter((score) => score.criticalPassed).length / scores.length,
    completenessPassRate: scores.length === 0 ? 0 : scores.filter((score) => score.passed).length / scores.length,
    status: 'failed' as InterviewSystemScoreSummary['status'],
    passed: false,
  }
  summary.passed = scores.length > 0
    && summary.passedTurns === scores.length
    && summary.overall >= 0.8
    && summary.correctness >= 0.85
  summary.status = summary.criticalPassedTurns < scores.length ? 'failed' : summary.passed ? 'passed' : 'incomplete'
  return summary
}

export function calculateWordErrorRate(expected: string, actual: string): number {
  const reference = tokenize(expected)
  const hypothesis = tokenize(actual)
  if (reference.length === 0) return hypothesis.length === 0 ? 0 : 1
  const previous = Array.from({ length: hypothesis.length + 1 }, (_, index) => index)
  for (let row = 1; row <= reference.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= hypothesis.length; column += 1) {
      const above = previous[column]
      const substitution = diagonal + (reference[row - 1] === hypothesis[column - 1] ? 0 : 1)
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, substitution)
      diagonal = above
    }
  }
  return previous[hypothesis.length] / reference.length
}

function scoreCriteria(answer: string, criteria: ScoreCriterion[], defaultSeverity: 'critical' | 'advisory'): { score: number; missing: string[]; missingCritical: string[]; missingAdvisory: string[] } {
  if (criteria.length === 0) return { score: 1, missing: [], missingCritical: [], missingAdvisory: [] }
  const failed = criteria
    .filter((criterion) => !criterion.patterns.some((pattern) => pattern.test(answer)))
  const missing = failed.map((criterion) => criterion.label)
  return {
    score: (criteria.length - missing.length) / criteria.length,
    missing,
    missingCritical: failed.filter((criterion) => (criterion.severity || defaultSeverity) === 'critical').map((criterion) => criterion.label),
    missingAdvisory: failed.filter((criterion) => (criterion.severity || defaultSeverity) === 'advisory').map((criterion) => criterion.label),
  }
}

function scoreLatency(actual: number, target: number, maximum: number): number {
  if (actual <= target) return 1
  if (actual >= maximum || maximum <= target) return 0
  return 1 - ((actual - target) / (maximum - target))
}

function weightedScore(scores: Pick<InterviewSystemScoreSummary, 'transcriptionAccuracy' | 'contextAccuracy' | 'correctness' | 'usefulness' | 'latency'>): number {
  return Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => sum + scores[key as keyof typeof scores] * weight, 0)
}

function tokenize(value: string): string[] {
  return value.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, ' ').trim().split(/\s+/).filter(Boolean)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
