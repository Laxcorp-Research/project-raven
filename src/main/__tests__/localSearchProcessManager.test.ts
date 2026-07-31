import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
vi.mock('../logger', () => ({ createLogger: () => log }))

import { LocalSearchProcessManager, MANAGED_SEARXNG_URL, SEARXNG_REVISION } from '../services/localSearch/localSearchProcessManager'

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    pid: number
    exitCode: number | null
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = 4242
  child.exitCode = null
  child.kill = vi.fn(() => { child.exitCode = 0; return true })
  return child
}

function installedDependencies(overrides: Record<string, unknown> = {}) {
  return {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify({ revision: SEARXNG_REVISION })),
    now: vi.fn(() => Date.now()),
    delay: vi.fn(async () => {}),
    ...overrides,
  }
}

describe('LocalSearchProcessManager', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports a missing one-time installation without spawning', async () => {
    const spawnMock = vi.fn()
    const manager = new LocalSearchProcessManager('C:/raven', {
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
      fetch: vi.fn().mockRejectedValue(new Error('offline')),
      spawn: spawnMock as never,
    })

    expect(manager.getStatus()).toMatchObject({ state: 'not-installed', installed: false })
    await expect(manager.ensureAvailable()).rejects.toThrow('one-time installation')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('uses a compatible custom endpoint without claiming ownership', async () => {
    const spawnMock = vi.fn()
    const manager = new LocalSearchProcessManager('C:/raven', {
      ...installedDependencies(),
      fetch: vi.fn().mockResolvedValue(new Response('<title>SearXNG</title>', { status: 200 })),
      spawn: spawnMock as never,
    })

    const status = await manager.ensureAvailable('http://localhost:9999')
    expect(status).toMatchObject({ state: 'external', managed: false, endpoint: 'http://127.0.0.1:9999' })
    expect(spawnMock).not.toHaveBeenCalled()
    await manager.stop()
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent startup and redacts child output', async () => {
    const child = fakeChild()
    const spawnMock = vi.fn(() => child)
    let probes = 0
    const fetchMock = vi.fn(async () => {
      probes += 1
      return probes <= 2
        ? new Response('unavailable', { status: 503 })
        : new Response('<html>SearXNG</html>', { status: 200 })
    })
    const manager = new LocalSearchProcessManager('C:/raven', {
      ...installedDependencies(),
      fetch: fetchMock,
      spawn: spawnMock as never,
    })

    const [first, second] = await Promise.all([
      manager.ensureAvailable(MANAGED_SEARXNG_URL),
      manager.ensureAvailable(MANAGED_SEARXNG_URL),
    ])
    child.stdout.emit('data', Buffer.from('private search query'))
    child.stderr.emit('data', Buffer.from('private search result'))

    expect(first.state).toBe('ready')
    expect(second.state).toBe('ready')
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(log.debug.mock.calls.flat().join(' ')).not.toContain('private search')

    await manager.stop()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('does not accept a generic service as compatible SearXNG', async () => {
    const manager = new LocalSearchProcessManager('C:/raven', {
      ...installedDependencies(),
      fetch: vi.fn().mockResolvedValue(new Response('<html>another app</html>', { status: 200 })),
      spawn: vi.fn(() => fakeChild()) as never,
      now: (() => { let value = 0; return () => (value += 100_000) })(),
    })
    await expect(manager.ensureAvailable()).rejects.toThrow('did not become ready')
  })
})
