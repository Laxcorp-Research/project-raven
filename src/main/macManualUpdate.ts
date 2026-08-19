import {
  MAC_UPDATE_FEED_URL,
  parseLatestMacYmlVersion,
} from '../shared/macManualUpdate'

export {
  MAC_UPDATE_FEED_URL,
  parseLatestMacYmlVersion,
  compareSemver,
  macDmgDownloadUrl,
  evaluateMacManualUpdate,
  shouldShowMacUpdateDialog,
  shouldShowMacUpdateModal,
} from '../shared/macManualUpdate'

export async function fetchMacFeedVersion(
  fetchImpl: typeof fetch = fetch,
  url = MAC_UPDATE_FEED_URL,
): Promise<string | null> {
  const res = await fetchImpl(url, {
    headers: { Accept: 'text/yaml, text/plain, */*' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  return parseLatestMacYmlVersion(await res.text())
}
