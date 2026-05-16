/**
 * Custom Windows signing hook for electron-builder.
 *
 * Routes through signtool.exe + the SSL.com eSigner CKA (Cloud Key
 * Adapter) virtual USB token. CKA must already be installed and
 * configured (Automated mode + Production) so the EV code-signing
 * cert sits in the Windows User certificate store with HasPrivateKey
 * = true (the "private key" is a stub that triggers CKA's KSP, which
 * sends the SHA-256 of the file to SSL.com's CSC API and returns a
 * signature).
 *
 * Why this design rather than CodeSignTool:
 *   The earlier hook spawned SSL.com's CodeSignTool jar for each
 *   binary. That path requires `SSL_COM_USERNAME/PASSWORD/
 *   CREDENTIAL_ID/TOTP_SECRET` env vars + an OAuth password-grant
 *   exchange against `https://login.ssl.com/oauth2/token`. The grant
 *   exchange consistently returned `invalid_grant` for our account
 *   even with confirmed-correct credentials (CodeSignTool's bundled
 *   client_id is the suspect). CKA uses a different client_id and
 *   works against the same account. signtool.exe via CKA's KSP is
 *   the only path verified end-to-end on 2026-05-07; see
 *   docs/_evidence/W01_sslcom_support_ticket.md.
 *
 * Triggered by electron-builder for every PE binary it produces in
 * the Windows build (Raven.exe, the NSIS Uninstall.exe, elevate.exe,
 * agent-windows.exe from @recallai/desktop-sdk, and the Setup
 * wrapper). For each, we shell out to signtool.exe which finds the
 * cert by SHA-1 thumbprint, hands the file's hash to CKA's KSP,
 * receives a signature back from SSL.com's HSM, and embeds it.
 *
 * Env vars expected:
 *   WIN_SIGN_THUMBPRINT        - SHA-1 thumbprint of the EV code
 *                                signing cert in Cert:\CurrentUser\My,
 *                                40 hex chars, no spaces. Required
 *                                for signing; if unset the hook
 *                                returns without doing anything
 *                                (local dev / unsigned-build path).
 *   WIN_SIGN_SIGNTOOL_PATH     - optional. Absolute path to signtool.exe.
 *                                If unset, the hook autodetects the
 *                                newest x64 signtool under
 *                                `C:\Program Files (x86)\Windows
 *                                Kits\10\bin\*\x64\signtool.exe`.
 *   WIN_SIGN_TIMESTAMP_URL     - optional. RFC 3161 TSA URL. Default
 *                                http://ts.ssl.com (SSL.com's
 *                                ECDSA-backed TSA). If you hit "the
 *                                timestamp certificate does not meet
 *                                a minimum public key length
 *                                requirement", set this to
 *                                http://ts.ssl.com/legacy (RSA TSA).
 *
 * Skip behaviour: if WIN_SIGN_THUMBPRINT is unset, the hook returns
 * cleanly without signing rather than failing the build. This lets
 * `npx electron-builder --win` run on a developer's laptop without
 * touching the cloud-signing infra. CI's Build step always sets the
 * thumbprint env var; if it's missing in CI, that's config drift
 * worth surfacing - hence the explicit grep-able [win-sign] log lines.
 *
 * Testability: the actual logic lives in `signWithDeps()` which takes
 * fs.existsSync + child_process.spawnSync + glob + a signtool-finder
 * as injected dependencies. vitest cannot intercept the cjs
 * `require('fs')` at the loader level (it delegates .cjs files to
 * Node's native CJS resolver), so DI is the cleanest way to keep
 * regression tests against the hook's branching logic. See
 * src/main/__tests__/winSign.test.ts.
 */

'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Find the newest x64 signtool.exe shipped with the Windows 10 SDK.
 * Returns null if no SDK is installed at the standard location.
 *
 * The SDK puts each version's binaries under a versioned subdir like
 * `10.0.26100.0\x64\signtool.exe`. We pick the newest by lexicographic
 * sort of the version dirs; that's correct for SDK version strings
 * which are always `10.0.<build>.<rev>` zero-padded.
 *
 * Uses `path.win32.join` (NOT `path.join`) so the returned path always
 * uses backslash separators regardless of the runner OS. In production
 * this only runs on Windows (the win-sign hook is invoked by
 * electron-builder for Windows targets only), but vitest runs on the
 * Linux CI runner for the Electron Tests job and `path.join` would
 * emit forward slashes there - producing strings like
 * `C:\Program Files (x86)\Windows Kits\10\bin/10.0.26100.0/x64/signtool.exe`
 * which signtool would never find. Pinning to win32 keeps the function
 * cross-platform-stable.
 *
 * @param {{ existsSync: (p: string) => boolean, readdirSync: (p: string) => string[] }} deps
 * @returns {string | null}
 */
