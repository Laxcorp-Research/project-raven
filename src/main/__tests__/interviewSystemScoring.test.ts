import { describe, expect, it } from 'vitest'
import {
  aggregateInterviewSystemScores,
  calculateWordErrorRate,
  scoreInterviewTurn,
} from '../services/interviewSystemScoring'

const completeInput = {
  scenarioId: 'complete',
  expectedTranscript: 'How would you test an eventually consistent API?',
  actualTranscript: 'How would you test an eventually consistent API?',
  answer: 'Assuming eventual consistency, I would poll observable API status with a bounded timeout and verify the final persisted state.',
  contextCriteria: [{ label: 'corrected constraint', patterns: [/eventual consistency/i] }],
  correctnessCriteria: [{ label: 'observable polling', patterns: [/poll observable/i] }, { label: 'bounded timeout', patterns: [/bounded timeout/i] }],
  usefulnessCriteria: [{ label: 'stated assumption', patterns: [/assuming/i] }, { label: 'verification', patterns: [/verify/i] }],
  latencyMs: 5_000,
  targetLatencyMs: 8_000,
  maximumLatencyMs: 15_000,
}

describe('interview system scoring', () => {
  it('calculates normalized word error rate', () => {
    expect(calculateWordErrorRate('one two three four', 'one two five four')).toBe(0.25)
    expect(calculateWordErrorRate('', '')).toBe(0)
    expect(calculateWordErrorRate('', 'invented')).toBe(1)
  })

  it('passes a complete, grounded, timely turn', () => {
    const score = scoreInterviewTurn(completeInput)
    expect(score).toMatchObject({ passed: true, criticalPassed: true, status: 'passed', transcriptionAccuracy: 1, contextAccuracy: 1, correctness: 1, usefulness: 1, latency: 1 })
    expect(score.overall).toBe(1)
  })

  it('fails a fast answer when correctness is missing', () => {
    const score = scoreInterviewTurn({ ...completeInput, answer: 'I would test it quickly.' })
    expect(score.latency).toBe(1)
    expect(score.correctness).toBe(0)
    expect(score.passed).toBe(false)
    expect(score.missing).toContain('bounded timeout')
  })

  it('requires uncertainty for an obscure question and rejects fabricated certainty', () => {
    const score = scoreInterviewTurn({
      ...completeInput,
      scenarioId: 'unknown',
      answer: 'It definitely guarantees exactly-once rollback.',
      contextCriteria: [],
      correctnessCriteria: [{ label: 'uncertainty', patterns: [/uncertain|cannot verify|assum/i] }],
      usefulnessCriteria: [{ label: 'next step', patterns: [/documentation|verify|clarify/i] }],
      forbidden: [{ label: 'fabricated guarantee', patterns: [/definitely guarantees/i] }],
    })
    expect(score.forbidden).toEqual(['fabricated guarantee'])
    expect(score.correctness).toBe(0)
    expect(score.passed).toBe(false)
  })

  it('degrades and then fails latency beyond the interview budget', () => {
    expect(scoreInterviewTurn({ ...completeInput, latencyMs: 11_500 }).latency).toBeCloseTo(0.5)
    expect(scoreInterviewTurn({ ...completeInput, latencyMs: 15_000 }).passed).toBe(false)
  })

  it('aggregates dimensions without allowing one failed turn to hide', () => {
    const passing = scoreInterviewTurn(completeInput)
    const failing = scoreInterviewTurn({ ...completeInput, scenarioId: 'failed', answer: 'I do not know.', latencyMs: 20_000 })
    const summary = aggregateInterviewSystemScores([passing, failing])
    expect(summary.turns).toBe(2)
    expect(summary.passedTurns).toBe(1)
    expect(summary.passed).toBe(false)
    expect(summary.status).toBe('failed')
    expect(summary.criticalPassRate).toBe(0.5)
  })

  it('reports correct but incomplete answers separately from critical failures', () => {
    const incomplete = scoreInterviewTurn({
      ...completeInput,
      usefulnessCriteria: [{ label: 'numbered presentation', patterns: [/^1\./m], severity: 'advisory' as const }],
    })
    expect(incomplete.criticalPassed).toBe(true)
    expect(incomplete.passed).toBe(false)
    expect(incomplete.status).toBe('incomplete')
    expect(incomplete.missingCritical).toEqual([])
    expect(incomplete.missingAdvisory).toContain('numbered presentation')

    const summary = aggregateInterviewSystemScores([scoreInterviewTurn(completeInput), incomplete])
    expect(summary.status).toBe('incomplete')
    expect(summary.criticalPassRate).toBe(1)
    expect(summary.completenessPassRate).toBe(0.5)
  })
})
