import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const runtime = join(root, '.raven-runtime')
const wlk = process.platform === 'win32' ? join(runtime, 'venv', 'Scripts', 'wlk.exe') : join(runtime, 'venv', 'bin', 'wlk')
if (!existsSync(wlk)) {
  console.error('WhisperLiveKit runtime is missing. Run `npm run local-stt:setup`.')
  process.exit(1)
}
const check = spawnSync(wlk, ['check'], { cwd: root, stdio: 'inherit', shell: false, env: { ...process.env, PYTHONUTF8: '1' } })
if (check.status !== 0) process.exit(check.status || 1)

const modelRoot = join(runtime, 'models')
const modelMarker = join(modelRoot, 'hub', 'models--Systran--faster-whisper-base.en')
if (!existsSync(modelMarker)) {
  console.error('base.en is not downloaded. Run the explicit pull command printed by `npm run local-stt:setup`.')
  process.exit(2)
}

const portArg = process.argv.find((arg) => arg.startsWith('--port='))
if (portArg) {
  const port = Number(portArg.slice(7))
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(5_000), redirect: 'manual' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    console.log(`WhisperLiveKit health is ready on 127.0.0.1:${port}.`)
  } catch (error) {
    console.error(`WhisperLiveKit health failed: ${error instanceof Error ? error.message : error}`)
    process.exit(3)
  }
} else {
  console.log('Runtime and model checks passed. Use `node scripts/check-local-stt.mjs --port=<port>` to verify a running server health endpoint.')
}
