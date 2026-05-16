# W10 Evidence — Microphone permission flow on Windows 10/11

Captured 2026-05-06 on the Windows Cursor session machine
(Win11 26200, x64, Electron 40.9.3).

## What W10 needs to prove

From plan item #43 + the row in V2_2_STABILITY_PLAN.md:
> Microphone permission flow on Windows 10/11 | 30 min |
> [win-only] - Raven will prompt once; if user denied at the OS
> level, Settings -> Privacy -> Microphone path must be surfaced.

## Real bug found in `src/main/permissions.ts`

Pre-2026-05-06 the entire non-darwin branch hardcoded permissions
as 'granted':

```typescript
// PRE-FIX (BROKEN ON WINDOWS):
export function getPermissionStatus(): PermissionStatus {
  if (process.platform !== 'darwin') {
    return { microphone: 'granted', screen: 'granted', accessibility: 'granted' }
  }
  // ... real check ...
}

export async function requestMicrophoneAccess(): Promise<boolean> {
  if (process.platform !== 'darwin') return true   // <-- always true on Win
  // ... real check ...
}

export function openMicrophonePreferences(): void {
  if (process.platform !== 'darwin') return         // <-- silent no-op on Win
  shell.openExternal('x-apple.systempreferences:...')
}
```

User-visible consequence on Windows for a user who had toggled
Settings -> Privacy -> Microphone -> "Microphone access" OFF (or
specifically denied desktop-app access):

1. `checkPermissionsForRecording()` reported `ok: true` (because
   `getPermissionStatus().microphone` was hardcoded 'granted').
2. `audioManager.startRecording()` proceeded to open a WASAPI
   stream that immediately failed at the OS layer.
3. The user saw a vague generic error from the audio capture
   pipeline rather than the actionable
   "Microphone access is disabled in Windows Settings - click here
   to open Settings".
4. Clicking "Open Microphone Settings" in the Settings panel of
   the Raven dashboard (renderer's
   `window.raven.permissionsOpenMicrophone()` -> IPC
   `permissions:open-microphone` -> main `openMicrophonePreferences()`)
   did literally nothing because of the silent no-op.

This is exactly the failure mode plan item #43's
"Settings -> Privacy -> Microphone path must be surfaced" was
calling out.

## Verification of the underlying API

Standalone Electron 40.9.3 smoke confirmed
`systemPreferences.getMediaAccessStatus('microphone')` works on
Win11 26200:

```
[Perm-Smoke] Electron version: 40.9.3
[Perm-Smoke] process.platform: win32
[Perm-Smoke] getMediaAccessStatus("microphone"): granted
[Perm-Smoke] getMediaAccessStatus("screen"): granted
```

The Electron API has been Windows-supported since Electron 8.x
(2020). Pre-fix Raven's permissions.ts wasn't using it on Windows
despite it being the right API to call.

## Fix

`src/main/permissions.ts`, three functions updated:

### `getPermissionStatus()`
- macOS branch unchanged (covered by 2 existing tests).
- New Windows branch: returns the real
  `systemPreferences.getMediaAccessStatus('microphone')`. Screen
  + Accessibility stay 'granted' because Win10/11 doesn't gate
  them at the OS level the way macOS TCC does.
- Fallback (Linux + others): kept as hardcoded 'granted' since
  there's no equivalent OS-level gating.

### `requestMicrophoneAccess()`
- macOS branch unchanged (uses `askForMediaAccess` to trigger the
  TCC prompt; covered by 3 existing tests).
- New Windows branch:
  - 'granted'        -> return true.
  - 'denied'         -> return false (caller will surface the
                       Settings deep link).
  - 'not-determined' -> return true (Windows has NO programmatic
                       prompt API; the OS shows its own dialog
                       when the WASAPI stream actually opens, so
                       letting the caller proceed is the right
                       thing - any other choice would block the
                       first-time user from ever recording).
