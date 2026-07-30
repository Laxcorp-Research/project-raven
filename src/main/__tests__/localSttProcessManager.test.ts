import { describe, expect, it } from 'vitest'
import { LocalSttProcessManager } from '../services/localStt/localSttProcessManager'

describe('LocalSttProcessManager', () => {
  it('builds only flags confirmed by WhisperLiveKit 0.2.24', () => {
    const manager = new LocalSttProcessManager('C:\\raven')
    expect(manager.buildArguments(45678, { model: 'base.en', language: 'en', device: 'cpu', computeType: 'int8' })).toEqual([
      'serve', '--host', '127.0.0.1', '--port', '45678', '--backend', 'faster-whisper', '--model', 'base.en', '--lan', 'en', '--pcm-input', '--log-level', 'WARNING', '--warmup-file', '',
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
})
