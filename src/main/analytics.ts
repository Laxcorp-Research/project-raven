/**
 * Analytics — opt-in anonymous usage tracking via PostHog.
 * Default OFF. Respects user consent via `analyticsEnabled` store key.
 *
 * NEVER tracks: transcripts, AI responses, user content, email,
 * API keys, file names, or IP addresses.
 */

import { app, ipcMain } from 'electron'
import { getSetting, saveSetting } from './store'
import { createLogger } from './logger'

const log = createLogger('Analytics')

const POSTHOG_API_KEY = 'phc_PLACEHOLDER'
const POSTHOG_HOST = 'https://us.i.posthog.com'

let enabled = false
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
  enabled = getSetting('analyticsEnabled') === true

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

  log.info('Analytics initialized (opt-in:', enabled, ')')
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
