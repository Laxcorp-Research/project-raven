# W02 Evidence — NSIS installer install + uninstall + v2.0.8 upgrade path

Captured 2026-05-06 on the Windows Cursor session machine
(Windows 11 Home 26200, x64) by running the v2.0.8 and v2.2.0
installers downloaded from the production CDN.

## Test environment

- OS: Windows 11 Home Single Language, build 26200, x64
- PowerShell 5.1.26100.8115
- Both installers downloaded from CDN, no cert involvement, no local rebuild

## Pre-install baseline (clean machine)

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall — no Raven entry
$env:LOCALAPPDATA\Programs\Raven — absent
$env:APPDATA\Raven — absent
HKCU\Software\Microsoft\Windows\CurrentVersion\Run — no Raven entry (no auto-start by default)

# Pre-existing dev-mode protocol handler from prior `npm run dev:pro`:
HKCU\Software\Classes\raven\shell\open\command =
  "C:\Users\Chaitanya Laxman\Documents\CiaraAI\Project Raven\project-raven\node_modules\electron\dist\electron.exe"
  "C:\Users\Chaitanya Laxman\Documents\CiaraAI\Project Raven\project-raven" "%1"
```

## Authenticode signature on both source .exes

```
Get-AuthenticodeSignature v2.0.8.exe -> Status: NotSigned
Get-AuthenticodeSignature v2.2.0.exe -> Status: NotSigned
```

This is broader than the 2026-05-05 audit captured. The audit said
v2.2.0 is unsigned; this run shows v2.0.8 is *also* unsigned. The
entire shipped Windows release history from this CDN has been
unsigned. Recorded here for the W1 follow-up.

## Step 1: v2.0.8 silent install

```
Start-Process v2.0.8.exe '/S' -Wait
Exit code: 0
Wall time: ~54 seconds
```

Result:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<uuid>
  DisplayName     = Raven 2.0.8
  DisplayVersion  = 2.0.8
  UninstallString = "$LOCALAPPDATA\Programs\Raven\Uninstall Raven.exe" /currentuser
  Publisher       = Laxcorp Research
  EstimatedSize   = 922050  (KB ≈ 900 MB unpacked)

$LOCALAPPDATA\Programs\Raven\
  Raven.exe (213,625,344 bytes)
  Uninstall Raven.exe
  resources\, locales\, etc. (full electron app payload)

HKCU\Software\Microsoft\Windows\CurrentVersion\Run — STILL no Raven entry
HKCU\Software\Classes\raven — UNCHANGED (pre-existing dev pointer survives)
```

Notes:
- `perMachine: false` honored — install lives under per-user
  `%LOCALAPPDATA%\Programs\Raven` and the Uninstall key is in HKCU,
  not HKLM. No admin rights were prompted.
- The `raven://` registry entry is NOT touched by the installer.
  The Electron client registers the protocol handler at runtime via
  `app.setAsDefaultProtocolClient()` in
  `src/pro/main/deepLink.ts`. Until the installed app is launched,
  the registry entry retains whatever was there before. (Full W7
  verification covers the launch-time registration separately.)

## Step 2: v2.0.8 → v2.2.0 upgrade

```
Start-Process v2.2.0.exe '/S' -Wait
Exit code: 0
Wall time: ~58 seconds
```

Result:

```
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<same uuid>
  DisplayName     = Raven 2.2.0   (was 2.0.8)
  DisplayVersion  = 2.2.0          (was 2.0.8)
  EstimatedSize   = 922341         (was 922050; small delta)
  UninstallString = same path

(Get-Item Raven.exe).VersionInfo
  ProductVersion = 2.2.0.0
  FileVersion    = 2.2.0
  ProductName    = Raven
  CompanyName    = Laxcorp Research
```

Verified the upgrade is in-place: same install dir, same Uninstall
GUID, no new Uninstall entry alongside, no leftover v2.0.8-specific
files in Programs\Raven.

## Step 2b — Build-content audit (BLOCKING FINDING for W4)

The v2.2.0 install does **not** contain Windows native modules that
`electron-builder.json5` `win.extraResources` declares:

```
$LOCALAPPDATA\Programs\Raven\resources\
  app.asar          (301 MB)
  app.asar.unpacked\
  tray\
  app-update.yml
  elevate.exe
  .raven-pro

# MISSING:
#   raven-windows-audio.win32-x64-msvc.node   (declared in electron-builder.json5 win.extraResources)
#   raven-aec.node                            (declared in electron-builder.json5 win.extraResources)
#   gstreamer-1.0\                            (declared in electron-builder.json5 win.extraResources)
#   gstreamer-lib\                            (declared in electron-builder.json5 win.extraResources)
```

Inferred chain: the `release-electron.yml` workflow has Mac-only
build steps for `src/native/aec` and `src/native/swift/AudioCapture`
but **no Windows step builds the Rust WASAPI module**. The
`extraResources.from` paths point at sources that don't exist in the
Windows runner's checkout, so electron-builder either silently skipped
the missing entries or warned and continued. Either way the produced
artifact is missing the audio capture and AEC pipelines on Windows.

