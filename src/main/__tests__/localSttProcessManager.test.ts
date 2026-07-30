import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockSpawn = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: mockSpawn,
}))
import { LocalSttProcessManager } from '../services/localStt/localSttProcessManager'

describe('LocalSttProcessManager', () => {
  beforeEach(() => mockSpawn.mockReset())

  it('builds only flags confirmed by WhisperLiveKit 0.2.24', () => {
    const manager = new LocalSttProcessManager('C:\\raven')
    expect(manager.buildArguments(45678, { model: 'base.en', language: 'en', device: 'cpu', computeType: 'int8' })).toEqual([
      'serve', '--host', '127.0.0.1', '--port', '45678', '--backend', 'faster-whisper', '--model', 'base.en', '--lan', 'en', '--pcm-input', '--log-level', 'WARNING',
    ])
  })

  it('uses the repository-local executable path', () => {
    const manager = new LocalSttProcessManager('C:\\raven')
    expect(manager.findExecutable()).toMatch(/\.raven-runtime[\\/]venv[\\/]Scripts[\\/]wlk\.exe$/)
  })

  it('reports a useful error when the runtime is absent', async () => {
    const manager = new LocalSttProcessManager('C:\\definitely-missing-raven')
    const result = await manager.start()
    expect(result.state).toBe('failed')
    expect(result.error).toContain('local-stt:setup')
  })

  it.runIf(process.platform === 'win32')('terminates the Windows process tree after graceful shutdown does not exit', async () => {
    const cleanup = new EventEmitter()
    mockSpawn.mockImplementation(() => {
      queueMicrotask(() => cleanup.emit('exit', 0))
      return cleanup
    })
    const child = Object.assign(new EventEmitter(), {
      pid: 4242,
      exitCode: null,
      kill: vi.fn(),
    })
    const manager = new LocalSttProcessManager('C:\\raven')
    ;(manager as any).child = child

    await manager.stop()

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(mockSpawn).toHaveBeenCalledWith(
      'taskkill.exe',
      ['/PID', '4242', '/T', '/F'],
      { shell: false, windowsHide: true },
    )
    expect(manager.getStatus().state).toBe('stopped')
  })
})
