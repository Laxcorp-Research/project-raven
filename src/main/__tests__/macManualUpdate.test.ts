import { describe, expect, it, vi } from 'vitest'
import {
  MAC_UPDATE_FEED_URL,
  compareSemver,
  evaluateMacManualUpdate,
  fetchMacFeedVersion,
  macDmgDownloadUrl,
  parseLatestMacYmlVersion,
  shouldShowMacUpdateDialog,
  shouldShowMacUpdateModal,
  macSettingsPrimaryAction,
} from '../macManualUpdate'

describe('parseLatestMacYmlVersion', () => {
  it('reads the electron-builder latest-mac.yml version field', () => {
    const yml = `version: 2.4.0
files:
  - url: Raven-Mac-2.4.0-Installer.zip
path: Raven-Mac-2.4.0-Installer.zip
`
    expect(parseLatestMacYmlVersion(yml)).toBe('2.4.0')
  })

  it('returns null when version is missing', () => {
    expect(parseLatestMacYmlVersion('path: Raven.zip\n')).toBeNull()
  })
})

describe('compareSemver', () => {
  it('orders patch/minor/major', () => {
    expect(compareSemver('2.3.10', '2.3.9')).toBe(1)
    expect(compareSemver('2.3.9', '2.3.9')).toBe(0)
    expect(compareSemver('2.3.9', '2.4.0')).toBe(-1)
  })
})

describe('evaluateMacManualUpdate', () => {
  it('is available only when the feed is newer than the running app', () => {
    expect(evaluateMacManualUpdate({ currentVersion: '2.3.9', remoteVersion: '2.3.9' })).toEqual({
      available: false,
    })
    expect(evaluateMacManualUpdate({ currentVersion: '2.3.9', remoteVersion: null })).toEqual({
      available: false,
    })
    expect(evaluateMacManualUpdate({ currentVersion: '2.3.9', remoteVersion: '2.4.0' })).toEqual({
      available: true,
      version: '2.4.0',
      dmgUrl: macDmgDownloadUrl('2.4.0'),
    })
  })
})

describe('shouldShowMacUpdateDialog', () => {
  it('hides after Later for that version, but a manual check reopens it', () => {
    expect(
      shouldShowMacUpdateDialog({ available: true, version: '2.4.0', dismissedVersion: '2.4.0' }),
    ).toBe(false)
    expect(
      shouldShowMacUpdateDialog({
        available: true,
        version: '2.4.0',
        dismissedVersion: '2.4.0',
        forcePrompt: true,
      }),
    ).toBe(true)
    expect(
      shouldShowMacUpdateDialog({ available: true, version: '2.5.0', dismissedVersion: '2.4.0' }),
    ).toBe(true)
  })

  it('does not show when there is no update', () => {
    expect(shouldShowMacUpdateDialog({ available: false })).toBe(false)
  })
})

describe('shouldShowMacUpdateModal', () => {
  const available = {
    isMac: true,
    isRecording: false,
    status: 'available',
    install: 'mac-dmg',
    version: '2.4.0',
  }

  it('is Mac-only and waits until a meeting is not recording', () => {
    expect(shouldShowMacUpdateModal({ ...available, isMac: false })).toBe(false)
    expect(shouldShowMacUpdateModal({ ...available, isRecording: true })).toBe(false)
    expect(
      shouldShowMacUpdateModal({ ...available, isRecording: true, forcePrompt: true }),
    ).toBe(true)
    expect(shouldShowMacUpdateModal({ ...available, install: 'auto' })).toBe(false)
    expect(shouldShowMacUpdateModal(available)).toBe(true)
  })
})

describe('macSettingsPrimaryAction', () => {
  it('opens the steps dialog for Mac DMG updates instead of GitHub', () => {
    expect(macSettingsPrimaryAction('mac-dmg')).toBe('prompt')
  })

  it('keeps Windows / ShipIt on the download path', () => {
    expect(macSettingsPrimaryAction('auto')).toBe('download')
    expect(macSettingsPrimaryAction(undefined)).toBe('download')
  })
})

describe('fetchMacFeedVersion', () => {
  it('reads version from the GitHub latest-mac.yml feed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'version: 2.4.0\npath: Raven.zip\n',
    })
    await expect(fetchMacFeedVersion(fetchImpl as typeof fetch)).resolves.toBe('2.4.0')
    expect(fetchImpl).toHaveBeenCalledWith(
      MAC_UPDATE_FEED_URL,
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })

  it('returns null when GitHub is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, text: async () => '' })
    await expect(fetchMacFeedVersion(fetchImpl as typeof fetch)).resolves.toBeNull()
  })
})
