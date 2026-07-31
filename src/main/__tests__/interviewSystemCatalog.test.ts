import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { INTERVIEW_SYSTEM_SCENARIOS, TEN_MINUTE_MOCK_INTERVIEW } from './fixtures/interviewSystemScenarios'

describe('interview system scenario catalog', () => {
  it('covers every requested category with stable unique identifiers', () => {
    const ids = INTERVIEW_SYSTEM_SCENARIOS.map((scenario) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(50)
    expect(new Set(INTERVIEW_SYSTEM_SCENARIOS.map((scenario) => scenario.category))).toEqual(
      new Set(['conversation', 'audio', 'coding', 'ui', 'recovery', 'endurance']),
    )
    expect(INTERVIEW_SYSTEM_SCENARIOS.every((scenario) => /^[a-z]+(?:-[a-z0-9]+)+$/.test(scenario.id))).toBe(true)
  })

  it('gives every scenario measurable procedures and pipeline stages', () => {
    for (const scenario of INTERVIEW_SYSTEM_SCENARIOS) {
      expect(scenario.title.length, scenario.id).toBeGreaterThan(8)
      expect(scenario.stages.length, scenario.id).toBeGreaterThan(0)
      expect(scenario.steps.length, scenario.id).toBeGreaterThanOrEqual(2)
      expect(scenario.expected.length, scenario.id).toBeGreaterThan(0)
      expect(scenario.evidence.length, scenario.id).toBeGreaterThan(0)
      if (scenario.automation !== 'manual') expect(scenario.automatedBy?.length, scenario.id).toBeGreaterThan(0)
    }
  })

  it('never marks hardware-dependent scenarios as automatically passed', () => {
    const hardwareIds = [
      'audio-webcam-only-mic', 'audio-zoom-output', 'audio-headphones-speakers', 'audio-device-change',
      'ui-global-assist', 'ui-second-monitor', 'ui-capture-exclusion', 'recovery-sleep-lock',
      'endurance-thirty-sixty-minutes',
    ]
    for (const id of hardwareIds) {
      const scenario = INTERVIEW_SYSTEM_SCENARIOS.find((item) => item.id === id)
      expect(scenario?.automation, id).toBe('manual')
      expect(scenario?.evidence, id).toContain('content-free evidence reference')
    }
  })

  it('documents every gated manual scenario in the operator runbook', () => {
    const runbook = readFileSync(resolve('docs/interview-system-test-plan.md'), 'utf8')
    for (const scenario of INTERVIEW_SYSTEM_SCENARIOS.filter((item) => item.automation === 'manual')) {
      expect(runbook, scenario.id).toContain(`\`${scenario.id}\``)
    }
    expect(runbook).toMatch(/Not Run.*default/i)
    expect(runbook).toMatch(/Never store transcript text, audio, screenshots/i)
  })

  it('defines an ordered ten-minute timeline with every required stressor', () => {
    const times = TEN_MINUTE_MOCK_INTERVIEW.map((event) => event.atMs)
    expect(times).toEqual([...times].sort((left, right) => left - right))
    expect(times.at(-1)).toBeGreaterThanOrEqual(600_000)
    const ids = new Set(TEN_MINUTE_MOCK_INTERVIEW.map((event) => event.id))
    for (const id of ['fast-part-one', 'interviewer-overlap', 'clarification', 'visible-code', 'ollama-stop', 'ollama-recover', 'unknown-question', 'final-checkpoint']) {
      expect(ids.has(id), id).toBe(true)
    }
    expect(TEN_MINUTE_MOCK_INTERVIEW.filter((event) => event.type === 'checkpoint').length).toBeGreaterThanOrEqual(7)
  })
})
