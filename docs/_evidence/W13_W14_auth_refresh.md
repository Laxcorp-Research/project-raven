# W13 + W14 Evidence — Auth refresh root-cause + defensive guards on Windows

Captured 2026-05-06 on the Windows Cursor session machine
(Win11 26200, x64). Both rows close together because they're the
two halves of plan item #2 ("Auth refresh recurring failure - full
root-cause fix").

## What W13 + W14 need to prove

Plan item #2 says:
> Auth refresh recurring failure - full root-cause fix (not just
> defensive guards). safeStorage behaves differently on macOS
> (Keychain) vs Windows (DPAPI). A fix that works on one may not
> surface the other's failure mode. Must test on both. Defensive
> guards shipped separately in #3 / 4c2aba6; root cause still open.

Two halves:

- **W13 / Mac side root-cause fix = M4** (shipped 2026-05-03):
  the `loadStoredTokens` decrypt-failure-clears-blob bug + the
  `storeTokensSecurely` encrypt-failure-silently-drops-save bug.
  The user prompt's W13 wording asks to "cross-reference Mac
  findings from M4" on Windows. Verified by **W5 evidence**
  (`docs/_evidence/W05_dpapi.md`) - the M4 fix is platform-
  agnostic by design and runs identically on Win11 + DPAPI;
  W5 added 9 platform-tag invariant tests on top.

- **W14 / Defensive guards retest** (shipped 2026-04-26 in
  `4c2aba6` as item #3): the 3-attempt + exponential-backoff retry
  in `doRefresh()`. Retries through transient backend 5xx, network
  drops mid-refresh, and short-circuits on 401/403 (refresh token
  actually rejected by server). The user prompt's W14 says:
  > Re-test the scenarios on Windows: backend 502 mid-refresh,
  > network drop mid-refresh, refresh actually rejected
  > (401/403 from /refresh).

## Coverage gap that W14 closed

The retry logic in `doRefresh()` had ZERO direct unit-test
coverage prior to this commit, despite being the layer that
turns "one transient backend hiccup = silent logout for every
user" into "three transient hiccups in a row = a visible
'Backend unreachable' toast, no logout". A future refactor that
dropped the retry loop would have re-opened the v2.0.8 silent-
logout class without failing any existing test.

## What W14 added: 7 retry tests in `authService.test.ts`

Under `describe('W14: refresh retry on transient failure', ...)`:

1. **succeeds on the first attempt with 200 OK (no retry)** -
   the happy path; locks no-extra-fetch-when-not-needed.
2. **retries through a 502 and succeeds on the second attempt** -
   the canonical "ECS task cold-start at boot" scenario from the
   item #2 root-cause discussion. Uses `vi.advanceTimersByTimeAsync(500)`
   to skip the 500ms backoff between attempts.
3. **retries through a network-drop (fetch reject) + 502 + 200
   (mixed transient failures, succeeds on attempt 3)** - the
   real-world worst case the v2.0.8 retry was designed for.
   Exercises both the `try` (HTTP error) and `catch` (network
   reject) paths in the loop. Skips both 500ms and 1000ms
   backoffs.
4. **short-circuits on 401 with NO retry (refresh token actually
   rejected by the server)** - critical guard against retry-on-
   permanently-revoked-token. Verifies `fetchMock.callCount === 1`
   AND that the Sentry `refresh_rejected` capture fires with
   `auth.status: '401'`.
5. **short-circuits on 403 with NO retry (token known but blocked
   - e.g., user account suspended server-side)** - same as #4
   with `auth.status: '403'`.
6. **gives up after 3 attempts of persistent 502s** - returns
   `false` and fires the `Auth refresh exhausted all retries
   without definitive outcome` Sentry message tagged
   `auth.failure_mode: 'refresh_service_unavailable'` +
   `auth.attempts: '3'`. Critical: does NOT clear auth (tokens may
   still be valid; the BACKEND is sad, not the user).
7. **gives up after 3 attempts of network-rejects (no auth_failed
   misfire on pure-network outage - tokens preserved)** - same
   shape as #6 via `fetch.mockRejectedValue` instead of HTTP error
   responses. Locks the invariant that fetch-reject failures stay
   in the `service_unavailable` bucket; a regression that flipped
   them to `auth_failed` would clear tokens on every network blip.

## Test results

```
$ npx vitest run src/pro/main/__tests__/authService.test.ts
 ✓ src/pro/main/__tests__/authService.test.ts (22 tests) 66ms
 Tests  22 passed (22)            (was 15, +7 W14)

$ npm test
 Test Files  36 passed (36)
 Tests  689 passed (689)          (was 682, +7 W14)
```

ESLint clean on the modified file. Typecheck via npm test's `tsc --noEmit` prefix: clean.

## Pre-existing detail observed (NOT a bug, NOT in W14 scope)

`doRefresh()` ends with:
```typescript
return lastWasAuthFailure ? 'auth_failed' : 'service_unavailable'
```

But `lastWasAuthFailure` is only ever set to `false` (initialised
false, both fall-through paths set it to false explicitly), so
the ternary always evaluates to `'service_unavailable'` in the
post-3-attempts code path. The `'auth_failed'` branch can only
fire from the immediate 401/403 short-circuit earlier in the
loop. Either dead code or leftover from a planned 401-after-N-
retries case that never landed. Not material - the observable
behaviour is correct (`service_unavailable` is the right outcome
for pure transient failures, and 401/403 returns `auth_failed`
immediately as it should).

Flagging for the Mac session in case they want to clean up the
dead branch + simplify the final return to just
`return 'service_unavailable'`. Out of W14 scope (touches
authService.ts source which the M-row workstream has been
owning).

## Live test of the actual /api/auth/refresh path on Windows NOT executed

A truly end-to-end test would:
- Run `npm run dev:pro:staging` on Windows.
- Force the staging backend into a 502 state (or kill the network
  mid-refresh).
- Observe the Raven Sentry breadcrumb sequence + the toast UI.

The W3 dev:pro:staging session DID exercise this implicitly: it
attempted to restore auth from a stale dev-session token and the
staging backend returned 401 ("Refresh token rejected"). The
captured log
(`%TEMP%\raven-w2\dev-pro-staging.log`) shows:
```
[Auth] Restoring auth session - proactively refreshing token
[Auth] Refresh token rejected (HTTP 401) - session truly expired
[Auth] Both refresh and access token failed - clearing auth
```

That's W14's "401 short-circuits with no retry" path firing live
on Windows + Electron 40.9.3. Combined with the 7 new unit tests
above, the contract is locked for both happy paths, transient-
retry paths, and hard-rejection paths.

## W13 verdict

`[x]` verified by inheritance from W5 + W14. The Mac findings from
M4 (loadStoredTokens preserve, storeTokensSecurely fallback) apply
identically on Windows DPAPI - the M4 code is platform-agnostic
and the Mac tests run identically on this Windows host (suite
658 -> 658 baseline before W5 added Windows-specific tags).

## W14 verdict

`[x]` verified. 7 new regression tests close the doRefresh retry
unit-test gap. The retry loop:
- Retries on 5xx HTTP responses
- Retries on fetch-reject (network errors)
- Backoff: 500ms after attempt #1, 1000ms after attempt #2 (no
  wait after #3)
- Short-circuits with no retry on 401 / 403 (refresh token
  rejected by server)
- After exhausting 3 attempts of pure-transient failures, returns
  `service_unavailable` without clearing auth (tokens may still be
  valid; backend is what's sad)

Suite total: 682 -> 689 green; lint clean; typecheck clean. No
source changes - tests-only commit on a previously-untested
critical path.
