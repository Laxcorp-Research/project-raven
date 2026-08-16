import { describe, it, expect, beforeEach, vi } from 'vitest'

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0-test' },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    },
  },
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import {
  trackEvent,
  _getBufferForTests,
  _resetForTests,
  _flushForTests,
} from '../services/clientEvents'

beforeEach(() => {
  vi.clearAllMocks()
  _resetForTests()
  ipcHandlers.clear()
})

describe('clientEvents - trackEvent buffering contract', () => {
  it('buffers events locally without a hosted backend', () => {
    trackEvent('onboarding_started')

    const buffered = _getBufferForTests()
    expect(buffered).toHaveLength(1)
    expect(buffered[0]).toMatchObject({ name: 'onboarding_started' })
  })

  it('drains the in-memory buffer once it reaches FLUSH_AT (20)', () => {
    for (let i = 0; i < 19; i++) {
      trackEvent('app_launched', { metadata: { idx: i } })
    }
    expect(_getBufferForTests()).toHaveLength(19)

    trackEvent('app_launched', { metadata: { idx: 19 } })
    expect(_getBufferForTests()).toHaveLength(0)
  })

  it('passes through sessionId + metadata args verbatim into the buffered entry', () => {
    trackEvent('recording_started', {
      sessionId: 'sess-xyz',
      metadata: { reason: 'mic_unavailable', attemptNumber: 2 },
    })

    const buffered = _getBufferForTests()
    expect(buffered[0]).toEqual({
      name: 'recording_started',
      sessionId: 'sess-xyz',
      metadata: { reason: 'mic_unavailable', attemptNumber: 2 },
    })
  })
})

describe('clientEvents - flush stays on-device', () => {
  it('flush() clears the buffer without sending to a backend', async () => {
    trackEvent('app_launched')
    expect(_getBufferForTests()).toHaveLength(1)

    await _flushForTests()

    expect(_getBufferForTests()).toHaveLength(0)
  })

  it('flush() source does not import src/pro or a hosted events API', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sourcePath = path.resolve(__dirname, '../services/clientEvents.ts')
    const src = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n')

    const flushMatch = src.match(/async function flush\b[\s\S]+?^\}/m)
    expect(flushMatch).not.toBeNull()
    let flushBody = flushMatch![0]
    flushBody = flushBody.replace(/\/\*[\s\S]*?\*\//g, '')
    flushBody = flushBody
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n')

    expect(flushBody).not.toMatch(/src\/pro|pro\/main|\/api\/events/)
  })
})
