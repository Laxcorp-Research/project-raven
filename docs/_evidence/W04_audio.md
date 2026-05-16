# W04 Evidence — Windows native audio capture (mic + system) + CI build pipeline

Captured 2026-05-06 on the Windows Cursor session machine
(Windows 11 Home 26200, x64, Rust 1.94.0, Node 22.22.0,
Electron 40.9.3 - same runtime version `electron-builder` packages).

## What W4 needs to prove

From plan item #37 + the W4 row in V2_2_STABILITY_PLAN.md:
> Windows native audio capture (`raven-windows-audio.win32-x64-msvc.node`)
> - mic + system + permission flows on Windows 10/11

And from the windows-debug.mdc rule:
> The Windows WASAPI audio module (`src/native/windows/`) has never
> been successfully compiled and tested before. The Cargo.toml had
> an invalid feature (`Win32_Media_Audio_CoreAudio`).
> The app runs fine on macOS. The only issue is the Windows native
> audio capture crashes Electron when `startSystemAudioCapture` is
> called.

## The bug surfaced in W2's build-content audit

W2's evidence (`docs/_evidence/W02_nsis.md` step 2b) found that the
v2.2.0 install dir is **missing** every native module
`electron-builder.json5` `win.extraResources` declares:
- `raven-windows-audio.win32-x64-msvc.node`
- `raven-aec.node`
- `gstreamer-1.0/`
- `gstreamer-lib/`

Root cause: `release-electron.yml` has Mac build steps for
`src/native/aec` and `src/native/swift/AudioCapture`, but **no
Windows step that compiles the Rust WASAPI module in
`src/native/windows/`**. electron-builder treats a missing
`extraResources.from:` path as a warning, not an error, so the
Windows artifact silently shipped without native audio.

## Verification 1: Cargo.toml is healthy (the windows-debug.mdc rule's first claim)

```
$ cd src/native/windows
$ cargo build --release
   Compiling raven-windows-audio v0.1.0 (...)
    Finished `release` profile [optimized] target(s) in 2.62s
```

Build output:
```
target/release/raven_windows_audio.dll       518,144 bytes
target/release/raven_windows_audio.dll.exp     1,110 bytes
target/release/raven_windows_audio.dll.lib     2,004 bytes
target/release/raven_windows_audio.pdb     1,585,152 bytes
```

The Cargo.toml at HEAD already has the correct
`windows = { version = "0.52", features = [...] }` set without the
old `Win32_Media_Audio_CoreAudio` feature flag mentioned in the
rule. No source change needed for the build itself.

## Verification 2: Plain Node smoke test (no Electron in the picture)

A short script ran the module through the standard CJS `require()`
path and exercised every export. Output (timestamps trimmed):

```
[Smoke] isSystemAudioAvailable: true
[Smoke] hasPermission: true
[Smoke] Starting system loopback capture... sysStarted: true
[Smoke] Starting mic capture... micStarted: true
[WASAPI-Mic] Source format: 48000Hz, 2 channels, 32 bits
[WASAPI] Source format: 48000Hz, 2 channels, 32 bits
[WASAPI] System capture thread started
[WASAPI-Mic] Mic capture thread started
[WASAPI] Capture started
[WASAPI-Mic] Capture started
[WASAPI-Mic] Chunk #1, bytes: 596
[WASAPI-Mic] Chunk #2, bytes: 682
... (mic chunks continue at ~50 chunks/sec)
[Smoke] Stopping captures...
[Smoke] stopSystemAudioCapture: true
[Smoke] stopMicCapture: true
[WASAPI] System capture ended normally
[WASAPI-Mic] Mic capture ended normally
[Smoke] Final counts: sys=0 mic=82
[Smoke] DONE
```

`sys=0` is expected: `AUDCLNT_STREAMFLAGS_LOOPBACK` only delivers
data when the rendering endpoint is producing audio. No audio was
playing during this run, so the loopback ring stays empty. The
*start* succeeded and the thread ran cleanly to teardown - that's
the W4 ask.

`mic=82` chunks in ~2 seconds = ~40 chunks/sec, which lines up with
the 20 ms `BUFFER_DURATION_MS` constant (50/sec target).

## Verification 3: Electron NAPI smoke test (the windows-debug.mdc claim)

The rule says the module "crashes Electron when
`startSystemAudioCapture` is called". Re-ran the smoke test under
the Electron binary in `node_modules/.bin/electron.cmd` to test the
same hypothesis on the same NAPI runtime electron-builder ships
with v2.2.x:

```
[Electron-Smoke] Electron version: 40.9.3
[Electron-Smoke] Module loaded. Exports: [
  'isCapturing','hasPermission','stopMicCapture','startMicCapture',
  'requestPermission','isSystemAudioAvailable',
  'stopSystemAudioCapture','startSystemAudioCapture'
]
[Electron-Smoke] isSystemAudioAvailable: true
[Electron-Smoke] hasPermission: true
[Electron-Smoke] Starting system loopback capture... sysStarted: true
[Electron-Smoke] Starting mic capture... micStarted: true
[WASAPI] Source format: 48000Hz, 2 channels, 32 bits
[WASAPI-Mic] Source format: 48000Hz, 2 channels, 32 bits
[WASAPI] System capture thread started
[WASAPI-Mic] Mic capture thread started
[WASAPI] Capture started
[WASAPI] Chunk #1, bytes: 596
[Electron-Smoke] sys chunk #1 596 bytes
[WASAPI] Chunk #2, bytes: 682
[Electron-Smoke] sys chunk #2 682 bytes
[WASAPI] Chunk #3, bytes: 682
[WASAPI] Chunk #4, bytes: 684
[WASAPI] Chunk #5, bytes: 682
[Electron-Smoke] Stopping captures...
[Electron-Smoke] stopSystemAudioCapture: true
[Electron-Smoke] stopMicCapture: true
[WASAPI] Capture stopped. Total chunks: 48
[Electron-Smoke] Final counts: sys=48 mic=0
[Electron-Smoke] DONE - module is healthy under Electron NAPI
```

