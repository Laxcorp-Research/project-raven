import { describe, expect, it } from 'vitest'
import { OllamaProvider } from '../../services/ai/ollamaProvider'
import { webSearchService } from '../../services/webSearchService'

const RUN_LIVE = process.env.RUN_LIVE_QA_INTERVIEW === '1'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.6:35b'
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8080'

interface InterviewTurn {
  name: string
  interviewer: string
  expected: RegExp[][]
  forbidden?: RegExp[]
  maxWords: number
  thinking?: boolean
  forceSearch?: boolean
}

const turns: InterviewTurn[] = [
  {
    name: 'experience summary',
    interviewer: 'Give me a concise 60-second introduction. The candidate has six years in QA automation, uses Playwright with TypeScript, tests REST APIs, builds GitHub Actions pipelines, and led a Cypress-to-Playwright migration. Do not invent employers or metrics.',
    expected: [[/six years|6 years/i], [/playwright/i], [/typescript/i], [/rest|api/i], [/github actions|ci/i], [/cypress.*playwright|migration/i]],
    maxWords: 170,
  },
  {
    name: 'risk-based release plan',
    interviewer: 'We release checkout in two days. It supports cards, PayPal, and promo codes. A prior production incident caused duplicate charges, and you are the only QA engineer. What do you automate first, and why?',
    expected: [[/duplicate|idempoten/i], [/risk|impact|critical/i], [/api|service/i], [/smoke|critical path|happy path/i], [/two days|timebox|limited time/i]],
    maxWords: 190,
  },
  {
    name: 'flaky parallel test diagnosis',
    interviewer: 'Follow-up: the Playwright checkout test passes locally but fails about 8% in CI with six parallel workers. Every worker uses the same account and fixed order ID. A teammate proposes waitForTimeout(5000). Diagnose it and give your first three debugging actions.',
    expected: [[/shared account|fixed order|collision|race/i], [/unique|isolat/i], [/trace|video|screenshot/i], [/waitForTimeout|hard wait|arbitrary wait/i], [/parallel|worker/i]],
    forbidden: [/recommend(?:ed)?\s+waitForTimeout/i],
    maxWords: 210,
  },
  {
    name: 'async polling coding problem',
    interviewer: `Fix this helper so it is production-safe and testable without an arbitrary fixed sleep:\n\nasync function orderReady(id) {\n  for (let attempt = 0; attempt < 3; attempt++) {\n    const response = fetch('/orders/' + id);\n    if (response.status === 200) return true;\n  }\n  return false;\n}`,
    expected: [[/await\s+fetch/i], [/response\.ok|response\.status/i], [/backoff|delay|interval|poll/i], [/throw|catch|error|abort/i]],
    forbidden: [/try[\s\S]*const timeoutId[\s\S]*catch[\s\S]*clearTimeout\(timeoutId\)/i],
    maxWords: 280,
  },
  {
    name: 'behavioral continuity',
    interviewer: 'Behavioral follow-up: tell me about pushing back when a developer wanted to disable that flaky test. What actually happened: you quarantined only the test, assigned an owner, used Playwright traces, found the shared test account as the root cause, fixed isolation, and re-enabled it. Give a short STAR answer without inventing a metric.',
    expected: [[/quarantin/i], [/owner/i], [/trace/i], [/shared.*account|account.*shared/i], [/isolat/i], [/re-enabled|reintroduced|restored/i]],
    forbidden: [/reduced (?:failures|flakiness|flake rate) by \d+/i, /\b100%\s+(?:suite\s+)?stability/i],
    maxWords: 190,
  },
  {
    name: 'payment reliability strategy',
    interviewer: 'Design the highest-value tests for POST /payments. It accepts Idempotency-Key, clients retry after a 504, and provider webhooks are at-least-once and can arrive out of order. Cover API, persistence, events, and only essential UI checks.',
    expected: [[/idempoten|duplicate charge/i], [/504|retry/i], [/webhook/i], [/out of order|reorder/i], [/duplicate event|at-least-once|dedup/i], [/database|persist|ledger|state/i], [/ui|checkout/i]],
    maxWords: 240,
  },
  {
    name: 'current official documentation',
    interviewer: 'Verify against current official Playwright documentation whether locator actions and web-first assertions auto-wait or retry, and whether hard waits are recommended. Give the team a concise policy with source links.',
    expected: [[/playwright\.dev/i], [/locator/i], [/auto.?wait/i], [/retry|retries/i], [/hard wait|waitForTimeout/i]],
    forbidden: [/hard waits? (?:are|is) recommended/i],
    maxWords: 190,
    thinking: true,
    forceSearch: true,
  },
  {
    name: 'cross-turn synthesis',
    interviewer: 'Final follow-up: given the two-day deadline, one QA engineer, the 8% CI flake, and the duplicate-charge history, give me an exact first-day execution plan that uses what we discussed.',
    expected: [[/duplicate|idempoten/i], [/unique.*account|test data|isolat/i], [/trace/i], [/quarantin/i], [/api/i], [/smoke|critical path|checkout/i]],
    maxWords: 220,
  },
]

