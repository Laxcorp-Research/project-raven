import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { createLogger } from '../../logger'

const log = createLogger('LocalSTT')
const STARTUP_TIMEOUT_MS = 120_000
const PORT_ATTEMPTS = 3

export type LocalSttState = 'stopped' | 'starting' | 'model-loading' | 'ready' | 'failed' | 'restarting'

export interface LocalSttStatus {
  state: LocalSttState
  port?: number
  model: string
  device: 'cpu' | 'cuda' | 'auto'
  error?: string
  pid?: number
}

export interface LocalSttStartOptions {
  model?: string
  language?: string
  device?: 'cpu' | 'cuda' | 'auto'
  computeType?: string
}

export class LocalSttProcessManager {
  private child: ChildProcessWithoutNullStreams | null = null
  private stopping = false
  private restartCount = 0
  private root: string
  private status: LocalSttStatus = { state: 'stopped', model: 'base.en', device: 'cpu' }
  private lastOptions: LocalSttStartOptions = {}

  constructor(root = process.cwd()) { this.root = resolve(root) }

  getStatus(): LocalSttStatus { return { ...this.status } }

  getWebSocketEndpoint(): string | null {
    return this.status.state === 'ready' && this.status.port
      ? `ws://127.0.0.1:${this.status.port}/v1/listen`
      : null
  }

  findExecutable(): string {
    return process.platform === 'win32'
      ? join(this.root, '.raven-runtime', 'venv', 'Scripts', 'wlk.exe')
      : join(this.root, '.raven-runtime', 'venv', 'bin', 'wlk')
  }

  buildArguments(port: number, options: LocalSttStartOptions = {}): string[] {
    const model = options.model || 'base.en'
    const language = options.language || 'en'
    // These flags are present in WhisperLiveKit 0.2.24 `wlk serve --help`.
    return ['serve', '--host', '127.0.0.1', '--port', String(port), '--backend-policy', 'localagreement', '--backend', 'faster-whisper', '--model', model, '--lan', language, '--pcm-input', '--log-level', 'WARNING']
  }

  async start(options: LocalSttStartOptions = {}): Promise<LocalSttStatus> {
    if (this.status.state === 'ready' || this.status.state === 'starting' || this.status.state === 'model-loading') return this.getStatus()
    const executable = this.findExecutable()
    if (!existsSync(executable)) {
      this.status = { state: 'failed', model: options.model || 'base.en', device: options.device || 'cpu', error: 'Local STT runtime is missing. Run npm run local-stt:setup.' }
      return this.getStatus()
    }
    if (!this.isModelPresent(options.model || 'base.en')) {
      this.status = { state: 'failed', model: options.model || 'base.en', device: options.device || 'cpu', error: `Model ${options.model || 'base.en'} is not downloaded. Run wlk pull ${options.model || 'base.en'} as documented.` }
      return this.getStatus()
    }

    this.lastOptions = options
    this.stopping = false
    for (let attempt = 1; attempt <= PORT_ATTEMPTS; attempt++) {
      const port = await selectLoopbackPort()
      const result = await this.spawnAndWait(executable, port, options)
      if (result.state === 'ready') return result
      await this.stopChild()
      log.warn(`Local STT startup attempt ${attempt}/${PORT_ATTEMPTS} failed`, result.error || 'unknown')
    }
    return this.getStatus()
  }

  async health(): Promise<boolean> {
    if (!this.status.port) return false
    try {
      const response = await fetch(`http://127.0.0.1:${this.status.port}/health`, { signal: AbortSignal.timeout(3_000), redirect: 'manual' })
      return response.ok && response.status < 300
    } catch { return false }
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.restartCount = 0
    await this.stopChild()
    this.status = { state: 'stopped', model: this.status.model, device: this.status.device }
  }

  private isModelPresent(model: string): boolean {
    const normalized = model.replace(/\./g, '.')
    return existsSync(join(this.root, '.raven-runtime', 'models', 'hub', `models--Systran--faster-whisper-${normalized}`))
  }

  private async spawnAndWait(executable: string, port: number, options: LocalSttStartOptions): Promise<LocalSttStatus> {
    const model = options.model || 'base.en'
    const device = options.device || 'cpu'
    this.status = { state: 'starting', port, model, device }
    const env = {
      ...process.env,
      HF_HOME: join(this.root, '.raven-runtime', 'models'),
      PYTHONUTF8: '1',
      // WLK 0.2.24 exposes faster-whisper device/compute as `auto`, not CLI
      // flags. Hiding CUDA makes CTranslate2 deterministically choose CPU;
      // its CPU auto compute type resolves to int8 on supported hardware.
      ...(device === 'cpu' ? { CUDA_VISIBLE_DEVICES: '-1' } : {}),
    }
    const child = spawn(executable, this.buildArguments(port, options), { cwd: this.root, env, shell: false, windowsHide: true })
    this.child = child
    this.status.pid = child.pid
    child.stdout.on('data', (chunk: Buffer) => this.handleOutput(chunk.byteLength))
    child.stderr.on('data', (chunk: Buffer) => this.handleOutput(chunk.byteLength))
    child.once('exit', (code) => void this.handleUnexpectedExit(code))

    const deadline = Date.now() + STARTUP_TIMEOUT_MS
    this.status.state = 'model-loading'
    while (!this.stopping && this.child === child && Date.now() < deadline) {
      if (await this.health()) {
        this.status.state = 'ready'
        log.info(`Local STT ready on loopback port ${port} (model=${model}, device=${device})`)
        return this.getStatus()
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    this.status = { state: 'failed', port, model, device, error: 'WhisperLiveKit did not become healthy within 120 seconds.' }
    return this.getStatus()
  }

  private handleOutput(byteLength: number): void {
    // Deliberately log metadata only: WLK output can contain transcript text.
    log.debug(`Local STT process output (${byteLength} bytes redacted)`)
  }

  private async handleUnexpectedExit(code: number | null): Promise<void> {
    if (this.stopping) return
    this.child = null
    log.warn(`Local STT exited unexpectedly (code=${code ?? 'unknown'})`)
    if (this.restartCount >= 1) {
      this.status = { ...this.status, state: 'failed', error: `WhisperLiveKit exited unexpectedly (code ${code ?? 'unknown'}).` }
      return
    }
    this.restartCount++
    this.status.state = 'restarting'
    await this.start(this.lastOptions)
  }

  private async stopChild(): Promise<void> {
    const child = this.child
    if (!child) return
    this.child = null
    child.removeAllListeners('exit')
    if (child.exitCode === null) child.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (child.exitCode === null && process.platform === 'win32' && child.pid) {
      await new Promise<void>((resolve) => {
        const cleanup = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true })
        cleanup.once('exit', () => resolve())
        cleanup.once('error', () => resolve())
      })
    } else if (child.exitCode === null) child.kill('SIGKILL')
  }
}

async function selectLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

export const localSttProcessManager = new LocalSttProcessManager()
