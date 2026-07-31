import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { localSearchPaths, readInstallMarker } from './local-search-runtime.mjs'

const paths = localSearchPaths()
const missing = []
if (!existsSync(paths.python)) missing.push('Python virtual environment')
if (!existsSync(paths.settings)) missing.push('loopback settings')
if (!readInstallMarker(paths.marker)) missing.push('pinned installation marker')
if (missing.length) {
  console.error(`Managed local search is not ready: missing ${missing.join(', ')}. Run npm run local-search:setup.`)
  process.exit(1)
}

const probe = spawnSync(paths.python, ['-c', 'import searx; print("ready")'], {
  cwd: paths.projectRoot, encoding: 'utf8', shell: false, env: { ...process.env, PYTHONUTF8: '1' },
})
if (probe.status !== 0 || probe.stdout.trim() !== 'ready') {
  console.error('Managed local search Python import failed. Run npm run local-search:setup.')
  process.exit(2)
}

console.log('Managed local search runtime is ready. Docker is not required.')
