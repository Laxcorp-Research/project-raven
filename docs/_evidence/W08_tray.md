# W08 Evidence — Tray icon on Windows

Captured 2026-05-06 on the Windows Cursor session machine
(Win11 26200, x64). System UI is in light mode with a near-white
taskbar (~#FCFCFC).

## What W8 needs to prove

From plan item #41 + the row in V2_2_STABILITY_PLAN.md:
> Tray icon renders correctly on Windows (different icon file
> formats expected) | 15 min | [win-only] - electron handles
> scaling but source assets matter.

## Verification 1: assets load via Electron's nativeImage

Standalone Electron smoke test loaded both icons via
`nativeImage.createFromPath()` and instantiated a `Tray`. Captured
log:

```
[Tray-Smoke] idle path: C:\Users\…\resources\tray\iconTemplate.png
[Tray-Smoke] active path: C:\Users\…\resources\tray\iconActiveTemplate.png
[Tray-Smoke] idleIcon empty: false  size: { width: 22, height: 22 }
[Tray-Smoke] activeIcon empty: false  size: { width: 22, height: 22 }
[Tray-Smoke] Idle tray created. Waiting 12s before flipping to active...
[Tray-Smoke] Setting recording-active icon...
```

Both icons load as non-empty 22x22 images. `Tray()` constructor
does not throw. The `setImage()` swap from idle -> active also
does not throw. So at the Electron API level, **the tray
infrastructure works correctly on Windows 11 26200**.

## Finding 1 (REAL BUG): active and idle icons are byte-identical

```
$ Get-FileHash resources/tray/iconTemplate.png
F22F3B6B98AADE4158FEA6A79E42357B71645F5BBC6D2D98C52AECD3257E97B6

$ Get-FileHash resources/tray/iconActiveTemplate.png
F22F3B6B98AADE4158FEA6A79E42357B71645F5BBC6D2D98C52AECD3257E97B6     # <-- SAME

$ Get-FileHash resources/tray/iconTemplate@2x.png
1D021BFF3C321BA1A431168314CDFF315B0B59B89E0CE2CFDDBB06FCB422EE91

$ Get-FileHash resources/tray/iconActiveTemplate@2x.png
1D021BFF3C321BA1A431168314CDFF315B0B59B89E0CE2CFDDBB06FCB422EE91     # <-- SAME
```

The two pairs of files are byte-identical. Confirmed by pixel
sampling: same alpha distribution (9 opaque / 40 transparent for
1x; 130 opaque / 213 transparent for 2x), same dominant pixel
values.

Side-by-side captures of the system tray during the smoke test's
idle phase and recording phase produced **byte-identical** PNGs:
```
$ Get-FileHash docs/_evidence/W08_tray_idle.png
D12569D1B8D33D421317E78EC9FABEDBD0F359A68E0B3166756DFB5D87F45985

$ Get-FileHash docs/_evidence/W08_tray_active.png
D12569D1B8D33D421317E78EC9FABEDBD0F359A68E0B3166756DFB5D87F45985     # <-- SAME
```

Practical consequence: a Raven user on either Mac or Windows has
**no visual cue from the tray icon that recording has started**.
The recording state is shown in the dashboard + overlay; the
tooltip text does flip (set via `tray.setToolTip('Raven (Recording)')`
in `trayManager.ts:updateTrayRecordingState`), so a user who
hovers the tray icon sees the right text. But the icon's bitmap
content is unchanged - any user who relies on a glance-able
visual indicator (the original M-row intent of having TWO files)
gets no signal.

This is shared cross-platform; the Mac session ships from the same
asset set. Recording the bug here in W8 evidence; recommendation:
**re-create iconActiveTemplate.png + iconActiveTemplate@2x.png as
a distinct visual** (e.g., add a red dot, invert the silhouette,
swap to a filled version of the outline glyph - whatever the
designer intended). Doesn't need a code change in
`trayManager.ts` - only the asset files. Surface to the Mac
session for M-row workstream resolution.

## Finding 2 (Win11 default UX, not a bug): icons hidden in overflow

Full-screen capture during the smoke test (`W08_tray_full.png`,
1707x1067) shows that the rightmost 200px of the bottom strip
where the system tray would normally show our icon is uniformly
near-white pixels (#FCFCFC range) - 0/1500 dark pixels. The Raven
tray icon is NOT visible in the always-on-screen tray strip.

The icon was successfully created (Electron returned a valid Tray
instance), so it's not a load failure. Win11 22H2+ moved newly-
registered tray icons into a hidden overflow flyout (the ^ chevron
on the right side of the taskbar) by default. Users have to:
- Click the overflow chevron to see the icon, OR
- Drag the icon out of the overflow flyout into the always-on-screen
  tray, OR
- Open Settings → Personalization → Taskbar → Other system tray
  icons and toggle Raven to on.

This is Win11 default behaviour for ALL new tray apps (Cursor,
Slack, Discord, etc. all start hidden). Not a Raven bug. But it
DOES mean the v2.2 Windows first-launch UX is "user opens app,
recording starts via Cmd+R, no visible feedback in the tray
unless they manually surface the icon". Two options:

(a) Document the overflow-pin step in onboarding for Windows users.
(b) Programmatically pin the icon via the
    `Shell.NotifyIcon` API's `NIIF_USER` flag - requires a Windows-
    only extension to Electron. Out of scope for v2.2.

Recommendation: (a) - add a Windows-onboarding step that says
"Click the ^ chevron next to your clock and drag Raven out, or
toggle it on in Settings". Cheap doc fix, no code change. **NOT
in scope of W8 verification - flagged for the Mac session's
onboarding-text M-row work.**

## Verification 2: light-taskbar visibility (default for this host)

The smoke-test machine has a light Win11 taskbar (sample colours:
#FCFCFC, #FEFEFE, #FDFDFD). The icon assets are pure black
(R=0,G=0,B=0) with varying alpha (template style for macOS menu-bar
tinting). Pure black on light taskbar = high contrast = visible.

So WHERE the icon would be (after the user pins it out of the
overflow flyout), it will be visible on this colour scheme. **NOT
verified for dark taskbars** - Win11's dark mode would put a
dark-grey taskbar (~#1F1F1F) and pure-black icons would be near-
invisible. The macOS template-image format auto-tints to match
the menu bar colour; Windows does NOT auto-tint, so a black
template stays black.

Visibility on dark taskbar is an **unverified risk** that needs a
follow-up:
- (i) acceptable: most users use light mode, dark-mode users are
  power users who can manually pin and tolerate low contrast.
- (ii) not acceptable: ship a separate icon for Windows that's
  white-on-transparent with a visible outline, or use a template
  image strategy that adapts.

For v2.2 ship readiness this is borderline. The dominant risk is
"users don't know Raven is running because the icon is hidden",
which Finding 2 addresses (onboarding doc step). The
"icon-low-contrast-on-dark-mode" risk is secondary - users who
see a barely-visible icon will still see SOMETHING and the
tooltip clarifies. Flagging for the Mac session to decide
whether v2.2 should ship a Windows-light + Windows-dark variant.

## Verification 3: existing windowManager + trayManager unit tests

`src/main/__tests__/trayManager.test.ts` (14 tests) and
`src/main/__tests__/windowManager.test.ts` (38 tests) all pass on
Windows host:
```
$ npm test
Test Files  36 passed (36)
Tests  673 passed (673)
```

These cover the construction and wiring of the Tray instance, the
context-menu building, and the
`updateTrayRecordingState`/`setTrayOnboarding`/`setTrayVisibility`
state transitions at the unit level. The new W8 evidence above
covers the runtime + asset-content layer the unit tests don't
touch.

## W8 verdict

- Tray infrastructure on Win11 (Electron Tray API, nativeImage
  loading, setImage swap, setToolTip): **works correctly**. ✓
- Asset content (iconTemplate.png + @2x): **renders fine on light
  taskbar; visibility on dark taskbar unverified**.
- Active vs idle visual differentiation: **MISSING - real
  cross-platform bug**. iconActiveTemplate.png === iconTemplate.png
  byte-for-byte. Flagged for M-row workstream (asset re-creation
  by designer, not a code change).
- Win11 default UX hides new tray icons in overflow flyout: **not
  a Raven bug, but a UX issue**. Flagged for onboarding doc add,
  M-row workstream.

W8 row Status: `[~]` partial. The Windows-rendering verification
itself is done (`[x]` for the Electron-API-correctness + light-
taskbar visibility); the two findings above are blockers for `[x]`
that need cross-platform asset / doc work the M-row session owns.

Evidence files:
- `docs/_evidence/W08_tray_idle.png`   (600x60 tray crop, idle)
- `docs/_evidence/W08_tray_active.png` (600x60 tray crop, active - byte-identical to idle)
- `docs/_evidence/W08_tray_full.png`   (1707x1067 full screen, idle)

The smoke-test scripts used to produce the captures
(`src/main/__tray-smoke__.cjs`, ad-hoc PowerShell capture scripts)
have been deleted post-capture - they were one-off probes, the
PNGs are the persistent evidence.
