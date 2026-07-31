import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const repeatsArg = args.find((arg) => arg.startsWith('--repeats='))
const repeats = Math.max(1, Number(repeatsArg?.split('=')[1] || process.env.INTERVIEW_EVAL_REPEATS || process.env.npm_config_repeats || 1))
const models = args.filter((arg) => !arg.startsWith('--'))
if (models.length === 0) models.push(process.env.OLLAMA_MODEL || 'qwen3:14b')

const summaries = []
for (const model of models) {
  for (let attempt = 1; attempt <= repeats; attempt += 1) {
    process.stdout.write(`Interview system evaluation: ${model} (${attempt}/${repeats})\n`)
    const run = spawnSync(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'run', 'src/main/__tests__/integration/liveInterviewSystem.test.ts', '--reporter=verbose'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, RUN_LIVE_INTERVIEW_SYSTEM: '1', OLLAMA_MODEL: model },
        maxBuffer: 20 * 1024 * 1024,
      },
    )
    const output = `${run.stdout || ''}\n${run.stderr || ''}`
    const match = output.match(/INTERVIEW_SYSTEM_SUMMARY=(\{[^\r\n]+\})/)
    if (match) {
      summaries.push({ attempt, ...JSON.parse(match[1]) })
    } else {
      summaries.push({ model, attempt, error: `evaluation exited with code ${run.status ?? 'unknown'}` })
    }
  }
}

process.stdout.write(`INTERVIEW_SYSTEM_COMPARISON=${JSON.stringify(summaries)}\n`)
const successful = summaries.filter((summary) => !summary.error && summary.aggregate)
const modelComparison = models.map((model) => {
  const runs = successful.filter((summary) => summary.model === model)
  const average = (key) => runs.length === 0 ? 0 : runs.reduce((sum, run) => sum + Number(run.aggregate[key] || 0), 0) / runs.length
  const latencies = runs.flatMap((run) => run.turns.map((turn) => Number(turn.latencyMs))).sort((left, right) => left - right)
  const percentile = (fraction) => latencies.length === 0 ? 0 : latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * fraction) - 1)]
  return {
    model,
    runs: runs.length,
    passRate: runs.length === 0 ? 0 : runs.filter((run) => run.aggregate.passed).length / runs.length,
    criticalPassRate: average('criticalPassRate'),
    completenessPassRate: average('completenessPassRate'),
    statuses: runs.reduce((counts, run) => ({ ...counts, [run.aggregate.status]: (counts[run.aggregate.status] || 0) + 1 }), {}),
    transcriptionAccuracy: average('transcriptionAccuracy'),
    contextAccuracy: average('contextAccuracy'),
    correctness: average('correctness'),
    usefulness: average('usefulness'),
    overall: average('overall'),
    latencyP50Ms: percentile(0.5),
    latencyP95Ms: percentile(0.95),
    missingCriteria: [...new Set(runs.flatMap((run) => run.turns.flatMap((turn) => turn.missing)))],
    missingCriticalCriteria: [...new Set(runs.flatMap((run) => run.turns.flatMap((turn) => turn.missingCritical || [])))],
    missingAdvisoryCriteria: [...new Set(runs.flatMap((run) => run.turns.flatMap((turn) => turn.missingAdvisory || [])))],
  }
})
process.stdout.write(`INTERVIEW_SYSTEM_MODEL_SUMMARY=${JSON.stringify(modelComparison)}\n`)
if (summaries.some((summary) => summary.error || summary.aggregate?.passed !== true)) process.exitCode = 1
