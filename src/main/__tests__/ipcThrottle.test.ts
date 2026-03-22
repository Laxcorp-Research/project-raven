import { vi, describe, it, expect, beforeEach } from 'vitest'

const registeredHandlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      registeredHandlers[channel] = handler
    }),
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

import { inflightHandle, cooldownHandle, resetThrottleState } from '../ipcThrottle'

describe('ipcThrottle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetThrottleState()
    Object.keys(registeredHandlers).forEach((k) => delete registeredHandlers[k])
  })

  describe('inflightHandle', () => {
    it('allows the first call through', async () => {
      const handler = vi.fn().mockResolvedValue('result')
      inflightHandle('test:inflight', handler)

      const result = await registeredHandlers['test:inflight']({})
      expect(result).toBe('result')
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('rejects concurrent calls with { throttled: true }', async () => {
      let resolveFirst: () => void
      const firstCallPromise = new Promise<void>((r) => { resolveFirst = r })
      const handler = vi.fn().mockImplementation(() => firstCallPromise.then(() => 'done'))

      inflightHandle('test:inflight-concurrent', handler)

      const call1 = registeredHandlers['test:inflight-concurrent']({})
      const call2Result = await registeredHandlers['test:inflight-concurrent']({})

      expect(call2Result).toEqual({ throttled: true })
      expect(handler).toHaveBeenCalledTimes(1)

      resolveFirst!()
      const call1Result = await call1
      expect(call1Result).toBe('done')
    })

    it('allows calls after previous call completes', async () => {
      const handler = vi.fn().mockResolvedValue('ok')
      inflightHandle('test:inflight-sequential', handler)

      await registeredHandlers['test:inflight-sequential']({})
      const result = await registeredHandlers['test:inflight-sequential']({})
      expect(result).toBe('ok')
      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('clears inflight state even when handler throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('fail'))
      inflightHandle('test:inflight-error', handler)

      await registeredHandlers['test:inflight-error']({})
      const result = await registeredHandlers['test:inflight-error']({})
      expect(result).toBeNull()
      expect(handler).toHaveBeenCalledTimes(2)
    })
  })

  describe('cooldownHandle', () => {
    it('allows the first call through', async () => {
      const handler = vi.fn().mockResolvedValue('result')
      cooldownHandle('test:cooldown', 1000, handler)

      const result = await registeredHandlers['test:cooldown']({})
      expect(result).toBe('result')
    })

    it('rejects calls within cooldown window', async () => {
      const handler = vi.fn().mockResolvedValue('ok')
      cooldownHandle('test:cooldown-reject', 5000, handler)

      await registeredHandlers['test:cooldown-reject']({})
      const result = await registeredHandlers['test:cooldown-reject']({})

      expect(result).toHaveProperty('throttled', true)
      expect(result).toHaveProperty('retryAfterMs')
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('allows calls after cooldown expires', async () => {
      vi.useFakeTimers()
      const handler = vi.fn().mockResolvedValue('ok')
      cooldownHandle('test:cooldown-expire', 100, handler)

      await registeredHandlers['test:cooldown-expire']({})
      vi.advanceTimersByTime(150)
      const result = await registeredHandlers['test:cooldown-expire']({})
      expect(result).toBe('ok')
      expect(handler).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('resetThrottleState', () => {
    it('clears all throttle state', async () => {
      const handler = vi.fn().mockResolvedValue('ok')
      cooldownHandle('test:reset', 60000, handler)

      await registeredHandlers['test:reset']({})
      resetThrottleState()
      const result = await registeredHandlers['test:reset']({})
      expect(result).toBe('ok')
      expect(handler).toHaveBeenCalledTimes(2)
    })
  })
})
