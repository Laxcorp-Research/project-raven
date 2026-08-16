/**
 * Analytics - anonymous usage tracking via PostHog.
 *
 * Default ON, in line with standard commercial-SaaS product
 * telemetry. The `analyticsEnabled` store key is honored if it's
 * explicitly set to `false` (no in-app UI exposes it; reserved as an
 * operational lever for privacy-request handling and dev-tooling
 * overrides). New installs and the common case have telemetry on.
 *
 * What we send (per event):
 *   - A randomly-generated anonymous distinctId of the shape
 *     `anon-<timestamp>-<random>`. NOT the user's email, NOT the
 *     server-side user UUID; not stable across uninstalls.
 *   - Event name + a small set of structural properties (e.g.
 *     duration buckets like "5-15m", action type strings).
 *   - `$ip: null` is set explicitly on every event so PostHog does
 *     not record the user's IP from the connecting socket.
 *
 * What we NEVER send:
 *   - Transcript content, AI prompt or response content.
 *   - Email addresses, names, file names, or any account identifier.
 *   - API keys or secret material.
 *   - The user's IP address.
 *
 * Legal basis (GDPR Art. 6(1)(f) - legitimate interest): the data is
 * anonymous and used for product analytics. The Privacy Policy
 * documents this and provides a contact path for users with
 * concerns; we rely on PostHog's API for any per-distinctId deletion
 * a privacy request demands.
 */

import { app, ipcMain } from 'electron'
import { getSetting, saveSetting } from './store'
import { createLogger } from './logger'

const log = createLogger('Analytics')

const POSTHOG_API_KEY = 'phc_PLACEHOLDER'
const POSTHOG_HOST = 'https://us.i.posthog.com'

// Default ON. The early initialization (before initAnalytics runs)
// already takes the always-on default; initAnalytics tightens this
// to "off only if explicitly disabled in the store".
let enabled = true
let posthogClient: PostHogClient | null = null

interface PostHogClient {
  capture: (opts: { distinctId: string; event: string; properties?: Record<string, unknown> }) => void
  identify: (opts: { distinctId: string; properties?: Record<string, unknown> }) => void
  shutdown: () => Promise<void>
}

export interface AnalyticsEvent {
  name: string
  properties?: Record<string, unknown>
}

function getDistinctId(): string {
  let id = getSetting('analyticsDistinctId') as string | undefined
  if (!id) {
    id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    saveSetting('analyticsDistinctId' as never, id as never)
  }
  return id
}

async function createPostHogClient(): Promise<PostHogClient | null> {
  if (POSTHOG_API_KEY === 'phc_PLACEHOLDER') {
    log.debug('PostHog API key not configured — events logged locally only')
    return null
  }
  try {
    const { PostHog } = await import('posthog-node')
    const client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      flushAt: 10,
      flushInterval: 30000,
      personalApiKey: undefined,
    })
    return client as unknown as PostHogClient
  } catch (err) {
    log.warn('Failed to initialize PostHog:', err)
    return null
  }
}

function getDurationBucket(durationSeconds: number): string {
  if (durationSeconds < 60) return '<1m'
  if (durationSeconds < 300) return '1-5m'
  if (durationSeconds < 900) return '5-15m'
  if (durationSeconds < 1800) return '15-30m'
  return '30m+'
}

export function initAnalytics(): void {
  // Default ON; we only honor an explicit `false`. `undefined`
  // (fresh install) and `true` (older opt-in users) both resolve to
  // enabled. There is no in-app UI to write the setting today; the
  // helper IPCs below are kept for ops tooling + future opt-out
  // support without committing to a UI surface.
  enabled = getSetting('analyticsEnabled') !== false

  ipcMain.handle('analytics:track', async (_event, eventName: string, properties?: Record<string, unknown>) => {
    trackEvent({ name: eventName, properties })
  })

  ipcMain.handle('analytics:set-enabled', async (_event, isEnabled: boolean) => {
    enabled = isEnabled
    saveSetting('analyticsEnabled' as never, isEnabled as never)

    if (isEnabled && !posthogClient) {
      posthogClient = await createPostHogClient()
    }

    log.info('Analytics', isEnabled ? 'enabled' : 'disabled')
  })

  ipcMain.handle('analytics:is-enabled', async () => enabled)

  if (enabled) {
    void createPostHogClient().then((client) => {
      posthogClient = client
      trackEvent({
        name: 'app_launched',
        properties: {
          mode: getSetting('mode'),
          platform: process.platform,
          arch: process.arch,
          electron_version: process.versions.electron,
          app_version: app.getVersion(),
        },
      })
    })
  }

  log.info('Analytics initialized (enabled:', enabled, ')')
}

export function trackEvent(event: AnalyticsEvent): void {
  if (!enabled) return

  log.debug('Event:', event.name, event.properties || '')

  if (posthogClient) {
    posthogClient.capture({
      distinctId: getDistinctId(),
      event: event.name,
      properties: {
        ...event.properties,
        $ip: null,
      },
    })
  }
}

export function trackSessionStarted(): void {
  trackEvent({ name: 'session_started' })
}

export function trackSessionEnded(durationSeconds: number): void {
  trackEvent({
    name: 'session_ended',
    properties: { duration_bucket: getDurationBucket(durationSeconds) },
  })
}

export function trackAIRequest(actionType: string): void {
  trackEvent({
    name: 'ai_request',
    properties: { action_type: actionType },
  })
}

export function trackTranscriptionProvider(provider: string): void {
  trackEvent({
    name: 'transcription_provider',
    properties: { provider },
  })
}

export function trackErrorBoundaryCaught(componentName: string): void {
  trackEvent({
    name: 'error_boundary_caught',
    properties: { component: componentName },
  })
}

export function identifyUser(_userId: string, _traits?: Record<string, unknown>): void {
  if (!enabled) return

  if (posthogClient) {
    posthogClient.identify({
      distinctId: getDistinctId(),
      properties: _traits,
    })
  }
}

export async function shutdownAnalytics(): Promise<void> {
  if (posthogClient) {
    try {
      await posthogClient.shutdown()
    } catch (err) {
      log.warn('PostHog shutdown error:', err)
    }
    posthogClient = null
  }
}
