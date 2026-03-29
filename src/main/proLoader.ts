/**
 * Pro features loader.
 *
 * Registers auth/sync/billing IPC handlers from src/pro/.
 * Only runs when RAVEN_MODE=pro AND src/pro/ is present.
 * In the public open-source repo, src/pro/ is .gitignored,
 * so this gracefully no-ops.
 */

import { isProMode } from './store'
import { createLogger } from './logger'
import { sessionManager } from './services/sessionManager'
import { databaseService } from './services/database'
import { createDefaultMode, ensureActiveMode } from './services/builtinModes'

const log = createLogger('ProLoader')

export async function initializeProFeatures(): Promise<void> {
  if (!isProMode()) {
    log.info('Free mode — skipping pro features')
    return
  }

  try {
    const { registerSyncHandlers } = await import(
      /* @vite-ignore */ '../pro/main/syncIpc'
    )
    registerSyncHandlers()

    const { registerAuthHandlers } = await import(
      /* @vite-ignore */ '../pro/main/authIpc'
    )
    await registerAuthHandlers()

    // Seed built-in modes when a fresh account DB is created
    databaseService.onNewAccountDatabase(() => {
      createDefaultMode()
      ensureActiveMode()
    })

    // If user is already authenticated from a previous session,
    // switch to their account-specific database before loading any data
    const { getCurrentUser } = await import(/* @vite-ignore */ '../pro/main/authService')
    const { getBackendUrl } = await import(/* @vite-ignore */ '../pro/main/proEnv')
    const user = getCurrentUser()
    const backendUrl = getBackendUrl()
    if (user?.id && backendUrl) {
      databaseService.switchToAccountDatabase(backendUrl, user.id)
      log.info('Restored account database for:', user.email)
    }

    const { queueSessionForSync, processSyncQueue, pullAndMergeRemoteSessions, pullRemoteSessions } = await import(
      /* @vite-ignore */ '../pro/main/syncService'
    )

    sessionManager.setSyncFunction(queueSessionForSync)

    retroactivePush(queueSessionForSync, pullRemoteSessions, processSyncQueue)
      .catch((err) => log.warn('Retroactive push failed (non-fatal):', err))

    pullAndMergeRemoteSessions().catch((err) => log.debug('Initial session pull failed:', err))

    // Initialize Recall AI Desktop SDK for premium audio capture
    try {
      const { initRecallSdk, getRecallService } = await import(
        /* @vite-ignore */ '../pro/main/recallService'
      )
      const sdkReady = await initRecallSdk()
      if (sdkReady) {
        const recallService = getRecallService()
        await recallService.setupEventListeners()
        log.info('Recall SDK ready — meeting detection active')
      } else {
        log.info('Recall SDK not available — will use native audio capture')
      }

      const { registerRecallHandlers } = await import(
        /* @vite-ignore */ '../pro/main/recallIpc'
      )
      registerRecallHandlers()
    } catch (err) {
      log.warn('Recall SDK initialization failed (non-fatal):', err)
    }

    log.info('Pro features initialized')
  } catch (err) {
    log.warn('Pro mode requested but src/pro/ not found — running without premium features', err)
  }
}

/**
 * One-time push of all local sessions the backend doesn't have.
 * With per-account databases, the DB only contains this account's data,
 * so no filtering by backend URL or user ID is needed.
 */
async function retroactivePush(
  queueFn: (s: { id: string; title?: string; summary?: string; insightsJson?: string; transcriptJson?: string; aiResponsesJson?: string; modeId?: string; durationSeconds?: number; startedAt: string; endedAt?: string; clientUpdatedAt?: string }) => void,
  pullFn: () => Promise<{ id: string; clientUpdatedAt?: string }[]>,
  processQueueFn: () => Promise<void>,
): Promise<void> {
  const localSessions = databaseService.getAllSessions()
  if (localSessions.length === 0) return

  const remoteSessions = await pullFn()
  const remoteMap = new Map(remoteSessions.map((s) => [s.id, s.clientUpdatedAt]))

  const needsUpload = localSessions.filter((s) => {
    if (s.endedAt === null) return false
    const remoteUpdatedAt = remoteMap.get(s.id)
    if (!remoteUpdatedAt) return true
    return s.updatedAt > new Date(remoteUpdatedAt).getTime()
  })

  if (needsUpload.length === 0) {
    log.debug('Retroactive push: all local sessions up to date on backend')
    return
  }

  log.info(`Retroactive push: uploading ${needsUpload.length} sessions`)
  for (const session of needsUpload) {
    queueFn({
      id: session.id,
      title: session.title,
      summary: session.summary ?? undefined,
      insightsJson: session.insightsJson ?? undefined,
      transcriptJson: JSON.stringify(session.transcript),
      aiResponsesJson: JSON.stringify(session.aiResponses),
      modeId: session.modeId ?? undefined,
      durationSeconds: session.durationSeconds,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: session.endedAt ? new Date(session.endedAt).toISOString() : undefined,
      clientUpdatedAt: new Date(session.updatedAt).toISOString(),
    })
  }

  await processQueueFn()
  log.info('Retroactive push complete')
}
