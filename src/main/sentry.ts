/**
 * Sentry crash reporting - anonymous error/crash tracking.
 * DSN placeholder: replace with real DSN before first release.
 * No PII is sent - user data is stripped from events via beforeSend.
 */

import { app } from 'electron'
import { createLogger } from './logger'

const log = createLogger('Sentry')

const SENTRY_DSN = ''

let initialized = false

// Set to true the moment Electron starts the quit sequence. Used to
// suppress benign teardown-race errors (EPIPE/ECONNRESET) from in-flight
// TCP writes that complete after their owning code returned. Without
// this flag those late completions surface as uncaughtException with
// no user-code in the stack, get forwarded to Sentry, and pollute
// crash dashboards with non-bugs - see Sentry issue 26944317 from
// the v2.2.1 install (2026-05-08, "write EPIPE" fired ~18ms after
// app.before-quit, all-internal Node net + writable + stream_base
// stack frames, no Raven code in the trace).
let appQuitting = false

export function initSentry(): void {
  if (!SENTRY_DSN) {
    log.debug('Sentry DSN not configured - crash reporting disabled')
    return
  }

  if (!app.isPackaged) {
    log.debug('Sentry skipped in dev mode (Vite ESM incompatibility)')
    return
  }

  try {
    void import('@sentry/electron/main').then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: app.isPackaged ? 'production' : 'development',
        release: `raven@${app.getVersion()}`,
        beforeSend(event) {
          // Strip all PII
          if (event.user) {
            delete event.user.email
            delete event.user.ip_address
            delete event.user.username
          }
          event.server_name = undefined
          return event
        },
        initialScope: {
          tags: {
            platform: process.platform,
            arch: process.arch,
          },
        },
      })

      initialized = true
      log.info('Sentry initialized')
    }).catch((err) => {
      log.warn('Failed to initialize Sentry:', err)
    })
  } catch (err) {
    log.warn('Failed to import Sentry:', err)
  }

  // Flip the shutdown flag the instant Electron tells us we're
  // quitting. Hooked here (not in src/main/index.ts's before-quit
  // handler) so the suppression below works regardless of which
  // module owns the quit handler. `before-quit` fires once per quit
  // attempt; even if the user cancels (closes the dialog), we'd want
  // the next attempt to re-flag, but since `before-quit` fires every
  // time the flag stays sticky correctly.
  app.on('before-quit', () => {
    appQuitting = true
  })

  process.on('uncaughtException', (error) => {
    if (_isShutdownRaceError(error, appQuitting)) {
      log.warn('Suppressed shutdown-race error (not forwarded to Sentry):', String(error))
      return
    }
    log.error('Uncaught exception:', error)
    if (initialized) {
      void import('@sentry/electron/main').then((Sentry) => {
        Sentry.captureException(error)
      }).catch(() => {})
    }
  })

  process.on('unhandledRejection', (reason) => {
    if (_isShutdownRaceError(reason, appQuitting)) {
      log.warn('Suppressed shutdown-race rejection (not forwarded to Sentry):', String(reason))
      return
    }
    log.error('Unhandled rejection:', reason)
    if (initialized) {
      void import('@sentry/electron/main').then((Sentry) => {
        Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)))
      }).catch(() => {})
    }
  })
}

/**
 * True if the given error/rejection is a benign teardown-race that we
 * should NOT report to Sentry. Conditions:
 *
 *   1. We're already inside the quit sequence (`isAppQuitting === true`).
 *      Outside of quit, EPIPE/ECONNRESET on a long-lived socket is a
 *      legitimate runtime failure and SHOULD reach Sentry.
 *
 *   2. The error code or message indicates a closed-socket write
 *      failure: EPIPE, ECONNRESET, EPROTO. These are the codes Node
 *      surfaces from the net/streams layer when an in-flight write
 *      lands on a socket whose remote end has gone away. We
 *      explicitly do NOT include broader codes like ENOTFOUND or
 *      ETIMEDOUT - those are genuine network problems that we want
 *      Sentry to know about even during shutdown.
 *
 * Pure function on purpose - takes the quit flag as a parameter so
 * tests can exercise the (quitting × code) decision matrix without
 * spinning up Electron or registering real process handlers. The
 * `_` prefix marks this as internal-but-testable.
 *
 * Test surface: src/main/__tests__/sentry.test.ts.
 */
export function _isShutdownRaceError(reason: unknown, isAppQuitting: boolean): boolean {
  if (!isAppQuitting) return false
  if (reason === null || reason === undefined) return false
  // Error.code is non-standard but Node's net errors carry it; falling
  // back to message text covers errors thrown from third-party code
  // that wrap or reformat the underlying Node error.
  const codeOrMessage = (() => {
    if (reason instanceof Error) {
      const e = reason as Error & { code?: unknown }
      if (typeof e.code === 'string') return e.code
      return e.message || ''
    }
    if (typeof reason === 'string') return reason
    return String(reason)
  })()
  return /\b(EPIPE|ECONNRESET|EPROTO)\b/.test(codeOrMessage)
}

export function captureException(error: Error | unknown): void {
  if (!initialized) return
  void import('@sentry/electron/main').then((Sentry) => {
    Sentry.captureException(error)
  }).catch(() => {})
}

/**
 * Emit a Sentry message (non-throwing signal). Use for observable
 * conditions that aren't exceptions but matter for operations:
 * silent logouts, rate-limit events, transient service failures we
 * want to aggregate by count rather than stack.
 *
 * Tags are surfaced as filterable facets in the Sentry dashboard, so
 * callers can bucket events via tags like `{ 'auth.mode': 'refresh_rejected' }`.
 * No-op when Sentry isn't initialised (dev mode, missing DSN).
 */
export function captureMessage(
  message: string,
  opts?: { level?: 'info' | 'warning' | 'error'; tags?: Record<string, string> },
): void {
  if (!initialized) return
  void import('@sentry/electron/main').then((Sentry) => {
    Sentry.captureMessage(message, {
      level: opts?.level ?? 'info',
      tags: opts?.tags,
    })
  }).catch(() => {})
}

/**
 * Append a breadcrumb to the current Sentry scope. Breadcrumbs attach
 * to any subsequent captureException / captureMessage event, so use
 * them to record the steps leading up to a failure (e.g., each retry
 * attempt of a token refresh). Breadcrumbs are cheap; events are not.
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: 'info' | 'warning' | 'error' | 'debug' = 'info',
): void {
  if (!initialized) return
  void import('@sentry/electron/main').then((Sentry) => {
    Sentry.addBreadcrumb({ category, message, data, level })
  }).catch(() => {})
}

export function isSentryInitialized(): boolean {
  return initialized
}
