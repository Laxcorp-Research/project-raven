/**
 * Analytics — opt-in anonymous usage tracking.
 * Currently a stub that logs events locally.
 * Can be connected to PostHog, Mixpanel, or a self-hosted backend later.
 */

import { ipcMain } from 'electron'
import { getSetting } from './store'
import { createLogger } from './logger'

const log = createLogger('Analytics')

let enabled = false

export interface AnalyticsEvent {
  name: string
  properties?: Record<string, unknown>
}

export function initAnalytics(): void {
  enabled = getSetting('analyticsEnabled') === true

  ipcMain.handle('analytics:track', async (_event, eventName: string, properties?: Record<string, unknown>) => {
    trackEvent({ name: eventName, properties })
  })

  ipcMain.handle('analytics:set-enabled', async (_event, isEnabled: boolean) => {
    enabled = isEnabled
    log.info('Analytics', isEnabled ? 'enabled' : 'disabled')
  })

  ipcMain.handle('analytics:is-enabled', async () => enabled)

  log.info('Analytics initialized (opt-in:', enabled, ')')
}

export function trackEvent(event: AnalyticsEvent): void {
  if (!enabled) return

  log.debug('Event:', event.name, event.properties || '')
}

export function identifyUser(_userId: string, _traits?: Record<string, unknown>): void {
  if (!enabled) return
  // Future: send to analytics backend
}
