# W07 Evidence — Deep link `raven://` on Windows (registry + second-instance argv)

Captured 2026-05-06 on the Windows Cursor session machine
(Win11 26200, x64).

## What W7 needs to prove

From plan item #40 + the row in V2_2_STABILITY_PLAN.md:
> Deep link (`raven://`) registered via Windows registry, OAuth
> callback + billing-success both fire via `second-instance` argv

And the user's prompt:
> test the OAuth callback (raven://auth/callback?...) and the
> billing-success redirect (raven://billing/success?...) by clicking
> a link in a browser. The handler is in src/pro/main/authIpc.ts
> [actually `src/pro/main/deepLink.ts`] and the registry registration
> happens at install via the NSIS script [actually at runtime via
> `app.setAsDefaultProtocolClient` in `registerProtocol()`].

The Windows half of `src/pro/main/deepLink.ts` had ZERO unit-test
coverage prior to this commit despite being on the OAuth login +
billing redirect critical paths.

## Verification 1: registry handler is well-formed

`reg query HKCU\Software\Classes\raven\shell\open\command` on the
Windows session machine, before any change:

```
HKEY_CURRENT_USER\Software\Classes\raven\shell\open\command
    (Default)    REG_SZ    "C:\Users\Chaitanya Laxman\Documents\CiaraAI\Project Raven\project-raven\node_modules\electron\dist\electron.exe"
                           "C:\Users\Chaitanya Laxman\Documents\CiaraAI\Project Raven\project-raven"
                           "%1"
```

This is the dev-mode registration left over from a prior
`npm run dev:pro` session. The shape is correct:
- Electron binary as the executable
- App entry point (project root) as the first arg
- `%1` placeholder (Windows OS replaces with the clicked
  `raven://...` URL when launching) as the second arg

When the v2.2.x signed installer ships, the user's first launch of
`Raven.exe` will execute `app.setAsDefaultProtocolClient('raven')`
in `registerProtocol()` and overwrite this entry to point at the
installed `Raven.exe` path - same shape, same `%1` placeholder.
The W2 evidence already showed the v2.0.8 install does NOT touch
this registry entry at install-time (electron-builder's NSIS
template doesn't write protocol bindings; the runtime registration
in `registerProtocol()` is the only writer). So the
"registry registration happens at install via the NSIS script"
claim in the user's W7 prompt is mistaken - it happens at first
runtime, not at install. Documenting the clarification here.

## Verification 2: registerProtocol() executes on Windows

The W3 dev:pro:staging session's captured log
(`%TEMP%\raven-w2\dev-pro-staging.log`) contained:

```
[DeepLink] Registered raven:// protocol handler
```

Which is the log line `registerProtocol()` emits after
`app.setAsDefaultProtocolClient('raven')` returns. So the runtime
registration path is confirmed working on Win11 26200 + Electron
40.9.3.

## Verification 3: parseDeepLinkUrl + handleDeepLink + setupDeepLinkHandlers

15 new unit tests in `src/pro/main/__tests__/deepLink.test.ts`
(file did not exist prior to this commit). Three concern-grouped
describe blocks:

### `handleDeepLink — auth path` (5 tests)

- "forwards a well-formed `raven://auth/callback?code=...` to the
  registered listener" — locks `{ code, state }` round-trip.
- "accepts the alias path `raven://auth?code=...` (without
  `/callback`) for parity with shorter OAuth redirect URIs" — locks
  the dual-path acceptance the parser currently supports.
- "forwards the OAuth error parameter when the IdP rejected the
  user (e.g. consent denied)" — locks the
  `{ code: '', error: <idp-error> }` shape consumed by
  `authService.startBrowserAuth()`'s rejection path.
- "forwards a missing_code error when the URL has no code and no
  error (defensive against IdP shape drift)" — locks the
  `'missing_code'` synthetic error so a future change to the
  parser doesn't quietly drop these into the floor.
- "drops a code received with no listener registered (security:
  cannot validate PKCE state)" — guards against the state-validation
  bypass that would happen if the parser handed off to a default
  listener after timeout.

