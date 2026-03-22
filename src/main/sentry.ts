/**
 * Sentry crash reporting — anonymous error/crash tracking.
 * DSN placeholder: replace with real DSN before first release.
 * No PII is sent — user data is stripped from events via beforeSend.
 */

import { createLogger } from './logger'

const log = createLogger('Sentry')

const SENTRY_DSN = ''

let initialized = false

export function initSentry(): void {
  if (!SENTRY_DSN) {
    log.debug('Sentry DSN not configured — crash reporting disabled')
    return
  }

  try {
    // Dynamic import so the app doesn't crash if Sentry fails to load
    void import('@sentry/electron/main').then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        release: `raven@${process.env.npm_package_version || 'unknown'}`,
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

  process.on('uncaughtException', (error) => {
    log.error('Uncaught exception:', error)
    if (initialized) {
      void import('@sentry/electron/main').then((Sentry) => {
        Sentry.captureException(error)
      }).catch(() => {})
    }
  })

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection:', reason)
    if (initialized) {
      void import('@sentry/electron/main').then((Sentry) => {
        Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)))
      }).catch(() => {})
    }
  })
}

export function captureException(error: Error | unknown): void {
  if (!initialized) return
  void import('@sentry/electron/main').then((Sentry) => {
    Sentry.captureException(error)
  }).catch(() => {})
}

export function isSentryInitialized(): boolean {
  return initialized
}
