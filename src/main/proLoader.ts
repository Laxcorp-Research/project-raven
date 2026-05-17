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
import { createDefaultMode, ensureActiveMode, migrateGeneralAssistantPromptV21 } from './services/builtinModes'

const log = createLogger('ProLoader')

export async function initializeProFeatures(): Promise<void> {
  if (!isProMode()) {
    log.info('Free mode - skipping pro features')
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
    databaseService.onNewAccountDatabase(async () => {
      await createDefaultMode()
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

    // Rerun the v2.1 General Assistant content migration AFTER the
    // account DB switch above - the boot-time call in src/main/index.ts
    // only hits the default DB, and for a logged-in user the General
    // Assistant row we actually care about lives in the account-specific
    // file (raven-<hash>.db), not the default one. Running this before
    // the switch (as we did prior to this fix) silently migrated the
    // wrong database. The migration is idempotent so running it again
    // later (e.g. on auth:login from authIpc.ts) is harmless.
    migrateGeneralAssistantPromptV21()

    const { queueSessionForSync, processSyncQueue, pullAndMergeRemoteSessions, startPeriodicSync } = await import(
      /* @vite-ignore */ '../pro/main/syncService'
    )

    sessionManager.setSyncFunction(queueSessionForSync)

    // Only start sync AFTER the account database is settled for a
    // logged-in user. For unauthenticated boots we leave sync
    // dormant - triggerPostLoginSync (called by auth:login/signup/
    // oauth handlers) starts it once the user is authenticated and
    // switchToUserDatabase has committed to the right DB file.
    // This pairing is the other half of the syncReady gate added in
    // syncService.ts; together they close the boot race where a
    // focus event or the old startPeriodicSync-at-handler-registration
    // call could land a sync cycle against the default DB.
    if (user?.id && backendUrl) {
      startPeriodicSync()

      retroactivePush(queueSessionForSync, processSyncQueue)
        .catch((err) => log.warn('Retroactive push failed (non-fatal):', err))

      pullAndMergeRemoteSessions().catch((err) => log.debug('Initial session pull failed:', err))

      // Phase 2 realtime sync. Start the WS stream alongside the
      // periodic-sync timer so server-side mutations on other
      // devices fan out sub-second instead of waiting on the
      // 15-min poll. onConnect re-runs the pull as a catch-up
      // path for anything that landed during a disconnect window
      // (initial boot disconnect, post-reboot reconnect, etc.).
      // The connector is idempotent against being started twice
      // (e.g., a triggerPostLoginSync racing with this boot path),
      // so calling it here is safe even on the
      // already-authenticated-since-last-boot path.
      try {
        const { startWsConnector } = await import(
          /* @vite-ignore */ '../pro/main/wsConnector'
        )
        startWsConnector({
          onConnect: () => {
            pullAndMergeRemoteSessions().catch((err) => log.debug('WS-onConnect catch-up session pull failed:', err))
          },
        })
      } catch (err) {
        log.warn('Failed to start WS connector on boot (non-fatal):', err)
      }
    }

    // Initialize Recall AI Desktop SDK for premium audio capture
    try {
      const { initRecallSdk, getRecallService } = await import(
        /* @vite-ignore */ '../pro/main/recallService'
      )
      const sdkReady = await initRecallSdk()
      if (sdkReady) {
        const recallService = getRecallService()
        await recallService.setupEventListeners()
        log.info('Recall SDK ready - meeting detection active')
      } else {
        log.info('Recall SDK not available - will use native audio capture')
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
    log.warn('Pro mode requested but src/pro/ not found - running without premium features', err)
  }
}

/**
 * One-time push of sessions that need to be uploaded to the backend.
 *
 * Previously this pulled the server's session list (filtered by
 * `since=lastSync`) and queued any local session whose id was absent.
 * The `since` filter meant rows older than last sync were always
 * "missing" from the remote list, so they got re-queued on every boot
 * and the backend rejected each one as stale - 82 KB of wasted
 * bandwidth per launch, plus noisy cross-device-conflict toasts for
 * what were in fact already-reconciled rows.
 *
 * The `synced_at` column added in migration 013 lets us make that
 * decision locally: queue only rows the client knows haven't been
 * reconciled with the server. No pull needed. Background flow, so we
 * pass `notifyOnConflict: false` - genuine conflicts from the user's
 * own edits still show their toast via the normal sync path.
 */
async function retroactivePush(
  queueFn: (s: { id: string; title?: string; summary?: string; insightsJson?: string; transcriptJson?: string; aiResponsesJson?: string; modeId?: string; durationSeconds?: number; startedAt: string; endedAt?: string; clientUpdatedAt?: string }) => void,
  processQueueFn: (options?: { notifyOnConflict?: boolean }) => Promise<void>,
): Promise<void> {
  const localSessions = databaseService.getAllSessions()
  if (localSessions.length === 0) return

  const needsUpload = localSessions.filter((s) => {
    if (s.endedAt === null) return false
    if (s.syncedAt === null) return true
    return s.updatedAt > s.syncedAt
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

  await processQueueFn({ notifyOnConflict: false })
  log.info('Retroactive push complete')
}
