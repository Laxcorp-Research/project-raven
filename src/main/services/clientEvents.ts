/**
 * Server-attributed product events from the Electron client.
 *
 * Send-side counterpart of backend/src/routes/events.ts. Distinct
 * from src/main/analytics.ts:
 *   - analytics.ts ships ANONYMOUS events to PostHog with a
 *     random distinctId. Aggregate insights, opt-out-able. Privacy
 *     contract is "telemetry is anonymous".
 *   - THIS module ships USER-ATTRIBUTED events to our managed
 *     backend (only in Pro mode, only when authenticated). Powers
 *     the admin dashboard's per-user health view. Privacy contract
 *     is "the same cloud-sync trust bucket as sessions and modes
 *     (which we already disclose for Pro accounts)".
 *
 * Behavior:
 *   - OSS mode and unauthenticated state: every trackEvent() call
 *     is a no-op. No buffer growth, no eventual flush. Module
 *     loads but does nothing.
 *   - Pro + authenticated: events buffered in memory, flushed
 *     every FLUSH_INTERVAL_MS or when buffer reaches FLUSH_AT.
 *     POST /api/events with the buffer; on any failure (network,
 *     5xx) we discard the batch rather than retry. Events are
 *     "best effort" - losing one to a network blip is acceptable;
 *     the source of truth for whether something happened is the
 *     side effect (a session row, a Sentry error), not the event.
 *   - Buffer has a hard cap (MAX_BUFFER) so a long offline window
 *     can't grow memory unbounded. Oldest events are dropped first
 *     (FIFO) so the most recent state is preserved.
 *
 * NOT sent: PII content, transcript text, AI prompts, file names,
 * credentials. Backend also strips PII-shaped metadata keys at
 * write time (defense in depth).
 */

import { app, ipcMain } from 'electron'
import { createLogger } from '../logger'
import { isProMode } from '../store'

const log = createLogger('ClientEvents')

const FLUSH_INTERVAL_MS = 10_000
const FLUSH_AT = 20
const MAX_BUFFER = 200
const PLATFORM = process.platform
const VERSION = app.getVersion()

/**
 * Allowlist mirrors backend/src/routes/events.ts ALLOWED_EVENT_NAMES.
 * Kept here as a typed union so the call sites get compile-time
 * checking - if the backend allowlist drifts, callers won't catch
 * it until runtime, but the typed front prevents typos in this
 * codebase.
 */
export type ClientEventName =
  | 'app_launched'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_step'
  | 'permission_granted'
  | 'permission_denied'
  | 'recording_attempt'
  | 'recording_started'
  | 'recording_failed'
  | 'recording_ended'
  | 'ai_request_attempt'
  | 'ai_request_failed'
  | 'checkout_opened'
  | 'portal_opened'
  | 'client_error'

const ALLOWED_NAMES = new Set<ClientEventName>([
  'app_launched',
  'onboarding_started',
  'onboarding_completed',
  'onboarding_step',
  'permission_granted',
  'permission_denied',
  'recording_attempt',
  'recording_started',
  'recording_failed',
  'recording_ended',
  'ai_request_attempt',
  'ai_request_failed',
  'checkout_opened',
  'portal_opened',
  'client_error',
])

interface QueuedEvent {
  name: ClientEventName
  sessionId?: string
  metadata?: Record<string, unknown>
}

let buffer: QueuedEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let initialized = false
let flushInFlight = false

/**
 * Initialize the periodic flush timer. Safe to call multiple
 * times - subsequent calls are no-ops. The flush loop is silent
 * if the buffer is empty or the user isn't authenticated yet.
 */