describe.skipIf(!RUN_LIVE)('live five-minute QA automation interview', () => {
  it('maintains context, answers correctly, searches selectively, and stays meeting-usable', async () => {
    const provider = new OllamaProvider(OLLAMA_MODEL, OLLAMA_URL)
    const transcript: string[] = []
    const results: Array<Record<string, unknown>> = []
    const failures: string[] = []
    const started = Date.now()

    for (const turn of turns) {
      transcript.push(`Interviewer: ${turn.interviewer}`)
      let answer = ''
      let searchInvocations = 0
      let sourceCount = 0
      const turnStarted = Date.now()

      await provider.streamResponse({
        system: `You are Raven helping a candidate during a live QA Automation Engineer interview. Answer with the exact technically accurate words the candidate can say next. Preserve facts and constraints from the cumulative transcript; never invent employers, outcomes, or metrics. Lead with the answer and stay concise. For concurrency and state questions, verify ownership, isolation, copying, transfer, and true sharing instead of assuming.`,
        messages: [{ role: 'user', content: `<transcript>\n${transcript.join('\n')}\n</transcript>\n\nGive the candidate's next answer.` }],
        maxTokens: 400,
      }, {
        onText: (text) => { answer += text },
        onDone: () => {},
        onError: (error) => { throw new Error(error) },
      }, {
        thinking: turn.thinking === true,
        webSearch: {
          force: turn.forceSearch === true,
          fallbackQuery: turn.interviewer,
          search: async (query, signal) => {
            searchInvocations += 1
            return webSearchService.search({ backend: 'searxng', searxngBaseUrl: SEARXNG_URL }, query, signal)
          },
          onSearch: (count) => { sourceCount = count },
        },
      })

      const elapsedMs = Date.now() - turnStarted
      const wordCount = answer.trim().split(/\s+/).filter(Boolean).length
      const missing = turn.expected.flatMap((alternatives) => alternatives.some((pattern) => pattern.test(answer)) ? [] : [alternatives.map(String).join(' OR ')])
      const forbidden = (turn.forbidden || []).filter((pattern) => pattern.test(answer)).map(String)
      if (missing.length) failures.push(`${turn.name}: missing ${missing.join(', ')}`)
      if (forbidden.length) failures.push(`${turn.name}: forbidden ${forbidden.join(', ')}`)
      if (wordCount > turn.maxWords) failures.push(`${turn.name}: ${wordCount} words exceeds ${turn.maxWords}`)
      if (!turn.forceSearch && searchInvocations > 0) failures.push(`${turn.name}: unnecessary web search (${searchInvocations})`)
      if (turn.forceSearch && (searchInvocations === 0 || sourceCount === 0)) failures.push(`${turn.name}: expected grounded web evidence`)
      if (!turn.thinking && elapsedMs > 15_000) failures.push(`${turn.name}: fast turn took ${elapsedMs}ms`)
      if (turn.thinking && elapsedMs > 35_000) failures.push(`${turn.name}: thinking turn took ${elapsedMs}ms`)

      results.push({ name: turn.name, elapsedMs, wordCount, searchInvocations, sourceCount, answer })
      transcript.push(`Candidate: ${answer}`)
    }

    const totalMs = Date.now() - started
    if (totalMs > 120_000) failures.push(`total latency ${totalMs}ms exceeds 120000ms`)
    console.log(`QA_INTERVIEW_REPORT=${JSON.stringify({ model: OLLAMA_MODEL, totalMs, failures, turns: results })}`)
    expect(failures, failures.join('\n')).toEqual([])
  }, 300_000)
})
