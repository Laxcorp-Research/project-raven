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
    const { registerAuthHandlers } = await import('../pro/main/authIpc')
    registerAuthHandlers()
    log.info('Pro features initialized')
  } catch {
    log.warn('Pro mode requested but src/pro/ not found — running without premium features')
  }
}
