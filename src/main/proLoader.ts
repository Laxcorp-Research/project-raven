/**
 * Pro features loader.
 *
 * Registers auth/sync/billing IPC handlers from src/pro/.
 * The auth service itself checks if a backend is configured
 * and gracefully no-ops when running without one.
 */

import { registerAuthHandlers } from '../pro/main/authIpc'

export function initializeProFeatures(): void {
  registerAuthHandlers()
}