Recorded here, defer to W4 for the actual fix.

## Step 3: silent uninstall

```
Start-Process "$LOCALAPPDATA\Programs\Raven\Uninstall Raven.exe" '/S','/currentuser' -Wait
Exit code: 0
Wall time: ~14 seconds
```

Result:

```
$LOCALAPPDATA\Programs\Raven — REMOVED (clean)
HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<uuid> — REMOVED (clean)
Start Menu Programs\*aven* — none
HKCU\Software\Classes\raven — UNCHANGED (still the dev pointer; uninstaller
  didn't create it so didn't remove it)
$env:APPDATA\Raven — absent (the app was never launched, so no electron-store
  data was ever written; deleteAppDataOnUninstall:false is moot here)
```

## Step 4: orphan sweep with `reg query HKCU /s /f Raven`

What's left after the uninstall, categorised:

| Path | Source | Cleanup expected? |
|---|---|---|
| `HKCU\Software\Microsoft\Windows\CurrentVersion\AppListBackup\ListOfEventDrivenBackedUpApps_*` (4 entries logging install + uninstall events for both versions) | Windows OS App List bookkeeping (records every MSI/MSIX-style install) | **No** — Windows-managed, ages out, not the installer's responsibility |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\AppListBackup\ListOfEventDrivenBackedUpTiles_*` (3 entries) | Windows OS Start Tile bookkeeping | **No** — same |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Search\JumplistData\com.laxcorpresearch.raven` | Windows JumpList | **No** — same |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Start\TileProperties\W~com.laxcorpresearch.raven` | Windows Start tile sync | **No** — same |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Cloud\…\appleveltilelist\windows.data.apps.appleveltileinfo$w~com.laxcorpresearch.raven` (2 entries) | Windows Settings cross-device tile sync | **No** — same |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\ApplicationAssociationToasts\raven_raven` | Windows file-association toast suppression | **No** — same |
| `HKCU\Control Panel\NotifyIconSettings\<id>` referencing the dev electron path | **PRE-EXISTING** from prior `npm run dev:pro` runs, not from this install | **No** — not caused by this install |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged\C:#…#electron.exe` referencing dev electron | **PRE-EXISTING** from prior dev runs | **No** — not caused by this install |
| `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FeatureUsage\AppSwitched\…\electron.exe` | Windows usage tracking, dev electron path | **No** — Windows-managed |
| `HKCU\Software\Classes\Local Settings\…\MuiCache\…\electron.exe.FriendlyAppName` | Windows shell name cache, dev electron path | **No** — Windows-managed |
| `HKCU\Software\Classes\raven\shell\open\command` (still pointing at dev electron) | **PRE-EXISTING** from prior dev runs, untouched by both installer and uninstaller | **No** — not caused by this install |

Conclusion: every entry that survives uninstall is either
(a) Windows-OS-managed bookkeeping that the OS itself owns and ages
out, or (b) pre-existing dev artifacts from prior `npm run dev:pro`
runs that were never touched by the NSIS installer in either
direction. **electron-builder's NSIS uninstaller cleaned up
everything it created.** No remediation needed for v2.2.

## W2 verdict

- v2.0.8 fresh install: **PASS** (clean install, expected files +
  registry, no admin rights needed, no auto-start at login by default)
- v2.0.8 → v2.2.0 upgrade: **PASS** (in-place upgrade, version flips,
  no leftover v2.0.8 files, same Uninstall GUID)
- v2.2.0 uninstall: **PASS** (Programs dir + Uninstall key + Start
  Menu shortcuts removed; Windows-OS-managed bookkeeping survives but
  is not in the installer's scope; pre-existing dev-mode protocol
  handler preserved untouched)

The W2 row's "no orphan registry entries" requirement is satisfied
when interpreted as "no orphans attributable to the NSIS installer".
If the bar is "no orphans of any kind", that bar cannot be met by any
NSIS installer because Windows itself records app history outside the
installer's scope.

## Side findings flagged elsewhere

- v2.0.8 + v2.2.0 BOTH unsigned -> W1 / W16 follow-up. The
  2026-05-05 revision-log entry only described v2.2.0 as unsigned;
  this run shows the entire CDN history is unsigned. Implication for
  W17 (auto-update v2.0.8 -> v2.2): both endpoints lack a
  publisherName, so electron-updater's Windows publisherName check
  (the default trust gate) compares "" to "" and passes - the update
  flow may actually work between two unsigned builds, but the
  end-state is still an unsigned install with no SmartScreen trust.

- v2.2.0 install dir is **missing**
  `raven-windows-audio.win32-x64-msvc.node`, `raven-aec.node`,
  `gstreamer-1.0\`, `gstreamer-lib\` even though
  `electron-builder.json5` `win.extraResources` declares them ->
  W4 follow-up. The Windows half of the build pipeline never compiles
  the Rust WASAPI module, so electron-builder silently ships a build
  with no native audio capture and no echo cancellation on Windows.
  The app would launch and (presumably) crash or no-op the moment a
  user attempted recording.
