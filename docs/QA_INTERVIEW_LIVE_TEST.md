# Live QA Automation Interview Test

This opt-in test simulates roughly five minutes of back-and-forth between a QA Automation Engineer candidate and an interviewer. It uses the installed Ollama model and the configured localhost SearXNG service; it is skipped during the normal test suite.

## Run on Windows PowerShell

```powershell
$env:RUN_LIVE_QA_INTERVIEW='1'
npx vitest run src/main/__tests__/integration/liveQaInterview.test.ts --reporter=verbose
Remove-Item Env:RUN_LIVE_QA_INTERVIEW
```

Optional overrides:

```powershell
$env:OLLAMA_MODEL='qwen3.6:35b'
$env:OLLAMA_URL='http://127.0.0.1:11434'
$env:SEARXNG_URL='http://127.0.0.1:8080'
```

## What it evaluates

- Eight cumulative interview turns, including technical, behavioral, coding, and strategy questions.
- Retention of earlier facts and constraints in later answers.
- Selective web use: only the current-documentation question should search.
- Official Playwright citations for the documentation question.
- Detection of missing requirements, unsafe recommendations, invented metrics, and a known code-scope error pattern.
- Routine-turn, thinking-turn, and total response latency.

The test prints a single `QA_INTERVIEW_REPORT` JSON object containing every answer, timing, search count, source count, and failure. It intentionally fails if Raven misses a required concept, invents a forbidden claim, searches unnecessarily, exceeds the response-size budget, or misses the latency target.
