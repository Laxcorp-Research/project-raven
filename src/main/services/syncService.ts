/**
 * Cloud session sync service.
 * Syncs local sessions to the backend when user is authenticated with an active subscription.
 * Supports offline queuing — sessions are synced when connectivity is restored.
 */

import { createLogger } from '../logger'
import { getSetting, saveSetting } from '../store'
import { isAuthenticated, isBackendConfigured } from './authService'

const log = createLogger('Sync')

const SYNC_QUEUE_KEY = 'sync_queue'
const LAST_SYNC_KEY = 'last_sync_at'

interface SyncableSession {
  id: string
  title?: string
  summary?: string
  transcriptJson?: string
  aiResponsesJson?: string
  modeId?: string
  durationSeconds?: number
  startedAt: string
  endedAt?: string
}

let syncInProgress = false

function getBackendUrl(): string | null {
  const url = getSetting('backendUrl') as string | undefined
  return url || process.env.RAVEN_BACKEND_URL || null
}

function getAuthToken(): string | null {
  // Read from the auth service's cached tokens
  try {
    const stored = getSetting('auth_tokens') as string | undefined
    if (!stored) return null
    const parsed = JSON.parse(stored)
    return parsed.accessToken || null
  } catch {
    return null
  }
}

function getSyncQueue(): SyncableSession[] {
  try {
    const queue = getSetting(SYNC_QUEUE_KEY) as string | undefined
    return queue ? JSON.parse(queue) : []
  } catch {
    return []
  }
}

function saveSyncQueue(queue: SyncableSession[]): void {
  saveSetting(SYNC_QUEUE_KEY, JSON.stringify(queue))
}

export function queueSessionForSync(session: SyncableSession): void {
  if (!isBackendConfigured()) return

  const queue = getSyncQueue()
  const existingIndex = queue.findIndex((s) => s.id === session.id)
  if (existingIndex >= 0) {
    queue[existingIndex] = session
  } else {
    queue.push(session)
  }
  saveSyncQueue(queue)

  log.debug(`Session ${session.id} queued for sync (queue size: ${queue.length})`)

  // Try to sync immediately if possible
  processSyncQueue().catch(() => {})
}

export async function processSyncQueue(): Promise<void> {
  if (syncInProgress) return
  if (!isBackendConfigured() || !isAuthenticated()) return

  const queue = getSyncQueue()
  if (queue.length === 0) return

  const backendUrl = getBackendUrl()
  const token = getAuthToken()
  if (!backendUrl || !token) return

  syncInProgress = true
  log.info(`Processing sync queue (${queue.length} sessions)`)

  try {
    const response = await fetch(`${backendUrl}/api/sessions/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sessions: queue }),
    })

    if (response.ok) {
      const data = (await response.json()) as { synced: number }
      log.info(`Synced ${data.synced} sessions`)
      saveSyncQueue([])
      saveSetting(LAST_SYNC_KEY, new Date().toISOString())
    } else if (response.status === 401) {
      log.warn('Sync auth expired — will retry after token refresh')
    } else {
      log.error(`Sync failed with status ${response.status}`)
    }
  } catch (err) {
    log.warn('Sync failed (offline?):', err)
  } finally {
    syncInProgress = false
  }
}

export async function pullRemoteSessions(): Promise<SyncableSession[]> {
  if (!isBackendConfigured() || !isAuthenticated()) return []

  const backendUrl = getBackendUrl()
  const token = getAuthToken()
  if (!backendUrl || !token) return []

  const lastSync = getSetting(LAST_SYNC_KEY) as string | undefined

  try {
    const url = lastSync
      ? `${backendUrl}/api/sessions?since=${encodeURIComponent(lastSync)}`
      : `${backendUrl}/api/sessions`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) return []

    const data = (await response.json()) as { sessions: SyncableSession[] }
    return data.sessions
  } catch {
    return []
  }
}

export function getLastSyncTime(): string | null {
  return (getSetting(LAST_SYNC_KEY) as string) || null
}

export function getSyncQueueSize(): number {
  return getSyncQueue().length
}