function autodetectSigntool(deps) {
  const sdkRoot = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  if (!deps.existsSync(sdkRoot)) return null;

  let versions;
  try {
    versions = deps.readdirSync(sdkRoot);
  } catch {
    return null;
  }
  // Filter to actual SDK version dirs (10.0.x.y), sort newest first.
  const versionDirs = versions
    .filter((v) => /^10\.\d+\.\d+\.\d+$/.test(v))
    .sort()
    .reverse();

  for (const v of versionDirs) {
    const candidate = path.win32.join(sdkRoot, v, 'x64', 'signtool.exe');
    if (deps.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * @param {{ path?: string }} configuration - what electron-builder hands us
 * @param {{ existsSync: (p: string) => boolean, readdirSync: (p: string) => string[], spawnSync: typeof childProcess.spawnSync, env: NodeJS.ProcessEnv }} deps
 */
async function signWithDeps(configuration, deps) {
  const { existsSync, spawnSync, env } = deps;

  const filePath = configuration && configuration.path;
  if (!filePath) {
    console.warn('[win-sign] No path in configuration - skipping');
    return;
  }

  const thumbprint = env.WIN_SIGN_THUMBPRINT;

  // Local dev / unsigned-CI bail-out.
  if (!thumbprint) {
    console.warn(
      '[win-sign] WIN_SIGN_THUMBPRINT not set - skipping signing of ' +
        path.basename(filePath) +
        '. Set this env var to the SHA-1 thumbprint of an eSigner-CKA-loaded ' +
        'EV code signing cert in Cert:\\CurrentUser\\My to enable signing.',
    );
    return;
  }

  // signtool only accepts 40-hex-character thumbprints, no spaces or
  // separators. Catch a common copy-paste failure mode early.
  const cleanThumb = thumbprint.replace(/\s+/g, '').toUpperCase();
  if (!/^[0-9A-F]{40}$/.test(cleanThumb)) {
    throw new Error(
      '[win-sign] WIN_SIGN_THUMBPRINT must be 40 hex chars (no spaces). Got: ' +
        JSON.stringify(thumbprint),
    );
  }

  if (!existsSync(filePath)) {
    throw new Error('[win-sign] Input file does not exist: ' + filePath);
  }

  const signtoolPath = env.WIN_SIGN_SIGNTOOL_PATH || autodetectSigntool(deps);
  if (!signtoolPath) {
    throw new Error(
      '[win-sign] Could not find signtool.exe. Install the Windows 10 SDK ' +
        'or set WIN_SIGN_SIGNTOOL_PATH to its absolute path.',
    );
  }
  if (!existsSync(signtoolPath)) {
    throw new Error('[win-sign] signtool.exe not found at ' + signtoolPath);
  }

  const timestampUrl = env.WIN_SIGN_TIMESTAMP_URL || 'http://ts.ssl.com';
  const fileName = path.basename(filePath);

  console.log('[win-sign] Signing ' + fileName + ' via signtool.exe + eSigner CKA...');

  // signtool sign /fd sha256 /tr <ts> /td sha256 /sha1 <thumb> <file>
  //
  // We deliberately do NOT pass /v (verbose) so the output stays
  // grep-able for "Successfully signed" / error patterns. /sha1
  // selects the cert from Cert:\CurrentUser\My by thumbprint - this
  // is the path CKA's KSP intercepts.
  const args = [
    'sign',
    '/fd', 'sha256',
    '/tr', timestampUrl,
    '/td', 'sha256',
    '/sha1', cleanThumb,
    filePath,
  ];

  const result = spawnSync(signtoolPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env,
    shell: false,
    encoding: 'utf-8',
  });

  // Echo signtool output to CI logs so failures are diagnosable.
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    throw new Error(
      '[win-sign] Failed to spawn signtool.exe: ' + result.error.message,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      '[win-sign] signtool.exe exited with code ' + result.status +
        ' for ' + fileName +
        '. CKA may not be running, the cert may not be loaded, or the ' +
        'CSC backend may have rejected the authorize call.',
    );
  }

  console.log('[win-sign] Signed ' + fileName + ' successfully');
}

// What electron-builder loads as the sign hook - thin wrapper that
// binds the production deps.
exports.default = async function sign(configuration) {
  return signWithDeps(configuration, {
    existsSync: fs.existsSync,
    readdirSync: fs.readdirSync,
    spawnSync: childProcess.spawnSync,
    env: process.env,
  });
};

// Exported for the regression tests in src/main/__tests__/winSign.test.ts.
// NOT intended for any production caller.
exports._signWithDeps = signWithDeps;
exports._autodetectSigntool = autodetectSigntool;