export function initClientEvents(): void {
  if (initialized) return
  initialized = true

  // IPC bridge for the renderer. Registering on every init,
  // including OSS, is fine - the handler itself respects
  // isProMode() and no-ops there. We accept the call from the
  // renderer regardless so renderer code stays simple
  // ("window.raven.trackClientEvent('X')" - it doesn't have
  // to know whether the main process will send anything).
  // Allowlist validation lives BOTH here (defense in depth)
  // and on the backend (the canonical authority). The local
  // gate catches typos at IPC time and stops a buggy renderer
  // from filling the buffer with junk.
  ipcMain.handle(
    'client-event:track',
    async (
      _ev,
      name: string,
      args?: { sessionId?: string; metadata?: Record<string, unknown> },
    ) => {
      if (!ALLOWED_NAMES.has(name as ClientEventName)) {
        log.debug('rejected unknown event name via IPC:', name)
        return { accepted: false, reason: 'name not in allowlist' }
      }
      trackEvent(name as ClientEventName, args)
      return { accepted: true }
    },
  )

  if (!isProMode()) {
    log.debug('OSS mode - client events disabled (IPC bridge still mounted for renderer simplicity)')
    return
  }
  flushTimer = setInterval(() => {
    void flush()
  }, FLUSH_INTERVAL_MS)
  // Don't keep the Node event loop alive purely for this timer.
  // If the app is otherwise idle (no audio, no UI), shutdown
  // should proceed without waiting for our 10s tick.
  if (flushTimer && typeof flushTimer.unref === 'function') flushTimer.unref()

  // Lifecycle event - lets the admin dashboard tell apart "user
  // installed and never launched again" from "user launched but
  // never finished onboarding". One of the cheapest, highest-
  // signal events to instrument.
  trackEvent('app_launched', {
    metadata: { platform: PLATFORM, version: VERSION },
  })

  log.debug('Client events initialized')
}

/**
 * Public send API. Drops the call silently if we're in OSS, not
 * authenticated, or the buffer is overflowing.
 */
export function trackEvent(
  name: ClientEventName,
  args?: { sessionId?: string; metadata?: Record<string, unknown> },
): void {
  if (!isProMode()) return
  if (buffer.length >= MAX_BUFFER) {
    // FIFO drop: oldest goes, newest survives. Keeps the recent
    // window intact across a long offline period.
    buffer.shift()
  }
  buffer.push({ name, sessionId: args?.sessionId, metadata: args?.metadata })
  // Aggressive early flush when we've crossed the batch threshold
  // - keeps recent events visible to the admin dashboard without
  // waiting up to FLUSH_INTERVAL_MS.
  if (buffer.length >= FLUSH_AT) {
    void flush()
  }
}

/**
 * Drain the buffer to the backend. Returns silently on any
 * failure - we don't retry, we don't surface errors to the
 * caller. Events are operational telemetry, not business data;
 * losing a batch to a network blip is fine.
 *
 * Concurrency guard: if a flush is already in flight, the call
 * returns immediately. The in-flight flush will pick up any
 * events added between its snapshot and completion on the next
 * tick.
 */
async function flush(): Promise<void> {
  if (flushInFlight) return
  if (buffer.length === 0) return
  if (!isProMode()) return

  // Snapshot the buffer and clear it; new events enqueued during
  // the in-flight POST go into a fresh array.
  const batch = buffer
  buffer = []
  flushInFlight = true
  try {
    const { isAuthenticated, _apiRequest: apiRequest } = await import(
      /* @vite-ignore */ '../../pro/main/authService'
    )
    if (!isAuthenticated()) {
      // Don't drop the events on the floor if the user just isn't
      // signed in yet - put them back in front of any new events
      // queued during the import. Next flush tries again. Cap to
      // MAX_BUFFER at the head so a long unauthenticated window
      // can't grow memory.
      buffer = [...batch, ...buffer].slice(-MAX_BUFFER)
      return
    }
    const payload = {
      events: batch.map((e) => ({
        name: e.name,
        sessionId: e.sessionId ?? null,
        platform: PLATFORM,
        version: VERSION,
        metadata: e.metadata ?? null,
      })),
    }
    await apiRequest<{ accepted: number }>('/api/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch (err) {
    // Best effort. Don't requeue - retrying after a network
    // error is the kind of behavior that turns a transient
    // outage into an event-storm thunder when the backend
    // recovers. Log at debug so it doesn't drown legitimate
    // signal.
    log.debug('flush failed (best-effort, batch dropped):', err)
  } finally {
    flushInFlight = false
  }
}

/**
 * For tests + graceful shutdown - drains the buffer one last
 * time and stops the flush timer.
 */
export async function shutdownClientEvents(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  await flush()
  initialized = false
}
