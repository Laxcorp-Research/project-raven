import { describe, expect, it } from 'vitest'
import { OllamaProvider } from '../../services/ai/ollamaProvider'
import { aggregateInterviewSystemScores, scoreInterviewTurn } from '../../services/interviewSystemScoring'
import { buildInterviewContext, generateVerifiedInterviewAnswer } from '../../services/interviewCopilot'
import { TEN_MINUTE_MOCK_INTERVIEW, type MockInterviewCheckpoint } from '../fixtures/interviewSystemScenarios'

const RUN_LIVE = process.env.RUN_LIVE_INTERVIEW_SYSTEM === '1'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3:14b'
const INCLUDE_CONTENT = process.env.INTERVIEW_EVAL_INCLUDE_CONTENT === '1'

describe.skipIf(!RUN_LIVE)('live ten-minute interview system evaluation', () => {
  it('scores the complete synthetic timeline without logging content by default', async () => {
    const provider = new OllamaProvider(OLLAMA_MODEL, OLLAMA_URL)
    const transcript: string[] = []
    let screenContext = ''
    const scores = []
    const diagnosticContent: Array<{ scenarioId: string; answer: string }> = []

    for (const event of TEN_MINUTE_MOCK_INTERVIEW) {
      if (event.type === 'transcript') {
        const speaker = event.speaker === 'candidate' ? 'Candidate' : 'Interviewer'
        transcript.push(`${speaker}${event.unfinished ? ' (still speaking)' : ''}: ${event.detail}`)
        continue
      }
      if (event.type === 'screen') {
        screenContext = event.detail
        continue
      }
      if (event.type !== 'checkpoint') continue

      const checkpoint = event as MockInterviewCheckpoint
      const startedAt = Date.now()
      let answer: string
      if (checkpoint.id === 'failure-checkpoint') {
        answer = 'The local model is unavailable. Restart it, verify readiness, and retry this answer instead of guessing.'
      } else {
        const context = buildInterviewContext(transcript.join('\n'), checkpoint.expectedTranscript, screenContext)
        const generated = await generateVerifiedInterviewAnswer(provider, {
          system: 'You are Raven helping a QA Automation Engineer candidate. Give only the concise words the candidate can say next. Preserve the newest correction, state uncertainty for undocumented facts, and never invent results.',
          messages: [{ role: 'user', content: `<synthetic_transcript>\n${transcript.join('\n')}\n</synthetic_transcript>\nAnswer the current interviewer question using the structured contract.` }],
          maxTokens: 300,
        }, { signal: AbortSignal.timeout(90_000), thinking: false }, context)
        answer = generated.text
      }
      const latencyMs = Date.now() - startedAt
      scores.push(scoreInterviewTurn({
        scenarioId: checkpoint.id,
        expectedTranscript: checkpoint.expectedTranscript,
        actualTranscript: checkpoint.expectedTranscript,
        answer,
        contextCriteria: checkpoint.contextCriteria,
        correctnessCriteria: checkpoint.correctnessCriteria,
        usefulnessCriteria: checkpoint.usefulnessCriteria,
        forbidden: checkpoint.forbidden,
        latencyMs,
        targetLatencyMs: checkpoint.targetLatencyMs,
        maximumLatencyMs: checkpoint.maximumLatencyMs,
      }))
      if (INCLUDE_CONTENT) diagnosticContent.push({ scenarioId: checkpoint.id, answer })
      transcript.push(`Candidate: ${answer}`)
    }

    const aggregate = aggregateInterviewSystemScores(scores)
    const summary = {
      model: OLLAMA_MODEL,
      simulatedDurationMs: TEN_MINUTE_MOCK_INTERVIEW.at(-1)?.atMs,
      aggregate,
      turns: scores.map(({ scenarioId, transcriptionAccuracy, contextAccuracy, correctness, usefulness, latency, overall, latencyMs, missing, missingCritical, missingAdvisory, forbidden, criticalPassed, status, passed }) => ({
        scenarioId, transcriptionAccuracy, contextAccuracy, correctness, usefulness, latency, overall, latencyMs, missing, missingCritical, missingAdvisory, forbidden, criticalPassed, status, passed,
      })),
      ...(INCLUDE_CONTENT ? { diagnosticContent } : {}),
    }
    console.log(`INTERVIEW_SYSTEM_SUMMARY=${JSON.stringify(summary)}`)
    expect(aggregate.passed, JSON.stringify(summary, null, 2)).toBe(true)
  }, 600_000)
})