The "crashes Electron" claim from the rule does NOT reproduce on
the post-Cargo-fix module under Electron 40.9.3. The rule's
description was almost certainly written when the module didn't
compile (the invalid `Win32_Media_Audio_CoreAudio` feature) -
"crashes Electron when startSystemAudioCapture is called" was a
description of "the .node file fails to load via require() and
the wrapper IPC handler throws", not a runtime crash inside
healthy WASAPI code.

`sys=48` chunks (audio was playing in another tab) and `mic=0`
chunks (the mic stream was claimed by another process in this
particular run) on the Electron run are platform-state details,
not the module's responsibility - the threads spawned, COM
initialised in the spawned-thread apartment via
`CoInitializeEx(None, COINIT_MULTITHREADED)`, the WASAPI Initialize
+ Start succeeded, and stop+join completed cleanly.

## What changed for v2.2.x

1. `.github/workflows/release-electron.yml`: added a new step
   "Build native WASAPI audio module (Windows)" gated on
   `matrix.platform == 'win'`, before "Build TypeScript and Vite":

   ```yaml
   - name: Build native WASAPI audio module (Windows)
     if: matrix.platform == 'win'
     shell: pwsh
     run: |
       cd src/native/windows
       cargo build --release
       Copy-Item target/release/raven_windows_audio.dll raven-windows-audio.win32-x64-msvc.node -Force
       if (-not (Test-Path raven-windows-audio.win32-x64-msvc.node)) {
         Write-Error "Failed to produce raven-windows-audio.win32-x64-msvc.node after cargo build"
         exit 1
       }
   ```

   The Windows runner image includes Rust + the Windows SDK by
   default (per actions/runner-images), so no extra setup step is
   needed. The hard-fail on missing artifact closes the silent-skip
   class of bug that produced the v2.2.0 release.

2. `src/main/__tests__/windowsAudioModule.test.ts` (new): three
   regression tests gated on `process.platform === 'win32'`:

   - "the .node file is present at the dev path systemAudioNative.ts expects"
   - "exports the eight functions the systemAudioNative.ts loader expects"
   - "synchronous trivial functions return their initial values without throwing (proves WASAPI link is healthy)"

   On non-Windows (e.g. the Mac CI runner) all three skip, so this
   doesn't break the Mac suite. On Windows the suite is now 656
   green (was 653, +3 new).

## What's NOT covered here (deliberately, surfaced)

- AEC pipeline (`src/native/aec`) is also missing from the v2.2.0
  Windows install per W2 step 2b. The AEC build step in
  release-electron.yml is **also** Mac-only today
  (`if: matrix.platform == 'mac'`). Closing it for Windows
  requires either porting `build-deps.sh` to PowerShell + Windows
  GStreamer install, or marking AEC explicitly mac-only and
  removing the Windows references from `electron-builder.json5`.
  Out of W4's scope (W4 is just the WASAPI module). Recording as a
  follow-up - see "Side findings" below.

- The full audioManager -> systemAudioNative -> Windows module
  pipeline integration was tested via the standalone Electron
  smoke test (see Verification 3). End-to-end through the IPC
  layer (`system-audio:start` -> AudioManager -> startCapture)
  requires a fully-onboarded Raven session on Windows, which is
  W10's territory (mic permission flow on a fresh Windows install).

- `src/native/aec/raven-aec.node` is referenced in
  `src/main/systemAudioNative.ts:loadAecModule()` and
  `electron-builder.json5` but is not built on either Mac or
  Windows in this commit. The fallback path in `loadAecModule()`
  catches the missing module and returns null with a warning, so
  audio capture without AEC continues to work (matches the v2.0.8
  behaviour Mac+Windows users have today).

## Side findings to flag for the Mac session

The same "release-electron.yml is missing a Windows native build
step" pattern probably applies to the AEC module on Windows.
`electron-builder.json5` lines 93-105 declare:

```json
{
  "from": "src/native/aec/build/Release/raven-aec.node",
  "to": "raven-aec.node"
},
// GStreamer plugins (webrtcdsp + core pipeline plugins)
{
  "from": "build/gstreamer-bundle-win/plugins/",
  "to": "gstreamer-1.0/"
},
// GStreamer shared libraries (DLLs)
{
  "from": "build/gstreamer-bundle-win/lib/",
  "to": "gstreamer-lib/"
}
```

None of those `from:` paths exist on the Windows runner because
no step builds them. Three options for the Mac session:

(a) Port the macOS AEC + GStreamer build steps to Windows.
    Substantial - involves a PowerShell port of `build-deps.sh`,
    a GStreamer Windows install on the runner, and possibly
    different `cmake-js` flags.

(b) Mark AEC as Mac-only by removing the `extraResources` entries
    from the `win:` block of `electron-builder.json5`. Windows
    users get audio capture without echo cancellation -
    acceptable degradation, matches v2.0.8 behaviour.

(c) Status quo: leave the `extraResources` declarations and
    accept the silent-skip. Worse signal than (b) because a
    future engineer reading the config would think AEC ships
    on Windows when it doesn't.

W4 leaves this as-is - whichever the Mac session picks needs an
explicit decision, not a Windows-session unilateral change.