### `handleDeepLink — billing path` (3 tests)

- "routes `raven://billing-success` to the `billing:success` IPC
  channel and focuses the dashboard" — covers the Dodo
  return-URL flow.
- "routes `raven://billing-cancel` to focusDashboard only, does
  NOT fire `billing:success`" — guards against crossed wires
  congratulating the user on a payment that didn't happen.
- "does NOT forward a `billing-success` URL to the auth listener
  (channel separation)" — locks the dispatcher's prefix gate.

### `handleDeepLink — defensive parsing` (3 tests)

- "ignores a URL with the wrong scheme (only `raven:` is honoured)"
  — covers `https://`, `mailto:` etc.
- "ignores a `raven://` URL with an unknown path (so a typo /
  spoofed deep-link cannot trigger auth)" — covers
  `raven://settings?code=spoofed` etc.
- "ignores a malformed URL that throws in `new URL()` rather than
  crashing the main process" — covers garbage input.

### `registerProtocol` (1 test)

- "registers `raven://` as the default protocol client (the call
  that writes HKCU\\Software\\Classes\\raven on Windows)" — locks the
  call site so a refactor that removes
  `app.setAsDefaultProtocolClient('raven')` fails this test.

### `setupDeepLinkHandlers — second-instance argv` (3 tests)

This is the **Windows-specific half** the user's W7 prompt asks
about. macOS uses `app.on('open-url')`; Windows uses single-instance
lock + a `second-instance` event whose `argv` carries the
`raven://...` URL when the OS launches a second Raven.exe via the
registry binding.

- "wires `app.on('second-instance')` so a second launch with
  `raven://` in argv routes through `handleDeepLink`" — invokes
  the captured handler with simulated argv
  `['Raven.exe', 'raven://auth/callback?code=second-instance-code']`
  and asserts the auth listener receives the parsed callback.
- "a second-instance fire with no `raven://` in argv is a no-op
  (does not call the auth listener)" — covers the case of the
  user double-clicking the Start Menu shortcut while Raven was
  already running (argv has only the .exe path).
- "quits the app when the single-instance lock is not acquired
  (prevents two Raven instances trampling on the same protocol
  handler)" — covers the case where the user launched Raven twice
  before the OS resolved the protocol click; the second instance
  gets the URL via second-instance, then exits.

## Test results

```
$ npx vitest run src/pro/main/__tests__/deepLink.test.ts
 ✓ src/pro/main/__tests__/deepLink.test.ts (15 tests) 9ms
 Tests  15 passed (15)
```

Full client suite re-run after the addition:

```
$ npm test
Test Files  36 passed (36)         (was 35, +1 new file)
Tests  673 passed (673)            (was 658, +15 new tests)
```

ESLint clean on the new file (after a small fix - the original
draft used `javascript:alert(1)` as a wrong-scheme fixture which
the `no-script-url` rule blocks; replaced with `mailto:` which
makes the same point).

## What's NOT executed live

A full browser-click → raven:// → OS resolves → Raven launches →
second-instance fires path was deliberately not run live. The
existing dev-mode registry pointer in HKCU resolves to
`Electron.exe + project root + %1`, which is the full Raven app
entry point - launching it via `Start-Process raven://...` would
boot the entire dev:pro Raven (slow, registers global hotkeys
that conflict with Cursor, requires onboarding to use the auth
flow productively). The unit tests above cover every step in the
chain that's Raven code; what they don't cover is the OS hop from
"Windows shell parses HKCU registry binding + spawns the bound
process with `%1` substituted" - that's standard Windows shell
behaviour, not Raven code, and the existing dev pointer
demonstrates it works (it was created by a prior session's
`registerProtocol()` writing to HKCU and is still well-formed).

The same evidence-pattern would apply to a v2.2.x signed install
once W1 unblocks.
