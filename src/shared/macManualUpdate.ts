/**
 * Unsigned Mac builds cannot use Squirrel/ShipIt. Detect a newer GitHub
 * release from latest-mac.yml and hand the user a DMG URL instead.
 * Pure helpers live here so the dashboard modal can share the same rules.
 */

export const MAC_UPDATE_FEED_URL =
  'https://github.com/Laxcorp-Research/project-raven/releases/latest/download/latest-mac.yml'

export function parseLatestMacYmlVersion(yml: string): string | null {
  const match = yml.match(/^version:\s*['"]?(\d+\.\d+\.\d+)['"]?\s*$/m)
  return match?.[1] ?? null
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1
    if (pa[i] < pb[i]) return -1
  }
  return 0
}

export function macDmgDownloadUrl(version: string): string {
  return `https://github.com/Laxcorp-Research/project-raven/releases/download/v${version}/Raven-Mac-${version}-Installer.dmg`
}

export function evaluateMacManualUpdate(opts: {
  currentVersion: string
  remoteVersion: string | null
}): { available: boolean; version?: string; dmgUrl?: string } {
  if (!opts.remoteVersion) return { available: false }
  if (compareSemver(opts.remoteVersion, opts.currentVersion) <= 0) {
    return { available: false }
  }
  return {
    available: true,
    version: opts.remoteVersion,
    dmgUrl: macDmgDownloadUrl(opts.remoteVersion),
  }
}

export function shouldShowMacUpdateDialog(opts: {
  available: boolean
  version?: string
  dismissedVersion?: string
  forcePrompt?: boolean
}): boolean {
  if (!opts.available || !opts.version) return false
  if (opts.forcePrompt) return true
  return opts.dismissedVersion !== opts.version
}

export function shouldShowMacUpdateModal(opts: {
  isMac: boolean
  isRecording: boolean
  status: string
  install?: string
  version?: string
  dismissedVersion?: string
  forcePrompt?: boolean
}): boolean {
  if (!opts.isMac) return false
  if (opts.status !== 'available' || opts.install !== 'mac-dmg') return false
  if (opts.isRecording && !opts.forcePrompt) return false
  return shouldShowMacUpdateDialog({
    available: true,
    version: opts.version,
    dismissedVersion: opts.dismissedVersion,
    forcePrompt: opts.forcePrompt,
  })
}
