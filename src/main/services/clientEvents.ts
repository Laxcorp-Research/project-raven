/**
 * Server-attributed product events from the Electron client.
 *
 * Send-side counterpart of the Pro backend's POST /api/events
 * route. Distinct from src/main/analytics.ts:
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
 *   - trackEvent() always buffers, regardless of isProMode() at
 *     call time. The actual gate on whether anything leaves the
 *     device is at flush time, via isAuthenticated() from the
 *     authService, AND via initClientEvents not starting a flush
 *     timer in OSS mode.  Earlier versions had a synchronous
 *     isProMode() check inside trackEvent() that silently dropped
 *     events fired from the renderer during the brief window
 *     between renderer-side auth ready and main-process pro-mode
 *     flag propagation - which manifested as missing
 *     `onboarding_started` events for fresh signups (Bug
 *     triaged 2026-06-03; see admin dashboard activity feed
 *     for s1090404300@gmail.com vs xcn04248@gmail.com).
 *   - OSS mode: events buffer in memory but never leave the
 *     device (initClientEvents() returns early before setting
 *     the flush timer, so flush() is never invoked; the buffer's
 *     MAX_BUFFER cap means the in-memory footprint is bounded
 *     at ~40KB).
 *   - Pro + authenticated: events buffered, flushed every
 *     FLUSH_INTERVAL_MS or when buffer reaches FLUSH_AT. POST
 *     /api/events with the buffer; on any failure (network, 5xx)
 *     we discard the batch rather than retry. Events are "best
 *     effort" - losing one to a network blip is acceptable; the
 *     source of truth for whether something happened is the side
 *     effect (a session row, a Sentry error), not the event.
 *   - Pro + temporarily unauthenticated (e.g., tokens being
 *     refreshed): flush() detects this and prepends the batch
 *     back to the buffer for the next flush attempt rather than
 *     dropping it.
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

const log = createLogger('ClientEvents')

const FLUSH_INTERVAL_MS = 10_000
const FLUSH_AT = 20
const MAX_BUFFER = 200
const PLATFORM = process.platform
const VERSION = app.getVersion()

/**
 * Allowlist mirrors the backend's ALLOWED_EVENT_NAMES set.
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

  log.debug('Client events stay on-device (no hosted backend)')
}

/**
 * Public send API. Always buffers; whether anything actually
 * leaves the device is decided at flush time (which happens
 * only in Pro mode + authenticated; see the file header
 * "Behavior" section for the full contract). The buffer is
 * bounded by MAX_BUFFER so an event-only-in-memory scenario
 * (OSS, or Pro with a long offline window) cannot grow memory
 * unbounded.
 *
 * NOTE: do not re-add an `if (!isProMode()) return` guard here.
 * The renderer can fire trackClientEvent over IPC in the brief
 * window between client-side auth completion and main-process
 * pro-mode propagation - dropping events synchronously here is
 * how the `onboarding_started` event used to vanish for fresh
 * signups. The flush-time isAuthenticated() check is the
 * authoritative gate for "ready to send."
 */
export function trackEvent(
  name: ClientEventName,
  args?: { sessionId?: string; metadata?: Record<string, unknown> },
): void {
  if (buffer.length >= MAX_BUFFER) {
    // FIFO drop: oldest goes, newest survives. Keeps the recent
    // window intact across a long offline period.
    buffer.shift()
  }
  buffer.push({ name, sessionId: args?.sessionId, metadata: args?.metadata })
  // Aggressive early flush when we've crossed the batch threshold
  // - keeps recent events visible to the admin dashboard without
  // waiting up to FLUSH_INTERVAL_MS. flush() is itself gated by
  // isAuthenticated() so an early flush from OSS or a not-yet-
  // authenticated client is still safe.
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
  buffer = []
}

/**
 * Test-only escape hatches.  Underscore prefix signals these are
 * NOT part of the production-callable surface; they exist solely
 * so the regression test for the trackEvent buffering contract
 * (the bug that hid `onboarding_started` for fresh signups) can
 * inspect internal state without depending on the dynamic
 * pro/main/authService import. Production code does not import
 * these.
 */
export function _getBufferForTests(): ReadonlyArray<QueuedEvent> {
  return buffer.slice()
}
export function _resetForTests(): void {
  buffer = []
  initialized = false
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  flushInFlight = false
}
export function _flushForTests(): Promise<void> {
  return flush()
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
