import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const SEARXNG_REVISION = '6bfd82705a545a1535e36d0903fafe26c669a0fe'
export const SEARXNG_REPOSITORY = 'https://github.com/searxng/searxng.git'
export const MANAGED_SEARXNG_URL = 'http://127.0.0.1:8080'

export function localSearchPaths(projectRoot = process.env.RAVEN_RUNTIME_ROOT || resolve(import.meta.dirname, '..')) {
  const runtime = join(projectRoot, '.raven-runtime', 'local-search')
  const venv = join(runtime, 'venv')
  return {
    projectRoot,
    runtime,
    repository: join(runtime, 'repository.git'),
    source: join(runtime, 'app'),
    venv,
    python: process.platform === 'win32' ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python'),
    settings: join(runtime, 'settings.yml'),
    marker: join(runtime, 'runtime.json'),
  }
}

export function writeManagedSettings(path) {
  mkdirSync(resolve(path, '..'), { recursive: true })
  const secret = randomBytes(24).toString('hex')
  const settings = `use_default_settings: true

general:
  debug: false
  instance_name: "Raven Local Search"

search:
  safe_search: 1
  formats:
    - json

server:
  bind_address: "127.0.0.1"
  port: 8080
  limiter: false
  image_proxy: false
  secret_key: "${secret}"

outgoing:
  request_timeout: 8.0
  max_request_timeout: 12.0
`
  writeFileSync(path, settings, { encoding: 'utf8', mode: 0o600 })
}

export function readInstallMarker(path) {
  if (!existsSync(path)) return null
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return value && value.revision === SEARXNG_REVISION ? value : null
  } catch {
    return null
  }
}
