/**
 * Regression: unsigned Mac builds left Identifier=Electron so Screen
 * Recording stayed denied after the user toggled Raven ON in Settings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'
import * as nodePath from 'path'

const require_ = createRequire(import.meta.url)
const HOOK_PATH = nodePath.join(process.cwd(), 'scripts', 'afterPack-mac-identity.cjs')

interface AfterPackCJS {
  (context: {
    electronPlatformName: string
    appOutDir: string
    packager: { appInfo: { productFilename: string } }
  }): Promise<void>
  _adhocSignMacApp: (
    appPath: string,
    deps: {
      execFileSync: (cmd: string, args: string[], options: unknown) => void
      existsSync: (p: string) => boolean
    },
  ) => void
  _shouldAdhocSignMacApp: (env?: NodeJS.ProcessEnv) => boolean
  _BUNDLE_ID: string
}

const hook = require_(HOOK_PATH) as AfterPackCJS

describe('scripts/afterPack-mac-identity.cjs', () => {
  let execFileSync: ReturnType<typeof vi.fn>
  let existsSync: ReturnType<typeof vi.fn>

  beforeEach(() => {
    execFileSync = vi.fn()
    existsSync = vi.fn(() => true)
  })

  it('uses the Raven bundle id, not Electron', () => {
    expect(hook._BUNDLE_ID).toBe('com.laxcorpresearch.raven')
  })

  it('adhoc-signs the .app with --identifier and without --deep', () => {
    hook._adhocSignMacApp('/tmp/Raven.app', { execFileSync, existsSync })

    expect(execFileSync).toHaveBeenCalledWith(
      'codesign',
      ['--force', '--sign', '-', '--identifier', 'com.laxcorpresearch.raven', '/tmp/Raven.app'],
      expect.any(Object),
    )
    const args = execFileSync.mock.calls[0][1] as string[]
    expect(args).not.toContain('--deep')
  })

  it('throws when the .app is missing (would otherwise ship Identifier=Electron)', () => {
    existsSync.mockReturnValue(false)
    expect(() => hook._adhocSignMacApp('/tmp/missing.app', { execFileSync, existsSync })).toThrow(
      /not found/,
    )
    expect(execFileSync).not.toHaveBeenCalled()
  })

  describe('_shouldAdhocSignMacApp', () => {
    it('skips adhoc when CSC_LINK is set (Developer ID from p12)', () => {
      expect(
        hook._shouldAdhocSignMacApp({
          CSC_LINK: 'cert.p12',
          CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        }),
      ).toBe(false)
    })

    it('skips adhoc when CSC_NAME is set (keychain identity name)', () => {
      expect(hook._shouldAdhocSignMacApp({ CSC_NAME: 'Developer ID Application: Example' })).toBe(
        false,
      )
    })

    it('adhoc-signs only when auto-discovery is off and no cert is provided', () => {
      expect(hook._shouldAdhocSignMacApp({ CSC_IDENTITY_AUTO_DISCOVERY: 'false' })).toBe(true)
    })

    it('skips adhoc by default so keychain Developer ID can sign', () => {
      expect(hook._shouldAdhocSignMacApp({})).toBe(false)
    })
  })
})
