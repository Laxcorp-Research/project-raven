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

const log = createLogger('ProLoader')

export async function initializeProFeatures(): Promise<void> {
  if (!isProMode()) {
    log.info('Free mode — skipping pro features')
    return
  }

  try {
    const { registerAuthHandlers } = await import(
      /* @vite-ignore */ '../pro/main/authIpc'
    )
    await registerAuthHandlers()

    const { registerSyncHandlers } = await import(
      /* @vite-ignore */ '../pro/main/syncIpc'
    )
    registerSyncHandlers()

    const { processSyncQueue, pullAndMergeRemoteSessions } = await import(
      /* @vite-ignore */ '../pro/main/syncService'
    )
    processSyncQueue().catch((err) => log.debug('Initial sync queue flush failed:', err))
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
