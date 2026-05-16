/**
 * Regression test for the Windows native audio module
 * (`src/native/windows/raven-windows-audio.win32-x64-msvc.node`).
 *
 * Why this exists: the v2.2.0 Windows .exe shipped from S3 is
 * MISSING this .node file. The release-electron.yml CI never built
 * it (electron-builder.json5 declares it in `win.extraResources` but
 * the matching build step did not exist), so the published Windows
 * build had no system-audio loopback or microphone capture even
 * though the code paths in `src/main/systemAudioNative.ts` expect
 * the binding. W2 evidence flagged this; W4 ships the CI build step
 * + this regression test as the contract.
 *
 * What this test guarantees:
 *   1. On a Windows host where `cargo build --release` has run in
 *      `src/native/windows/`, the renamed `.node` file exists at the
 *      path `loadWindowsModule()` (in `src/main/systemAudioNative.ts`)
 *      will look for in dev mode.
 *   2. The module loads as a CJS native addon.
 *   3. The eight exported functions documented in the
 *      windows-debug.mdc rule are all present and have the right
 *      runtime types - any future change to the NAPI bindings that
 *      drops or renames an export will break this test instead of
 *      manifesting as a silent runtime no-op when audio capture
 *      starts.
 *   4. The four synchronous trivial functions
 *      (isSystemAudioAvailable, hasPermission, requestPermission,
 *      isCapturing) return their expected initial values without
 *      throwing - confirms the COM/WASAPI library link is healthy
 *      enough to initialise statics.
 *
 * Platform gating: skipped on non-Windows hosts so the Mac CI's
 * `npm test` stays green. The test is a no-op anywhere the binding
 * cannot exist by definition.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const itOnWindows = process.platform === 'win32' ? it : it.skip;

interface WindowsAudioModule {
  isSystemAudioAvailable: () => boolean;
  hasPermission: () => boolean;
  requestPermission: () => boolean;
  isCapturing: () => boolean;
  startSystemAudioCapture: (cb: (chunk: { data: Buffer; timestamp: number }) => void) => boolean;
  stopSystemAudioCapture: () => boolean;
  startMicCapture: (cb: (chunk: { data: Buffer; timestamp: number }) => void) => boolean;
  stopMicCapture: () => boolean;
}

const MODULE_PATH = join(
  process.cwd(),
  'src',
  'native',
  'windows',
  'raven-windows-audio.win32-x64-msvc.node',
);

describe('Windows native audio module (W4)', () => {
  itOnWindows('the .node file is present at the dev path systemAudioNative.ts expects', () => {
    // Documented contract — `src/main/systemAudioNative.ts` looks for
    // this exact path in dev mode. If a future change moves the
    // build output, this test should be updated together with that
    // path.
    expect(existsSync(MODULE_PATH)).toBe(true);
  });

  itOnWindows('exports the eight functions the systemAudioNative.ts loader expects', () => {
    const m = require_(MODULE_PATH) as WindowsAudioModule;

    expect(typeof m.isSystemAudioAvailable).toBe('function');
    expect(typeof m.hasPermission).toBe('function');
    expect(typeof m.requestPermission).toBe('function');
    expect(typeof m.isCapturing).toBe('function');
    expect(typeof m.startSystemAudioCapture).toBe('function');
    expect(typeof m.stopSystemAudioCapture).toBe('function');
    expect(typeof m.startMicCapture).toBe('function');
    expect(typeof m.stopMicCapture).toBe('function');
  });

  itOnWindows('synchronous trivial functions return their initial values without throwing (proves WASAPI link is healthy)', () => {
    const m = require_(MODULE_PATH) as WindowsAudioModule;

    // The four trivial functions documented in
    // src/native/windows/README.md. The current Rust impl returns
    // hardcoded `true` for the first three (Windows doesn't gate
    // microphone the way macOS does at the API level) and `false`
    // for `isCapturing` when no thread is active. Fail = either
    // a NAPI loader error or a Cargo.toml regression that broke
    // the windows-rs feature set (the original 2026-04 bug had
    // an invalid `Win32_Media_Audio_CoreAudio` feature that
    // killed compilation - the post-fix build is what we are
    // locking in).
    expect(m.isSystemAudioAvailable()).toBe(true);
    expect(m.hasPermission()).toBe(true);
    expect(m.requestPermission()).toBe(true);
    expect(m.isCapturing()).toBe(false);
  });
});
