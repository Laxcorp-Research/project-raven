# W05 Evidence — DPAPI safeStorage on Windows + platform-tag invariant

Captured 2026-05-06 on the Windows Cursor session machine
(Win11 26200, x64).

## What W5 needs to prove

From the row in V2_2_STABILITY_PLAN.md:
> Auth refresh root-cause on DPAPI; cross-reference Mac findings from M4

And from the user's W5 prompt:
> M4 already patched the Mac Keychain code path on the Mac side
> (loadStoredTokens preserves the blob on decrypt failure;
> storeTokensSecurely falls back to plaintext on encrypt failure).
> The same code applies to Windows DPAPI. Verify it holds up under:
>   - cipher /u (DPAPI key rotation)
>   - User-profile migration to a new machine
>   - "Cancel" on a credential prompt
> Ship a Windows-side regression test if the Mac one in
> src/pro/main/__tests__/authService.test.ts doesn't already
> cover the case.

## Coverage analysis: what the M4 Mac tests already lock in

The two Mac tests at `src/pro/main/__tests__/authService.test.ts`
lines 274-394 mock `electron.safeStorage` and don't touch
`process.platform`, so they exercise the same code paths on any
host:

```typescript
// Path 1 - encrypt fallback (covers "Cancel on credential prompt"
// on either Keychain or DPAPI; the underlying call site is
// safeStorage.encryptString throwing despite isEncryptionAvailable
// reporting true).
'falls back to plaintext save when isEncryptionAvailable() returns true
 but encryptString throws (Keychain prompt cancelled / locked)'

// Path 2 - decrypt preserve (covers "cipher /u DPAPI rotation" and
// "user-profile migration to a new machine"; both surface as
// safeStorage.decryptString throwing on a previously-good blob).
'returns false from isAuthenticated and does NOT clear the persisted
 blob when decryptString throws (so next launch can retry)'

// Path 3 - logout authority (verifies the bug-fix didn't accidentally
// neuter the legitimate logout clear).
'still clears tokens normally on logout even after a prior decrypt
 failure preserved the blob'
```

Verified on the Windows host:
```
$ npx vitest run src/pro/main/__tests__/authService.test.ts
 ✓ src/pro/main/__tests__/authService.test.ts (15 tests)
 Tests  15 passed (15)         (was 13, +2 W5)
```

So the three runtime DPAPI scenarios the user prompt asks about
ARE all covered at the unit level by the existing Mac tests; the
test invariants are platform-agnostic by design and run identically
on Windows.

## What's NOT covered by the Mac tests: platform-tag invariant

The M4 fix tags Sentry breadcrumbs and captureMessage events with
`process.platform` so triage can filter Windows DPAPI failures
separately from Mac Keychain failures. The Mac tests use
`expect.objectContaining` and don't assert the platform tag's
value - so a future regression that drops the platform tag (or
hardcodes `'darwin'`) would NOT fail the Mac tests.

Two new tests added in a `W5: DPAPI failure paths carry win32 platform tag on Windows host`
describe block, gated on `process.platform === 'win32'` via
`it.skip` on non-Windows hosts:

```typescript
const itOnWindows = process.platform === 'win32' ? it : it.skip

itOnWindows('encrypt-fallback captureMessage tags auth.platform=win32 (Cancel on DPAPI prompt / locked session)', async () => {
  // ... same setup as M4's encrypt-fallback test ...
  expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
    'safeStorage.encryptString threw - storing tokens in plaintext fallback',
    expect.objectContaining({
      level: 'warning',
      tags: expect.objectContaining({
        'auth.failure_mode': 'encrypt_failed_fallback',
        'auth.platform': 'win32',           // <-- the new assertion
      }),
    }),
  )
})

itOnWindows('decrypt-preserve breadcrumb + captureMessage tag platform=win32 (cipher /u rotation / profile migration)', async () => {
  vi.resetModules()
  mockGetSetting.mockImplementation((key) =>
    key === 'auth_tokens' ? 'BASE64-ENCRYPTED-BLOB-FROM-PRE-CIPHER-/u' : undefined
  )
  mockIsEncryptionAvailable.mockReturnValue(true)
  mockDecryptString.mockImplementation(() => {
    throw new Error('CryptUnprotectData failed: key not found')
  })
  // ... import + isAuthenticated() trigger ...
  expect(mockSentryAddBreadcrumb).toHaveBeenCalledWith(
    'auth', 'safeStorage:decrypt-failed',
    expect.objectContaining({
      error: 'CryptUnprotectData failed: key not found',
      platform: 'win32',                    // <-- the new assertion
    }),
    'warning',
  )
  expect(mockSentryCaptureMessage).toHaveBeenCalledWith(
    'safeStorage.decryptString failed - preserving blob, returning null for this session',
    expect.objectContaining({
      level: 'warning',
      tags: expect.objectContaining({
        'auth.failure_mode': 'decrypt_failed_preserve',
        'auth.platform': 'win32',           // <-- the new assertion
      }),
    }),
  )
})
```

