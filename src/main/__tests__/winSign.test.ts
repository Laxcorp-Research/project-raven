/**
 * Regression tests for build/win-sign.cjs - the custom electron-builder
 * Windows signing hook that routes through signtool.exe + the SSL.com
 * eSigner CKA virtual USB token.
 *
 * The hook is invoked by electron-builder during a Windows release-CI
 * build for every PE binary in the package (Raven.exe, the NSIS
 * Uninstall.exe, elevate.exe, agent-windows.exe, and the Setup
 * wrapper). A regression that silently no-ops the signing call - or,
 * worse, swallows a signtool non-zero exit - would re-ship the v2.2.0
 * bug class: a Windows .exe that LOOKS signed by file size but
 * actually has no Authenticode signature, getting blocked by
 * SmartScreen / Smart App Control / Defender.
 *
 * Strategy: test against the exported `_signWithDeps()` function with
 * injected mocks for fs.existsSync + fs.readdirSync +
 * child_process.spawnSync, rather than relying on vi.mock to
 * intercept the .cjs file's internal require()s (vitest delegates
 * .cjs to Node's native CJS loader, which bypasses vi.mock).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRequire } from 'module'
import * as nodePath from 'path'

const require_ = createRequire(import.meta.url)

// Resolve build/win-sign.cjs from project root regardless of how
// vitest was invoked.
const HOOK_PATH = nodePath.join(process.cwd(), 'build', 'win-sign.cjs')

interface SpawnResult {
  status: number | null
  error: Error | null
  stdout?: string
  stderr?: string
}

interface SignDeps {
  existsSync: (p: string) => boolean
  readdirSync: (p: string) => string[]
  spawnSync: (cmd: string, args: string[], options: unknown) => SpawnResult
  env: NodeJS.ProcessEnv
}

interface SignHookCJS {
  default: (configuration: { path?: string }) => Promise<void>
  _signWithDeps: (
    configuration: { path?: string },
    deps: SignDeps,
  ) => Promise<void>
  _autodetectSigntool: (deps: {
    existsSync: (p: string) => boolean
    readdirSync: (p: string) => string[]
  }) => string | null
}

const hook = require_(HOOK_PATH) as SignHookCJS

const VALID_THUMB = 'F0FAEAC3EFC08EC7F1BB3E0725062966B8E16658'
const FAKE_SIGNTOOL = 'C:\\fake\\signtool.exe'

function envWithThumb(extra: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    WIN_SIGN_THUMBPRINT: VALID_THUMB,
    WIN_SIGN_SIGNTOOL_PATH: FAKE_SIGNTOOL,
    ...extra,
  }
}

describe('build/win-sign.cjs (W1: signtool.exe + eSigner CKA integration)', () => {
  let existsSync: ReturnType<typeof vi.fn>
  let readdirSync: ReturnType<typeof vi.fn>
  let spawnSync: ReturnType<typeof vi.fn>

  beforeEach(() => {
    existsSync = vi.fn()
    readdirSync = vi.fn()
    spawnSync = vi.fn()
  })

  it('skips signing without spawning anything when WIN_SIGN_THUMBPRINT is unset (local dev / unsigned-build path)', async () => {
    // Should return cleanly, NOT throw - lets `npx electron-builder
    // --win` work on a developer's laptop without the cloud-signing
    // infra.
    await expect(
      hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
        existsSync,
        readdirSync,
        spawnSync,
        env: { /* no WIN_SIGN_* vars */ },
      }),
    ).resolves.toBeUndefined()

    expect(spawnSync).not.toHaveBeenCalled()
    expect(existsSync).not.toHaveBeenCalled()
  })

  it('strips embedded spaces from WIN_SIGN_THUMBPRINT before validating (handles the common certmgr.msc Details-tab copy-paste case)', async () => {
    existsSync.mockReturnValue(true)
    spawnSync.mockReturnValue({ status: 0, error: null, stdout: '', stderr: '' })

    // Thumbprint as copied from certmgr.msc Details: spaces every 2 chars.
    await hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
      existsSync,
      readdirSync,
      spawnSync,
      env: envWithThumb({
        WIN_SIGN_THUMBPRINT: 'F0 FA EA C3 EF C0 8E C7 F1 BB 3E 07 25 06 29 66 B8 E1 66 58',
      }),
    })

    const [, args] = spawnSync.mock.calls[0]!
    const sha1Idx = (args as string[]).indexOf('/sha1')
    // Spaces stripped, upper-case preserved, NO embedded whitespace.
    expect((args as string[])[sha1Idx + 1]).toBe(VALID_THUMB)
  })

  it('rejects a non-hex thumbprint (e.g., the user pasted a credential UUID instead of the cert thumbprint)', async () => {
    await expect(
      hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
        existsSync,
        readdirSync,
        spawnSync,
        env: envWithThumb({
          WIN_SIGN_THUMBPRINT: '9ff57897-d758-49e0-a3a6-4c6b83cb1aaf',
        }),
      }),
    ).rejects.toThrow(/must be 40 hex chars/)

    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('rejects an obviously-too-short thumbprint (catch truncated paste / wrong cert reference)', async () => {
    await expect(
      hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
        existsSync,
        readdirSync,
        spawnSync,
        env: envWithThumb({ WIN_SIGN_THUMBPRINT: 'F0FAEAC3' }),
      }),
    ).rejects.toThrow(/must be 40 hex chars/)
  })

  it('throws when the input file does not exist (catch path-resolution drift between electron-builder and the hook)', async () => {
    existsSync.mockImplementation((p: string) => p === FAKE_SIGNTOOL)

    await expect(
      hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
        existsSync,
        readdirSync,
        spawnSync,
        env: envWithThumb(),
      }),
    ).rejects.toThrow(/Input file does not exist/)

    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('throws when WIN_SIGN_SIGNTOOL_PATH is unset and autodetect cannot find any SDK (gives an actionable error rather than silently skipping or crashing)', async () => {
    // existsSync(input file) = true; existsSync(SDK root) = false.
    existsSync.mockImplementation((p: string) => p === '/tmp/Raven.exe')

    await expect(
      hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
        existsSync,
        readdirSync,
        spawnSync,
        env: { WIN_SIGN_THUMBPRINT: VALID_THUMB }, // no signtool path
      }),
    ).rejects.toThrow(/Could not find signtool\.exe/)

    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('uses WIN_SIGN_SIGNTOOL_PATH override when set, bypassing SDK autodetect entirely', async () => {
    existsSync.mockReturnValue(true)
    spawnSync.mockReturnValue({ status: 0, error: null, stdout: '', stderr: '' })

    await hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
      existsSync,
      readdirSync,
      spawnSync,
      env: envWithThumb({ WIN_SIGN_SIGNTOOL_PATH: 'D:\\custom\\signtool.exe' }),
    })

    expect(readdirSync).not.toHaveBeenCalled() // never autodetected
    const [tool] = spawnSync.mock.calls[0]!
    expect(tool).toBe('D:\\custom\\signtool.exe')
  })

  it('invokes signtool sign /fd sha256 /tr ts.ssl.com /td sha256 /sha1 <UPPER thumb> <file> in that exact order (locks the documented EV signing args)', async () => {
    existsSync.mockReturnValue(true)
    spawnSync.mockReturnValue({ status: 0, error: null, stdout: '', stderr: '' })

    await hook._signWithDeps({ path: '/tmp/release/Raven.exe' }, {
      existsSync,
      readdirSync,
      spawnSync,
      env: envWithThumb(),
    })

    expect(spawnSync).toHaveBeenCalledTimes(1)
    const [tool, args, options] = spawnSync.mock.calls[0]!
    expect(tool).toBe(FAKE_SIGNTOOL)
    expect(args).toEqual([
      'sign',
      '/fd', 'sha256',
      '/tr', 'http://ts.ssl.com',
      '/td', 'sha256',
      '/sha1', VALID_THUMB,
      '/tmp/release/Raven.exe',
    ])
    // shell:false because the file path can contain `&`, `(`, `)`,
    // `^`, etc. - cmd.exe would mangle them.
    expect((options as { shell?: boolean }).shell).toBe(false)
  })

  it('uppercases lowercase thumbprints before passing to signtool (signtool requires upper-case in /sha1)', async () => {
    existsSync.mockReturnValue(true)
    spawnSync.mockReturnValue({ status: 0, error: null, stdout: '', stderr: '' })

    await hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
      existsSync,
      readdirSync,
      spawnSync,
      env: envWithThumb({
        WIN_SIGN_THUMBPRINT: VALID_THUMB.toLowerCase(),
      }),
    })

    const [, args] = spawnSync.mock.calls[0]!
    const sha1Idx = (args as string[]).indexOf('/sha1')
    expect((args as string[])[sha1Idx + 1]).toBe(VALID_THUMB) // upper
  })

  it('honors WIN_SIGN_TIMESTAMP_URL override (lets us escape ECDSA TSA when a downstream tool requires RSA timestamps)', async () => {
    existsSync.mockReturnValue(true)
    spawnSync.mockReturnValue({ status: 0, error: null, stdout: '', stderr: '' })

    await hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
      existsSync,
      readdirSync,
      spawnSync,
      env: envWithThumb({ WIN_SIGN_TIMESTAMP_URL: 'http://ts.ssl.com/legacy' }),
    })

    const [, args] = spawnSync.mock.calls[0]!
    const trIdx = (args as string[]).indexOf('/tr')
    expect((args as string[])[trIdx + 1]).toBe('http://ts.ssl.com/legacy')
  })

  it('throws when signtool exits non-zero - DOES NOT silently produce an unsigned binary (the v2.2.0 release-CI bug class)', async () => {
    existsSync.mockReturnValue(true)
    spawnSync.mockReturnValue({ status: 1, error: null, stdout: '', stderr: 'SignTool Error: ...' })

    await expect(
      hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
        existsSync,
        readdirSync,
        spawnSync,
        env: envWithThumb(),
      }),
    ).rejects.toThrow(/signtool\.exe exited with code 1/)
  })

  it('throws when spawnSync itself errors (e.g., signtool.exe path wrong on the runner)', async () => {
    existsSync.mockReturnValue(true)
    spawnSync.mockReturnValue({
      status: null,
      error: new Error('ENOENT: signtool not found'),
      stdout: '',
      stderr: '',
    })

    await expect(
      hook._signWithDeps({ path: '/tmp/Raven.exe' }, {
        existsSync,
        readdirSync,
        spawnSync,
        env: envWithThumb(),
      }),
    ).rejects.toThrow(/Failed to spawn signtool\.exe: ENOENT: signtool not found/)
  })

  it('production default export wires fs.existsSync + fs.readdirSync + child_process.spawnSync + process.env (smoke check that the CJS export shape electron-builder expects is intact)', () => {
    expect(typeof hook.default).toBe('function')
    expect(typeof hook._signWithDeps).toBe('function')
    expect(typeof hook._autodetectSigntool).toBe('function')
  })

  describe('autodetectSigntool()', () => {
    it('returns null when the Windows 10 SDK root does not exist (non-Windows runner / minimal Windows image)', () => {
      const result = hook._autodetectSigntool({
        existsSync: vi.fn().mockReturnValue(false),
        readdirSync: vi.fn().mockReturnValue([]),
      })
      expect(result).toBeNull()
    })

    it('picks the newest version dir by lexicographic sort and returns the x64 signtool under it', () => {
      const result = hook._autodetectSigntool({
        // SDK root exists; signtool exists at every candidate. Sort
        // newest-first and pick the first.
        existsSync: vi.fn().mockReturnValue(true),
        readdirSync: vi.fn().mockReturnValue([
          '10.0.22000.0',
          '10.0.26100.0',
          '10.0.19041.0',
          'README.txt', // garbage entries are filtered out
        ]),
      })
      expect(result).toBe('C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe')
    })

    it('skips version dirs that do not contain x64\\signtool.exe (partial SDK installs)', () => {
      const existsSync = vi.fn().mockImplementation((p: string) => {
        if (p === 'C:\\Program Files (x86)\\Windows Kits\\10\\bin') return true
        // 26100 has no signtool.exe, 22000 does
        if (p.includes('26100')) return false
        return p.includes('22000')
      })
      const result = hook._autodetectSigntool({
        existsSync,
        readdirSync: vi.fn().mockReturnValue(['10.0.22000.0', '10.0.26100.0']),
      })
      expect(result).toBe('C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.22000.0\\x64\\signtool.exe')
    })
  })
})