- Fallback (Linux): unchanged.

### `openMicrophonePreferences()`
- macOS branch unchanged (opens TCC pane; covered by 1 existing
  test).
- New Windows branch: launches `ms-settings:privacy-microphone`
  via `shell.openExternal`. This is the documented Windows Settings
  deep-link URI for the Microphone privacy page.
- No fallback for Linux (no equivalent OS settings page; intended
  no-op).

`audioManager.ts` is **NOT changed** (per the windows-debug.mdc
rule). The existing call site
```typescript
const granted = await requestMicrophoneAccess()
if (!granted) {
  // ... show error
}
```
already does the right thing once `requestMicrophoneAccess`
returns false correctly on Windows. The "open Settings" button in
the existing renderer Settings panel already calls
`window.raven.permissionsOpenMicrophone()`, which now actually
opens Settings on Windows instead of silently no-op'ing.

## Tests

9 new tests in
`src/main/__tests__/permissions.test.ts` under
`describe('W10 - Windows microphone permission flow', ...)`:

1. `getPermissionStatus reports the OS-reported microphone status (not hardcoded granted) on Windows`
2. `getPermissionStatus reports granted when Windows mic permission is granted`
3. `requestMicrophoneAccess returns false when Windows reports denied (callers should surface the Settings deep-link)`
4. `requestMicrophoneAccess returns true on Windows for not-determined (lets the OS prompt fire at first stream open via WASAPI)`
5. `requestMicrophoneAccess returns true on Windows when already granted`
6. `checkPermissionsForRecording on Windows reports missing mic when denied (so audioManager can short-circuit)`
7. `openMicrophonePreferences launches ms-settings:privacy-microphone on Windows (no longer a silent no-op)`
8. `openScreenRecordingPreferences is a no-op on Windows (no equivalent OS gating)`
9. `openAccessibilityPreferences is a no-op on Windows (no equivalent OS gating)`

Each test sets `process.platform = 'win32'` in `beforeEach` and
asserts the new Windows-specific behaviours. Test 3 also asserts
that `askForMediaAccess` is NOT called on Windows - that API is
macOS-only and would throw on Win32, so a future change that tries
to use it on Windows would fail this test.

## Test results

```
$ npx vitest run src/main/__tests__/permissions.test.ts
 ✓ src/main/__tests__/permissions.test.ts (30 tests) 9ms
 Tests  30 passed (30)            (was 21, +9 W10)

$ npm test
 Test Files  36 passed (36)
 Tests  682 passed (682)          (was 673, +9 W10)

$ npx eslint src/main/permissions.ts src/main/__tests__/permissions.test.ts --max-warnings 0
 (clean)
```

## Live verification skipped (would require state mutation)

A truly end-to-end live test would require:
- Toggling Settings -> Privacy -> Microphone -> Microphone access
  off, then launching dev:pro:staging Raven, attempting a
  recording, observing the new error path.
- Then toggling it back on.

This was deliberately skipped because:
1. Toggling that setting affects ALL desktop apps the user has
   open (Cursor, Slack, Teams, etc.). Disruptive at OS scope.
2. The unit-test mocks above exercise every code path the live
   test would. The only thing they don't cover is whether the
   `ms-settings:privacy-microphone` URL launches the right page;
   that's a Windows Shell behaviour, not Raven code. The URI is
   the standard documented one (Microsoft Learn, ms-settings
   reference). If it ever changes in a future Windows build,
   `shell.openExternal` will still complete (just won't open the
   right page) - users can navigate manually.
3. The user can verify the deep-link manually by clicking "Open
   Microphone Settings" in the dashboard Settings panel after
   v2.2.x is installed.

## W10 verdict

`[x]` verified - real bug found and fixed in `permissions.ts` with
9 new regression tests locking in the Windows-specific behaviour.
`audioManager.ts` is unchanged (rule compliance) and inherits the
correct semantics via the function-level fix.