Verified on the Windows host:
```
$ npm test
 Test Files  35 passed (35)
 Tests  658 passed (658)        (was 656, +2 W5)
```

On the Mac CI runner the two tests skip via `it.skip` (no false
failures); on Windows they run strict and assert
`auth.platform === 'win32'` literally.

## Asymmetry surfaced (M-row triage)

The M4 fix's two failure paths are slightly inconsistent in the
breadcrumb data they emit:

```typescript
// storeTokensSecurely encrypt path - breadcrumb data WITHOUT
// platform field:
addBreadcrumb('auth', 'safeStorage:encrypt-fallback', {
  error: err instanceof Error ? err.message : String(err),
}, 'warning')

// loadStoredTokens decrypt path - breadcrumb data WITH platform:
addBreadcrumb('auth', 'safeStorage:decrypt-failed', {
  error: err instanceof Error ? err.message : String(err),
  platform: process.platform,
}, 'warning')
```

The `captureMessage` calls on both paths DO have `auth.platform` in
the tags, so Sentry's aggregated issue counts are correctly
attributable per platform. The asymmetry only affects the
breadcrumb trail viewer (which shows the OS at the failure site
inline). Not material for v2.2; flagging as M-row clean-up since
M4 is the Mac session's commit.

## Runtime DPAPI scenarios NOT executed live (and why)

- **cipher /u DPAPI key rotation**: deliberately not run on this
  Windows session. `cipher /u` rotates the user's primary master
  key for ALL DPAPI-encrypted secrets across the entire system
  (Edge cookies, Cursor's own DPAPI use if any, Outlook saved
  passwords, network credentials, etc.). Destructive at the OS
  scope. The unit test that throws `decryptString` IS the
  controlled simulation of the equivalent application-visible
  state ("a previously-good blob no longer decrypts").

- **User-profile migration to a new machine**: would require
  copying `%APPDATA%\Raven` to another Windows machine where
  the user's DPAPI master key is different. Same observable state
  as cipher /u from the app's perspective - decryptString throws.
  Already covered by the unit test.

- **"Cancel" on a credential prompt**: classic Keychain-style
  modal interaction. Windows DPAPI doesn't typically prompt - it
  uses the user's session credentials silently. The Windows
  equivalent failure modes are session locked / domain controller
  unreachable / corrupted profile, all of which surface as
  encryptString throwing - covered by the unit test.

The unit tests above are the strongest verification short of
running destructive OS-level commands. The M4 fix's design
guarantees the same Sentry instrumentation fires on every
DPAPI-throw path.

## W5 verdict

- M4 fix's behavioural invariants: **VERIFIED on Windows** via
  `npm test` running the existing platform-agnostic Mac tests.
- M4 fix's Windows-platform-tag instrumentation: **LOCKED IN** via
  the two new W5 tests (with `it.skip` gating on non-Windows hosts
  so Mac CI stays green).
- Three runtime DPAPI scenarios from the user prompt (cipher /u,
  profile migration, Cancel): **covered at the unit level** by
  the simulated throw paths. Live execution of cipher /u skipped
  as destructive to OS-wide DPAPI state.

Suite total: 656 -> 658 green; lint clean on the modified file;
typecheck clean. No source changes; tests-only commit.
