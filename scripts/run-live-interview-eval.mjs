import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const repeatsArg = args.find((arg) => arg.startsWith('--repeats='))
const repeats = Math.max(1, Number(repeatsArg?.split('=')[1] || process.env.INTERVIEW_EVAL_REPEATS || 1))
const models = args.filter((arg) => !arg.startsWith('--'))
if (models.length === 0) models.push(process.env.OLLAMA_MODEL || 'qwen3:14b')

const summaries = []
for (const model of models) {
  try {
    const warmup = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply only OK.' }],
        stream: false,
        keep_alive: '20m',
        options: { num_predict: 4 },
      }),
      signal: AbortSignal.timeout(180_000),
    })
    if (!warmup.ok) throw new Error(`HTTP ${warmup.status}: ${await warmup.text()}`)
  } catch (error) {
    summaries.push({ model, attempt: 0, error: `warmup failed: ${error instanceof Error ? error.message : String(error)}` })
    continue
  }
  for (let attempt = 1; attempt <= repeats; attempt += 1) {
    process.stdout.write(`Interview evaluation: ${model} (${attempt}/${repeats})\n`)
    const run = spawnSync(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'run', 'src/main/__tests__/integration/liveQaInterview.test.ts', '--reporter=verbose'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, RUN_LIVE_QA_INTERVIEW: '1', OLLAMA_MODEL: model },
        maxBuffer: 20 * 1024 * 1024,
      },
    )
    const output = `${run.stdout || ''}\n${run.stderr || ''}`
    const match = output.match(/QA_INTERVIEW_SUMMARY=(\{[^\r\n]+\})/)
    if (!match) {
      const errorLine = output.split(/\r?\n/).find((line) => /Ollama error:|timed out|out-of-memory/i.test(line)) || `exit ${run.status}`
      summaries.push({ model, attempt, error: errorLine.trim() })
      continue
    }
    summaries.push({ attempt, ...JSON.parse(match[1]) })
  }
}

process.stdout.write(`INTERVIEW_MODEL_COMPARISON=${JSON.stringify(summaries)}\n`)
if (summaries.every((summary) => summary.error)) process.exitCode = 1
