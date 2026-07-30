import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const runtime = join(root, '.raven-runtime')
const venv = join(runtime, 'venv')
const python = process.platform === 'win32' ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python')
const wlk = process.platform === 'win32' ? join(venv, 'Scripts', 'wlk.exe') : join(venv, 'bin', 'wlk')
const launcher = process.platform === 'win32' ? ['py', ['-3.12']] : ['python3.12', []]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false, ...options })
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} exited with ${result.status}`)
}

const versionProbe = spawnSync(launcher[0], [...launcher[1], '-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'], { encoding: 'utf8', shell: false })
if (versionProbe.status !== 0) {
  console.error('Python 3.12 was not found. Install Python 3.12 and ensure `py -3.12` (Windows) or `python3.12` works.')
  process.exit(1)
}
const version = versionProbe.stdout.trim()
if (!version.startsWith('3.12.')) {
  console.error(`Python 3.12 is required; found ${version}.`)
  process.exit(1)
}

mkdirSync(runtime, { recursive: true })
if (!existsSync(python)) run(launcher[0], [...launcher[1], '-m', 'venv', venv])
run(python, ['-m', 'pip', 'install', '--upgrade', 'pip'])
run(python, ['-m', 'pip', 'install', '--requirement', join(root, 'requirements-local-stt.txt')])

// WhisperLiveKit 0.2.24 cancels its Deepgram-compatible results consumer as
// soon as CloseStream starts finalizing the remaining audio. Apply Raven's
// narrowly scoped compatibility repair after every install/upgrade.
const moduleProbe = spawnSync(python, [
  '-c',
  'from pathlib import Path; import whisperlivekit; print(Path(whisperlivekit.__file__).parent / "deepgram_compat.py")',
], { cwd: root, encoding: 'utf8', shell: false })
if (moduleProbe.error || moduleProbe.status !== 0 || !moduleProbe.stdout.trim()) {
  throw moduleProbe.error || new Error('Could not locate WhisperLiveKit deepgram_compat.py')
}
run(process.execPath, [join(root, 'scripts', 'patch-whisperlivekit.mjs'), moduleProbe.stdout.trim()])
run(wlk, ['check'], { env: { ...process.env, PYTHONUTF8: '1' } })

const modelRoot = join(runtime, 'models')
const modelMarker = join(modelRoot, 'hub', 'models--Systran--faster-whisper-base.en')
if (!existsSync(modelMarker)) {
  console.log('\nWhisperLiveKit is installed, but base.en model weights are not present.')
  console.log('Download them explicitly (hundreds of MB) with:')
  if (process.platform === 'win32') {
    console.log(`$env:HF_HOME='${modelRoot}'; & '${wlk}' pull base.en`)
  } else {
    console.log(`HF_HOME='${modelRoot}' '${wlk}' pull base.en`)
  }
  console.log('Then run `npm run local-stt:check`. No model was downloaded automatically.')
  process.exit(0)
}

console.log('Local STT runtime and base.en model are ready. Start Raven and use the in-app health check.')
