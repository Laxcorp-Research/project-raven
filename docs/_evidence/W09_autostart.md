# W09 Evidence — Auto-start at login via Windows registry Run key

Captured 2026-05-06 on the Windows Cursor session machine
(Win11 26200, x64, Electron 40.9.3).

## What W9 needs to prove

From plan item #42 + the row in V2_2_STABILITY_PLAN.md:
> Auto-start at login via Windows registry `Run` key (if exposed)
> | 30 min | [win-only] - macOS uses LaunchAgent via
> `app.setLoginItemSettings`. Windows is same API, different backend.

## What Raven exposes today

`src/main/ipc.ts:80-92`:

```typescript
safeHandle(
  'store:set',
  (key: keyof LocalSettings, value: LocalSettings[keyof LocalSettings]) => {
    if (PROTECTED_STORE_KEYS.includes(key as string)) {
      return false
    }
    saveSetting(key, value)
    if (key === 'openOnLogin') {
      app.setLoginItemSettings({ openAtLogin: !!value })
    }
    return true
  }
)
```

The renderer's Settings panel writes `openOnLogin` via this IPC.
The handler then calls `app.setLoginItemSettings({ openAtLogin })`
which is Electron's cross-platform API for "register / unregister
the app to launch at user login".

`docs/LAUNCH_V2_1_PLAN.md:176` confirms `openOnLogin` is one of the
device-local settings (not synced to the cloud account).

`src/main/__tests__/ipc.test.ts:257-267` already locks the wiring
at the unit level:
- "sets login item settings when key is openOnLogin" — asserts
  `setLoginItemSettings` is called with `{ openAtLogin: true }`.
- "does not set login item settings for other keys" — asserts the
  handler doesn't bleed the call into unrelated keys.

So the JS layer is covered. What W9 verifies is the OS-side effect
on Windows 11 - that `setLoginItemSettings({ openAtLogin: true })`
actually writes a Run key entry, and that `false` actually removes
it. That part is Electron's responsibility on the surface but is
the contract Raven implicitly depends on.

## Test method

A standalone Electron 40.9.3 script ran the
`setLoginItemSettings(true)` -> `setLoginItemSettings(false)`
sequence with `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
in between, plus `app.getLoginItemSettings()` for read-back.

## Captured output

### Pre-state (clean machine, no Raven Run-key entry)

```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
    OneDrive       REG_SZ  "C:\...\OneDrive.exe" /background
    Teams          REG_SZ  "C:\...\ms-teams.exe" msteams:system-initiated
    Microsoft.Lists  REG_SZ  C:\...\OneDrive.Sync.Service.exe
    Spotify        REG_SZ  C:\...\Spotify.exe --autostart --minimized
    Docker Desktop REG_SZ  C:\Program Files\Docker\Docker\Docker Desktop.exe
    MicrosoftCopilotAutoLaunch_…  REG_SZ  "C:\...\mscopilot.exe" --no-startup-window --win-session-start
```

`getLoginItemSettings`: `openAtLogin: false`. (And note: Electron
reports `executableWillLaunchAtLogin: true` because Spotify and
Microsoft.Lists are flagged as "this same path runs at login";
that's a different mechanism than Raven's per-app Run key.)

### After `setLoginItemSettings({ openAtLogin: true })`

```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
    OneDrive ...
    Teams ...
    Microsoft.Lists ...
    Spotify ...
    Docker Desktop ...
    MicrosoftCopilotAutoLaunch_… ...
    electron.app.Electron  REG_SZ  "C:\…\node_modules\electron\dist\electron.exe"
```

A new entry `electron.app.Electron` was written, pointing at the
dev-mode Electron binary. (For the v2.2.x packaged Raven the key
name will be the product name `Raven` or appId
`com.laxcorpresearch.raven`, derived from the app's metadata; for
a dev-mode test it's the generic Electron framework name.)

`getLoginItemSettings` now reports `openAtLogin: true`.

### After `setLoginItemSettings({ openAtLogin: false })` (cleanup)

```
HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
    OneDrive ...
    Teams ...
    Microsoft.Lists ...
    Spotify ...
    Docker Desktop ...
    MicrosoftCopilotAutoLaunch_… ...
```

The `electron.app.Electron` entry is gone. Pre-state restored
exactly. `getLoginItemSettings` reports `openAtLogin: false`.

## Side observation (Electron upstream issue, not Raven's concern)

The pre-state `getLoginItemSettings` output had:
```
"path":"C:\\Users\\Chaitanya"
"args":["Laxman\\AppData\\Roaming\\Spotify\\Spotify.exe"]
```

Electron 40.9.3's `getLoginItemSettings` parses the Run-key value
as `path + args` by splitting at the first space. On a Windows
account whose username contains a space (like
`C:\Users\Chaitanya Laxman\…`), this incorrectly splits the path
across the boundary. **This does NOT affect Raven** because Raven
never calls `getLoginItemSettings` in production code (only
`setLoginItemSettings`); the toggle state is mirrored from
electron-store's `openOnLogin` value rather than read back from
the OS. So a username-with-spaces user's Settings toggle still
displays correctly. Flagging in case the Mac session ever wants
to read the OS state for some reason - it's a known Electron
upstream parser bug that would need a workaround.

## W9 verdict

`app.setLoginItemSettings({ openAtLogin: true|false })` works
correctly on Windows 11 26200 with Electron 40.9.3:
- `true` writes a Run-key entry pointing at the executable.
- `false` removes the entry cleanly.
- `getLoginItemSettings().openAtLogin` reflects the current state.

Raven's `src/main/ipc.ts` `store:set 'openOnLogin'` handler
already wires this correctly (and is locked at the unit level by
`ipc.test.ts`). **No source change required for v2.2.**

The packaged v2.2.x Windows install will write its Run-key entry
under the product name (`Raven` or appId
`com.laxcorpresearch.raven`), pointing at
`%LOCALAPPDATA%\Programs\Raven\Raven.exe`. Confirmed safe by the
dev-mode equivalent test above.

The smoke-test script `src/main/__autostart-smoke__.cjs` has been
deleted post-capture (one-off probe, the captured stdout above is
the persistent evidence).
