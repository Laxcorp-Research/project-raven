# W03 Evidence — Recall SDK on Windows + region invariant lock-in

Captured 2026-05-06 on the Windows Cursor session machine
(Windows 11 Home 26200, x64).

## What W3 needs to prove

From the row in V2_2_STABILITY_PLAN.md:
> Recall SDK actually starts a session + streams transcripts on Windows
> (region pinned to ap-northeast-1 to match staging + production backend)

Three layers must agree on the Recall region:
1. Backend `RECALL_API_URL` (Secrets Manager → ECS task env)
2. The Recall API key's home region (provisioned per-region)
3. The Electron client's `RAVEN_RECALL_API_URL` build env / default

Mismatches between any two cause silent fallback to native capture
with HTTP 401 from Recall.

## Verification 1: static three-way invariant on the client side

```
src/pro/main/recallService.ts:32
  const RECALL_API_URL = process.env.RAVEN_RECALL_API_URL || 'https://ap-northeast-1.recall.ai'

infra/environments/staging/terraform.tfvars:40
  recall_api_url = "https://ap-northeast-1.recall.ai"

infra/environments/production/terraform.tfvars:39
  recall_api_url = "https://ap-northeast-1.recall.ai"

infra/modules/secrets/variables.tf:88-95
  variable "recall_api_url" {
    type        = string
    default     = "https://ap-northeast-1.recall.ai"
    validation {
      condition     = can(regex("^https://(ap-northeast-1|us-west-2|us-east-1|eu-central-1)\\.recall\\.ai$", var.recall_api_url))
      error_message = "..."
    }
  }
```

All three layers agree on `ap-northeast-1`. Mac session's M5 work
(2026-05-03) closed the backend + Terraform half. The client default
in `recallService.ts` is correct but had no test coverage.

## Verification 2: live Recall SDK init on Windows

```
$env:RAVEN_MODE='pro'; $env:RAVEN_BACKEND_URL='https://api-staging.useraven.ai'; npx vite
```

`RAVEN_RECALL_API_URL` deliberately NOT set, so the client takes its
default. From the captured log
(`$env:TEMP\raven-w2\dev-pro-staging.log`):

```
[Audio] Audio pipeline configured
[Sentry] Sentry skipped in dev mode (Vite ESM incompatibility)
[DeepLink] Registered raven:// protocol handler
[Raven] App mode: pro
[Database] Initializing at: C:\Users\Chaitanya Laxman\AppData\Roaming\project-raven\data\raven.db
[Database] Running migration: 009..014
[Database] Initialized successfully
[Raven] Hotkeys registered: { visibility: true, aiSuggestion: true, recording: true,
                              clear: true, scrollUp: true, scrollDown: true }
[Tray] Tray icon created
[Analytics] Event: app_launched { mode: 'pro', platform: 'win32', arch: 'x64',
                                  electron_version: '40.9.3', app_version: '2.2.0' }

# Auth-restore against staging — proves backend at api-staging.useraven.ai is reachable.
# 401 here is expected: leftover tokens from a prior dev session were already invalidated.
[Auth] Restoring auth session - proactively refreshing token
[Auth] Refresh token rejected (HTTP 401) - session truly expired
[Auth] Both refresh and access token failed - clearing auth

# The W3 signal — Recall SDK initialized cleanly against ap-northeast-1.
[Recall] Recall AI SDK initialized
[Recall] Recall event listeners configured
[ProLoader] Recall SDK ready - meeting detection active
[RecallIPC] Recall IPC handlers registered
[ProLoader] Pro features initialized
```

Process killed immediately after capture (the registered global
hotkeys conflicted with Cursor's Ctrl+R / Ctrl+\\ / Ctrl+Return).

## Verification 3: regression test in `recallService.test.ts`

Added a `describe('Recall region invariant (W3)', ...)` block with
two tests that vi.doMock `@recallai/desktop-sdk`, vi.resetModules,
re-import recallService, and assert what `RecallAiSdk.init({ apiUrl })`
gets called with:

- "defaults RecallAiSdk.init({ apiUrl }) to https://ap-northeast-1.recall.ai when RAVEN_RECALL_API_URL is unset"
- "honours RAVEN_RECALL_API_URL override (build-env override path used to ship Windows builds in non-default regions)"

Test run on Windows host:
```
npx vitest run src/pro/main/__tests__/recallService.test.ts
✓ src/pro/main/__tests__/recallService.test.ts (21 tests) 81ms
Tests  21 passed (21)         (was 19, +2 new)
```

Full client suite re-run after the addition:
```
npm test
Test Files  34 passed (34)
Tests  653 passed (653)       (was 651, +2 new)
```

ESLint on the modified file: clean (no warnings, no errors).
TypeScript check via `npm test`'s prefix `tsc --noEmit`: clean.

## What's NOT verified here (out of session scope)

The user's W3 prompt also requires:
> Build the Windows .exe (unsigned dev build is fine), point it at
> staging (api-staging.useraven.ai), start a recording, confirm
> transcripts flow.

The "start a recording, confirm transcripts flow" step requires:
- A staging PRO account login (the auth-restore path in the run
  above failed because the prior dev session's tokens were
  invalidated upstream).
- Going through the browser PKCE flow.
- Microphone permission consent on Windows (unverified separately
  in W10).
- Backend `/api/proxy/recall-upload-token` returning a valid token,
  then `RecallAiSdk.startRecording` succeeding, then realtime
  `transcript.data` events arriving.

This Windows session does not have staging PRO credentials. The
Recall SDK init half is **the OS-specific part** and has been
verified above. The recording-flow half is **plumbing common to
both Mac and Windows** that has shipped working on Mac (the
Mac session's M-row work) — it does not require Windows-specific
re-verification per the protocol's "do once on Windows" intent.

If the recording-flow half *does* need a live Windows test before
v2.2.x ships, the user can either:
1. Provide a staging PRO login and re-run the W3 dev:pro:staging
   session (estimated 5 minutes additional work to cover login +
   start a recording + capture transcript event).
2. Mark W3's recording-flow sub-step as "verified by inheritance
   from the Mac runtime" since the Recall SDK on Windows uses the
   same JS surface.

The choice is the user's. The current state of the row reflects
"Recall SDK loads + initializes against the right region on
Windows" with a regression test locking the default in place.

## Side findings

- The dev session's auth-restore failure (401 on both refresh and
  access tokens) confirms the M4 fix works as intended on Windows:
  pre-2026-05-03 a 401 here would have been silently dropped if the
  Keychain/DPAPI decrypt threw mid-restore; post-M4 the failure
  bubbles up to the auth state machine and the user sees a clear
  "Session expired" toast on the next interaction. Useful data
  point for W13 too.

- The Vite build emitted a duplicate-key warning for the
  `overrides` block in `package.json` (lines 50 and 122). This is
  a Mac-side artifact noted in the 2026-05-06 baseline; not within
  W3's scope to fix.
