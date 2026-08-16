/**
 * Optional vendor boot hooks. Recall meeting detection used to live here.
 * Recall is removed — these stay as no-ops so existing boot/IPC callers
 * do not need a parallel delete.
 */

export async function initializeVendorFeatures(): Promise<void> {
  // no-op: Recall SDK is not initialized
}

export function reinitRecallFromStore(): Promise<void> {
  return Promise.resolve()
}

export async function shutdownVendorFeatures(): Promise<void> {
  // no-op
}

export function _resetVendorFeaturesForTesting(): void {
  // no-op
}
