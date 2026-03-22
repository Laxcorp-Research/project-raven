/**
 * IPC rate limiting utilities.
 *
 * Two guard strategies:
 * - inflight: only one call at a time (rejects concurrent calls)
 * - cooldown: minimum interval between calls (rejects rapid-fire)
 */

import { ipcMain } from 'electron'
import { createLogger } from './logger'

const log = createLogger('IPCThrottle')

const inflightChannels = new Set<string>()
const cooldownTimestamps = new Map<string, number>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IpcHandler = (...args: any[]) => any

/**
 * Register an IPC handler that allows only one in-flight call at a time.
 * Concurrent calls return `{ throttled: true }`.
 */
export function inflightHandle(channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    if (inflightChannels.has(channel)) {
      log.debug(`[${channel}] throttled — already in flight`)
      return { throttled: true }
    }
    inflightChannels.add(channel)
    try {
      return await handler(...args)
    } catch (err) {
      log.error(`[${channel}] handler error:`, err)
      return null
    } finally {
      inflightChannels.delete(channel)
    }
  })
}

/**
 * Register an IPC handler with a minimum cooldown period between calls.
 * Calls within the cooldown window return `{ throttled: true, retryAfterMs }`.
 */
export function cooldownHandle(channel: string, cooldownMs: number, handler: IpcHandler): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    const now = Date.now()
    const lastCall = cooldownTimestamps.get(channel) || 0
    const elapsed = now - lastCall
    if (elapsed < cooldownMs) {
      const retryAfterMs = cooldownMs - elapsed
      log.debug(`[${channel}] throttled — cooldown ${retryAfterMs}ms remaining`)
      return { throttled: true, retryAfterMs }
    }
    cooldownTimestamps.set(channel, now)
    try {
      return await handler(...args)
    } catch (err) {
      log.error(`[${channel}] handler error:`, err)
      return null
    }
  })
}

/** Check if a channel currently has an in-flight call (for testing). */
export function isInflight(channel: string): boolean {
  return inflightChannels.has(channel)
}

/** Reset all throttle state (for testing). */
export function resetThrottleState(): void {
  inflightChannels.clear()
  cooldownTimestamps.clear()
}
