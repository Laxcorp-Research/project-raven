import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  systemPreferences: { getMediaAccessStatus: vi.fn() },
}))

vi.mock('../store', () => ({
  getSetting: vi.fn(() => true),
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { selectMicPcmForTranscription } from '../systemAudioNative'

describe('selectMicPcmForTranscription', () => {
  const rawEcho = Buffer.from('youtube-from-speakers')
  const cleaned = Buffer.from('just-the-user')

  it('never sends raw speaker echo as You while AEC is running (empty pull)', () => {
    expect(selectMicPcmForTranscription(true, rawEcho, [])).toBeNull()
  })

  it('never sends raw speaker echo as You while AEC is running (bypass used to return raw)', () => {
    // Bypass must not change this helper — processAndPullMicAudio always
    // passes cleaned chunks, never raw, when aecReady is true.
    expect(selectMicPcmForTranscription(true, rawEcho, [cleaned])).toBe(cleaned)
    expect(selectMicPcmForTranscription(true, rawEcho, [])).toBeNull()
  })

  it('returns concatenated AEC output when several cleaned chunks are ready', () => {
    const a = Buffer.from('a')
    const b = Buffer.from('b')
    expect(selectMicPcmForTranscription(true, rawEcho, [a, b])?.equals(Buffer.from('ab'))).toBe(true)
  })

  it('returns raw mic only when AEC is not available', () => {
    expect(selectMicPcmForTranscription(false, rawEcho, [])).toBe(rawEcho)
  })
})

describe('stopCapture teardown (speaker echo must not become You)', () => {
  const src = readFileSync(join(process.cwd(), 'src/main/systemAudioNative.ts'), 'utf8')

  it('sets captureStopping before destroying AEC or resetting the echo gate', () => {
    const stopFn = src.match(/export function stopCapture\(\)[\s\S]*?\n\}/)
    expect(stopFn?.[0]).toBeTruthy()
    const body = stopFn![0]
    const flag = body.indexOf('captureStopping = true')
    expect(flag).toBeGreaterThanOrEqual(0)
    expect(flag).toBeLessThan(body.indexOf('destroyAec()'))
    expect(flag).toBeLessThan(body.indexOf('residualEchoGate.reset()'))
  })

  it('drops leftover helper stdout while capture is stopping', () => {
    expect(src).toMatch(/function handleMicChunk[\s\S]*?if \(captureStopping\) return/)
    expect(src).toMatch(/function handleSystemChunk[\s\S]*?if \(captureStopping\) return/)
  })

  it('clears captureStopping at the start of startCapture so the next session can send', () => {
    const startFn = src.match(/export function startCapture\(\)[\s\S]*?\n\}/)
    expect(startFn?.[0]).toMatch(/captureStopping = false/)
    expect(startFn![0].indexOf('captureStopping = false')).toBeLessThan(
      startFn![0].indexOf('residualEchoGate.reset()'),
    )
  })
})
