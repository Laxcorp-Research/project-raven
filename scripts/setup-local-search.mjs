import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { SEARXNG_REPOSITORY, SEARXNG_REVISION, localSearchPaths, writeManagedSettings } from './local-search-runtime.mjs'

const paths = localSearchPaths()
const launcher = process.platform === 'win32' ? ['py', ['-3.12']] : ['python3.12', []]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: paths.projectRoot,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, PYTHONUTF8: '1' },
    ...options,
  })
  if (result.error || result.status !== 0) {
    throw result.error || new Error(`${command} exited with ${result.status}`)
  }
}

const versionProbe = spawnSync(launcher[0], [...launcher[1], '-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'], {
  encoding: 'utf8', shell: false,
})
if (versionProbe.status !== 0 || !versionProbe.stdout.trim().startsWith('3.12.')) {
  console.error('Python 3.12 is required. Install it and ensure `py -3.12` works on Windows.')
  process.exit(1)
}

mkdirSync(paths.runtime, { recursive: true })
if (!existsSync(paths.repository)) {
  run('git', ['clone', '--bare', '--filter=blob:none', SEARXNG_REPOSITORY, paths.repository])
}
run('git', ['--git-dir', paths.repository, 'config', 'core.protectNTFS', 'false'])
run('git', ['--git-dir', paths.repository, 'fetch', '--depth', '1', 'origin', SEARXNG_REVISION])

// The upstream repository contains Linux deployment-template filenames with
// colons, which NTFS cannot check out. Export only the pinned Python runtime
// paths from the bare repository so Windows never materializes those files.
mkdirSync(paths.source, { recursive: true })
const archive = spawnSync('git', [
  '--git-dir', paths.repository, 'archive', '--format=tar', SEARXNG_REVISION,
  'searx', 'searxng_extra', 'setup.py', 'README.rst', 'requirements.txt',
  'requirements-dev.txt', 'babel.cfg', 'LICENSE',
], { cwd: paths.projectRoot, encoding: null, shell: false, maxBuffer: 256 * 1024 * 1024 })
if (archive.error || archive.status !== 0 || !archive.stdout) {
  throw archive.error || new Error(`Could not export pinned SearXNG files (git exit ${archive.status}).`)
}
const extracted = spawnSync('tar', ['-xf', '-', '-C', paths.source], {
  cwd: paths.projectRoot, input: archive.stdout, stdio: ['pipe', 'inherit', 'inherit'], shell: false,
})
if (extracted.error || extracted.status !== 0) {
  throw extracted.error || new Error(`Could not extract pinned SearXNG files (tar exit ${extracted.status}).`)
}
run(process.execPath, [new URL('./patch-searxng-windows.mjs', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)), paths.source])

if (!existsSync(paths.python)) run(launcher[0], [...launcher[1], '-m', 'venv', paths.venv])
run(paths.python, ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'])
run(paths.python, ['-m', 'pip', 'install', 'pyyaml', 'msgspec', 'typing-extensions', 'pybind11'])
run(paths.python, ['-m', 'pip', 'install', '--use-pep517', '--no-build-isolation', '--editable', paths.source])

writeManagedSettings(paths.settings)
writeFileSync(paths.marker, JSON.stringify({
  revision: SEARXNG_REVISION,
  pythonVersion: versionProbe.stdout.trim(),
}, null, 2), { encoding: 'utf8', mode: 0o600 })

console.log('Raven managed local search is installed. Docker is not required.')
console.log('Run `npm run local-search:check` to verify the pinned runtime.')
