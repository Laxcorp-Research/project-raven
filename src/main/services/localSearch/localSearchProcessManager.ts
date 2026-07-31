import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createLogger } from '../../logger'

const log = createLogger('LocalSearch')
export const MANAGED_SEARXNG_URL = 'http://127.0.0.1:8080'
export const SEARXNG_REVISION = '6bfd82705a545a1535e36d0903fafe26c669a0fe'
const STARTUP_TIMEOUT_MS = 90_000

export type LocalSearchState = 'not-installed' | 'stopped' | 'installing' | 'starting' | 'ready' | 'external' | 'failed'

export interface LocalSearchStatus {
  state: LocalSearchState
  installed: boolean
  endpoint: string
  managed: boolean
  pid?: number
  error?: string
}

interface ManagerDependencies {
  spawn: typeof spawn
  fetch: typeof fetch
  existsSync: typeof existsSync
  readFileSync: typeof readFileSync
  now: () => number
  delay: (ms: number) => Promise<void>
}

export class LocalSearchProcessManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private startPromise: Promise<LocalSearchStatus> | null = null
  private installPromise: Promise<LocalSearchStatus> | null = null
  private stopping = false
  private root: string
  private status: LocalSearchStatus
  private readonly dependencies: ManagerDependencies

  constructor(root = process.env.RAVEN_RUNTIME_ROOT || process.cwd(), dependencies: Partial<ManagerDependencies> = {}) {
    this.root = resolve(root)
    this.dependencies = {
      spawn,
      fetch,
      existsSync,
      readFileSync,
      now: Date.now,
      delay: (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms)),
      ...dependencies,
    }
    const installed = this.isInstalled()
    this.status = {
      state: installed ? 'stopped' : 'not-installed',
      installed,
      endpoint: MANAGED_SEARXNG_URL,
      managed: false,
    }
  }

  getStatus(): LocalSearchStatus {
    const installed = this.isInstalled()
    if (!installed && !['installing', 'starting'].includes(this.status.state)) {
      this.status = { state: 'not-installed', installed: false, endpoint: MANAGED_SEARXNG_URL, managed: false }
    }
    return { ...this.status, installed }
  }

  configureRoot(root: string): void {
    if (this.child || this.startPromise || this.installPromise) return
    this.root = resolve(root)
    const installed = this.isInstalled()
    this.status = { state: installed ? 'stopped' : 'not-installed', installed, endpoint: MANAGED_SEARXNG_URL, managed: false }
  }

  getRuntimePaths() {
    const runtime = join(this.root, '.raven-runtime', 'local-search')
    const venv = join(runtime, 'venv')
    return {
      runtime,
      source: join(runtime, 'app'),
      python: process.platform === 'win32' ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python'),
      settings: join(runtime, 'settings.yml'),
      marker: join(runtime, 'runtime.json'),
    }
  }

  isInstalled(): boolean {
    const paths = this.getRuntimePaths()
    if (![paths.python, paths.settings, paths.marker].every((path) => this.dependencies.existsSync(path))) return false
    try {
      const marker = JSON.parse(this.dependencies.readFileSync(paths.marker, 'utf8')) as { revision?: string }
      return marker.revision === SEARXNG_REVISION
    } catch {
      return false
    }
  }

  async install(setupScript: string, executable = process.execPath): Promise<LocalSearchStatus> {
    if (this.installPromise) return this.installPromise
    this.installPromise = this.runInstall(setupScript, executable).finally(() => { this.installPromise = null })
    return this.installPromise
  }

  async ensureAvailable(baseUrl = MANAGED_SEARXNG_URL): Promise<LocalSearchStatus> {
    const endpoint = normalizeEndpoint(baseUrl)
    if (endpoint !== MANAGED_SEARXNG_URL) {
      const healthy = await this.probe(endpoint)
      if (!healthy) throw new Error('The custom local SearXNG endpoint is unavailable.')
      return { state: 'external', installed: this.isInstalled(), endpoint, managed: false }
    }

    if (await this.probe(endpoint)) {
      const managed = Boolean(this.child && this.child.exitCode === null)
      this.status = { state: managed ? 'ready' : 'external', installed: this.isInstalled(), endpoint, managed, pid: managed ? this.child?.pid : undefined }
      return this.getStatus()
    }
    if (!this.isInstalled()) {
      this.status = { state: 'not-installed', installed: false, endpoint, managed: false, error: 'Free local search needs one-time installation in Settings.' }
      throw new Error(this.status.error)
    }
    if (!this.startPromise) {
      this.startPromise = this.startManaged().finally(() => { this.startPromise = null })
    }
    return this.startPromise
  }

  async probe(baseUrl = MANAGED_SEARXNG_URL): Promise<boolean> {
    try {
      const response = await this.dependencies.fetch(`${normalizeEndpoint(baseUrl)}/`, {
        signal: AbortSignal.timeout(3_000),
        redirect: 'manual',
      })
      if (!response.ok || response.status >= 300) return false
      const body = (await response.text()).slice(0, 65_536)
      return /searxng/i.test(body)
    } catch {
      return false
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    await this.stopOwnedChild()
    this.status = {
      state: this.isInstalled() ? 'stopped' : 'not-installed',
      installed: this.isInstalled(),
      endpoint: MANAGED_SEARXNG_URL,
      managed: false,
    }
  }

  private async runInstall(setupScript: string, executable: string): Promise<LocalSearchStatus> {
    this.status = { state: 'installing', installed: false, endpoint: MANAGED_SEARXNG_URL, managed: false }
    if (!this.dependencies.existsSync(setupScript)) {
      this.status = { ...this.status, state: 'failed', error: 'Managed local-search setup script is missing.' }
      return this.getStatus()
    }
    try {
      await new Promise<void>((resolveInstall, rejectInstall) => {
        const child = this.dependencies.spawn(executable, [setupScript], {
          cwd: this.root,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', RAVEN_RUNTIME_ROOT: this.root, PYTHONUTF8: '1' },
          shell: false,
          windowsHide: true,
        })
        child.stdout.on('data', (chunk: Buffer) => log.debug(`Local search setup output (${chunk.byteLength} bytes redacted)`))
        child.stderr.on('data', (chunk: Buffer) => log.debug(`Local search setup error output (${chunk.byteLength} bytes redacted)`))
        child.once('error', rejectInstall)
        child.once('exit', (code) => code === 0 ? resolveInstall() : rejectInstall(new Error(`Setup exited with code ${code ?? 'unknown'}.`)))
      })
      if (!this.isInstalled()) throw new Error('Setup finished without a valid pinned runtime.')
      this.status = { state: 'stopped', installed: true, endpoint: MANAGED_SEARXNG_URL, managed: false }
      return this.getStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Managed local-search setup failed.'
      this.status = { state: 'failed', installed: false, endpoint: MANAGED_SEARXNG_URL, managed: false, error: message }
      return this.getStatus()
    }
  }

  private async startManaged(): Promise<LocalSearchStatus> {
    const paths = this.getRuntimePaths()
    this.stopping = false
    this.status = { state: 'starting', installed: true, endpoint: MANAGED_SEARXNG_URL, managed: true }
    const child = this.dependencies.spawn(paths.python, ['-m', 'searx.webapp'], {
      cwd: paths.source,
      env: { ...process.env, SEARXNG_SETTINGS_PATH: paths.settings, PYTHONUTF8: '1' },
      shell: false,
      windowsHide: true,
    })
    this.child = child
    this.status.pid = child.pid
    child.stdout.on('data', (chunk: Buffer) => log.debug(`Local search process output (${chunk.byteLength} bytes redacted)`))
    child.stderr.on('data', (chunk: Buffer) => log.debug(`Local search process error output (${chunk.byteLength} bytes redacted)`))
    child.once('exit', (code) => {
      if (this.child === child) this.child = null
      if (!this.stopping) {
        log.warn(`Managed local search exited unexpectedly (code=${code ?? 'unknown'})`)
        this.status = { state: 'failed', installed: this.isInstalled(), endpoint: MANAGED_SEARXNG_URL, managed: false, error: 'Managed local search stopped unexpectedly.' }
      }
    })

    const deadline = this.dependencies.now() + STARTUP_TIMEOUT_MS
    while (!this.stopping && this.child === child && this.dependencies.now() < deadline) {
      if (await this.probe()) {
        this.status = { state: 'ready', installed: true, endpoint: MANAGED_SEARXNG_URL, managed: true, pid: child.pid }
        log.info('Managed local search ready on loopback')
        return this.getStatus()
      }
      await this.dependencies.delay(500)
    }
    await this.stopOwnedChild()
    this.status = { state: 'failed', installed: true, endpoint: MANAGED_SEARXNG_URL, managed: false, error: 'Managed local search did not become ready within 90 seconds.' }
    throw new Error(this.status.error)
  }

  private async stopOwnedChild(): Promise<void> {
    const child = this.child
    if (!child) return
    this.child = null
    child.removeAllListeners('exit')
    const pid = child.pid
    if (child.exitCode === null) child.kill('SIGTERM')
    await this.dependencies.delay(500)
    if (child.exitCode === null && process.platform === 'win32' && pid) {
      await new Promise<void>((resolveCleanup) => {
        const cleanup = this.dependencies.spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { shell: false, windowsHide: true })
        cleanup.once('exit', () => resolveCleanup())
        cleanup.once('error', () => resolveCleanup())
      })
    } else if (child.exitCode === null) {
      child.kill('SIGKILL')
    }
  }
}

function normalizeEndpoint(value: string): string {
  const url = new URL(value)
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname
  const port = url.port || '80'
  const pathname = url.pathname.replace(/\/$/, '')
  return `http://${host}:${port}${pathname}`
}

export const localSearchProcessManager = new LocalSearchProcessManager()
