# Raven Launch Checklist

Items separated by what's needed for the **open-source launch** (users clone + `npm run dev`) vs the **premium packaged app** (DMG/EXE distribution). Common items apply to both.

---

## Open-Source Launch (Priority)

These are blocking items before the open-source repo goes public.

### Runtime Verification (must test manually)

| # | Item | What to test | How | Status |
|---|------|-------------|-----|--------|
| O-1 | **Heap stability over 30-min session** | Memory grows linearly = leak. Should plateau. | Start `npm run dev`, open Activity Monitor or `chrome://inspect` heap snapshots at 5/15/30 min during a live call. Compare retained heap size. | ❌ Not tested |
| O-2 | **CPU/RAM alongside Zoom/Teams/Meet** | Raven + meeting app together shouldn't exceed ~30% sustained CPU on modern hardware. Meeting audio quality must not degrade. | Run Raven recording alongside a real Zoom/Teams call for 10+ min. Watch Activity Monitor. | ❌ Not tested |
| O-3 | **Device hot-swap mid-session** | Unplug headphones, switch Bluetooth — does transcript keep flowing? | Start recording with headphones → unplug → check if audio recovers. Try AirPods connect/disconnect. | ❌ Not tested |
| O-4 | **macOS fresh clone → working app** | A new contributor can get the app running from scratch. | Clone on a clean Mac, follow README exactly. Every step must work without undocumented fixes. | ❌ Not tested |
| O-5 | **Windows dev build** | `npm run dev` works on Windows with WASAPI capture. | Clone on Windows 10/11, install prerequisites, run through README steps. | ❌ Not tested |
| O-6 | **GStreamer AEC builds from source (macOS)** | `build-deps.sh` + `cmake-js compile` succeeds on a machine that only has Homebrew GStreamer. | Fresh terminal, follow README "Build the GStreamer AEC addon" section. | ❌ Not tested |
| O-7 | **Swift AudioCapture builds (macOS)** | `swift build -c release` produces a working binary. | Follow README, verify `audiocapture` binary exists at expected path. | ❌ Not tested |
| O-8 | **Long session transcript accuracy** | After 30+ min, transcript still arrives and speaker labels are correct (no drift causing mic/system swap). | Record a 30-min call with back-and-forth conversation. Check transcript at end. | ❌ Not tested |
| O-9 | **AEC bypass/recovery** | When drift exceeds 200ms, AEC bypasses gracefully. When drift drops below 100ms, it re-enables. | Simulate by playing system audio that causes drift (e.g., start/stop system sounds). Watch `[SystemAudio] AEC health:` logs. | ❌ Not tested |

### Code & Documentation

| # | Item | Details | Status |
|---|------|---------|--------|
| O-10 | **README prerequisites accuracy** | README now says "Node.js 22+" matching `package.json` `>=22.12.0`. | ✅ Fixed |
| O-11 | **GStreamer Windows setup instructions** | README now includes GStreamer MSI install, `GSTREAMER_1_0_ROOT_MSVC_X86_64` env var, and verification command. | ✅ Fixed |
| O-12 | **API key onboarding clarity** | First-time user needs Deepgram + Claude/OpenAI keys. Onboarding flow prompts for these — verify it handles missing keys gracefully (e.g., no Deepgram key = no transcription, app still runs). | ❌ Not verified |
| O-13 | **Screen recording permission (macOS)** | `permissions.ts` now checks `getMediaAccessStatus('screen')` before recording starts. Returns actionable error message if denied. | ✅ Fixed |
| O-14 | **Microphone permission (macOS)** | `permissions.ts` calls `askForMediaAccess('microphone')` before recording starts. Prompts the OS dialog automatically. | ✅ Fixed |
| O-15 | **`.env` / API key security** | Audited: keys encrypted at rest (electron-store), never logged, passed in HTTP headers not URLs. `getAllSettings` exposed to renderer by design (settings page). Clean. | ✅ Verified |
| O-16 | **License file** | MIT License file exists. Copyright 2026 Laxcorp Research. | ✅ Verified |
| O-17 | **Tray icon template images** | 16x16 + 32x32 (@2x) PNG template images generated from the actual Raven logo (`raven_black_small.png`). macOS auto-inverts for dark menu bars via `Template` suffix. | ✅ Fixed |
| O-18 | **`npm install` clean on fresh clone** | `postinstall` runs `@electron/rebuild` for `better-sqlite3`. Verify this works without manual intervention. | ❌ Not tested |

---

## Premium / Packaged App (DMG/EXE)

### Authentication & Onboarding

| # | Item | Details | Status |
|---|------|---------|--------|
| P-20 | **Google OAuth login** | Browser-based PKCE flow → Google consent → `raven://` deep link redirect → token exchange → user created in DB. | ✅ Implemented |
| P-21 | **Email/password auth** | Web-based signup/login pages served by backend. Passwords hashed with bcrypt. | ✅ Implemented |
| P-22 | **OAuth redirect page** | Cluely-style "Opening Raven" page with user info, sign out option, auto-tab-close. | ✅ Implemented |
| P-23 | **Deep linking (`raven://`)** | Custom protocol registered in Electron. Handles auth callback codes. | ✅ Implemented |
| P-24 | **Token storage security** | Auth tokens encrypted with `safeStorage` API. Profile data in encrypted electron-store. Passwords never stored client-side. | ✅ Verified |
| P-25 | **Multi-step onboarding** | Welcome → Browser auth → Permissions (mic + screen) → Overlay tour → Keyboard shortcuts → Done. | ✅ Implemented |
| P-26 | **Permissions screen** | Shows real macOS permission status. Granted state shown but user must click Next manually. No auto-advance. No back button (user is already authenticated). | ✅ Implemented |
| P-27 | **Overlay tour** | 10-step interactive tour showing all button states (start/stop session, detectable/undetectable, fast/deep, incognito on/off). Button visuals match actual overlay. No step numbering. | ✅ Implemented |
| P-28 | **Keyboard shortcuts step** | Shows all hotkeys with actual key glyphs (`⌘`, `\`, etc.). | ✅ Implemented |
| P-29 | **Onboarding settings gear** | Settings icon with "Quit Raven" dropdown, aligned with step indicator. | ✅ Implemented |
| P-30 | **Overlay suppressed during onboarding** | Overlay window and global hotkeys disabled until onboarding completes. | ✅ Implemented |
| P-31 | **Tray simplified during onboarding** | Only "Quit Raven" shown in tray menu during onboarding. Full menu after completion. | ✅ Implemented |
| P-32 | **Auth cancellation** | "Go back" button on waiting screen cancels browser auth cleanly. No timeout race conditions. | ✅ Fixed |
| P-33 | **Browser tab auto-close** | Auth browser tab attempts to close after redirect. Shows "Opening Raven" page if it can't. | ✅ Implemented |

### Dashboard & Settings (Premium)

| # | Item | Details | Status |
|---|------|---------|--------|
| P-34 | **Dashboard header auth** | Shows Google account avatar, name, email. Falls back to local profile for free users. | ✅ Implemented |
| P-35 | **User menu dropdown** | Displays user name/email, "Sign out" (pro only), "Quit Raven". | ✅ Implemented |
| P-36 | **Profile picture crop editor** | Image crop/edit modal with zoom slider, drag-to-pan, dashed crop boundary, Reset/Cancel/Apply. Minimum zoom fills crop area. Output saved as 512x512 PNG. | ✅ Implemented |
| P-37 | **Profile picture management** | Upload/change/remove buttons. Google avatar shown by default for authenticated users. Custom upload overrides Google avatar. | ✅ Implemented |
| P-38 | **Display name editable** | Pre-filled with Google name for authenticated users. Editable and saved locally. | ✅ Implemented |
| P-39 | **Account email display** | Read-only email field for authenticated users. | ✅ Implemented |
| P-40 | **Password & Security section** | "Update" button opens modal to send password reset link to user's email. | ✅ Implemented |
| P-41 | **Delete Account section** | "Delete my account" button with confirmation modal. Prompts to cancel subscription first. | ✅ Implemented |
| P-42 | **CSP for Google avatars** | `img-src` includes `https://*.googleusercontent.com`. | ✅ Fixed |
| P-43 | **Audio settings label fix** | Default microphone no longer shows "Default - Default - ..." duplication. | ✅ Fixed |

### Packaging & Distribution

| # | Item | Details | Status |
|---|------|---------|--------|
| P-1 | **electron-builder config** | `npm run build` runs `electron-builder`. Need to verify the builder config includes all native addons, resources, and platform-specific settings. | ❌ Not configured |
| P-2 | **GStreamer native module bundling** | `raven-aec.node` + all `.dylib`/`.dll` dependencies must be copied into `resources/`. | ❌ Not configured |
| P-3 | **Swift binary bundling (macOS)** | The `audiocapture` binary must be included in the `.app` bundle. | ❌ Not configured |
| P-4 | **Windows WASAPI module bundling** | The Rust NAPI module (`.node` file) must be included in the packaged app. | ❌ Not configured |
| P-5 | **better-sqlite3 bundling** | Native module must be rebuilt for the packaged Electron ABI. | ❌ Not configured |
| P-6 | **macOS code signing & notarization** | Required for Gatekeeper. Needs Apple Developer account + `electron-builder` signing config. | ❌ Not set up |
| P-7 | **Windows code signing** | EV certificate for SmartScreen trust. | ❌ Not set up |
| P-8 | **Auto-updater feed** | `electron-updater` is integrated but needs a GitHub Releases feed or S3 bucket. | ❌ No feed configured |
| P-9 | **Tray icon proper template images** | Using actual Raven logo resized to 16x16 + @2x. | ✅ Done |
| P-10 | **DMG installer design** | Background image, icon positions, drag-to-Applications layout. | ❌ Not designed |
| P-11 | **Windows installer (NSIS/MSI)** | Proper install/uninstall, Start Menu shortcuts. | ❌ Not configured |
| P-12 | **Crash reporting** | Sentry or similar. | ❌ Not integrated |
| P-13 | **Analytics / telemetry** | `analytics.ts` is a stub. Needs real Mixpanel/PostHog integration with opt-in consent. | ❌ Stub only |

### Pro Features (Backend Required)

| # | Item | Details | Status |
|---|------|---------|--------|
| P-14 | **Authentication backend** | Fastify + Prisma backend with email/password auth, Google OAuth, PKCE token exchange. | ✅ Implemented |
| P-15 | **License/subscription enforcement** | Pro features gated by `proLoader`. Actual license validation against backend not fully wired. | ⚠️ Partially implemented |
| P-16 | **Cloud sync** | End-to-end wired: push on session end, pull on app launch, batch upload (20/batch), periodic sync (15 min), offline queue, delete sync, progress banner UI, sync log (last 50 events), failure notification after 3 consecutive failures. Authorization-safe upserts with ownership checks. | ✅ Implemented |
| P-17 | **Billing integration** | Stripe webhook stubs in backend. Billing tab not yet in settings sidebar. | ⚠️ Backend stubs only |
| P-18 | **General settings tab** | Launch on login, theme selection, version check. Not yet implemented. | ❌ Not implemented |
| P-19 | **Sidebar support section** | Tutorial, Changelog, Help Center, Report a Bug links in settings sidebar. | ❌ Not implemented |

### CI/CD and Server-Side Prompts

| # | Item | Details | Status |
|---|------|---------|--------|
| P-44 | **Backend deploy CI/CD** | `deploy-backend.yml` — triggers on push to `premium`, builds ARM64 Docker image via buildx, pushes to ECR, deploys to ECS, runs Prisma migrations, smoke-tests `/health`. | ✅ Implemented |
| P-45 | **Electron release CI/CD** | `release-electron.yml` — triggers on `v*` tags, builds TypeScript+Vite then electron-builder, uploads to S3, creates GitHub Release. Artifact paths fixed for `release/${version}/` output. | ✅ Implemented |
| P-46 | **GitHub secrets documented** | `.github/SECRETS.md` — all required secrets, variables, environments, and IAM policy documented. | ✅ Documented |
| P-47 | **Server-side prompts schema** | `Prompt` model added to Prisma schema with `@@unique([type, key])`. Migration `0002_add_prompts_table` created. | ✅ Implemented |
| P-48 | **Server-side prompts API** | `GET /api/prompts/system` returns system prompt + 6 action prompts. `GET /api/prompts/mode/:id` returns mode-specific prompt. Both require Bearer auth. | ✅ Implemented |
| P-49 | **Prompts seed script** | `backend/src/seed.ts` (compiled, runs via ECS) and `backend/prisma/seed.ts` (local dev). Idempotent via upsert. | ✅ Implemented |
| P-50 | **Staging deployed & verified** | Backend live at `https://api-staging.raven.ciaraai.com`. Prompts API verified: 3822-char system prompt + 6 action prompts, HTTP 200. | ✅ Deployed |
| P-51 | **Cloud sync security hardening** | Authorization bypass fixed (ownership check on all upserts). Input validation schemas on all session routes. Batch cap (20 client / 50 server). Body limit 10MB. Gzip compression. `[userId, syncedAt]` index added. | ✅ Implemented |
| P-52 | **Auth token validation on startup** | `initAuth()` now validates tokens on launch: tries access token → refresh token → clears auth if both fail. No more stuck half-authenticated state. | ✅ Fixed |
| P-53 | **Overlay/tray onboarding fix** | Free mode: overlay + full tray suppressed until both `onboardingComplete` AND `hasApiKeys()`. Prevents overlay showing during onboarding if config was partially reset. | ✅ Fixed |
| P-54 | **Session route tests** | 16 tests: authorization bypass prevention (6), input validation (8), auth enforcement (2). Plus 13 prompts tests. 29 backend tests total. | ✅ Implemented |
| P-55 | **`dev:pro:staging` script** | `npm run dev:pro:staging` connects to AWS staging backend directly. | ✅ Added |

---

## Common (Both Versions)

These affect both open-source and premium and should be solid before either ships.

### Core Stability

| # | Item | Details | Status |
|---|------|---------|--------|
| C-1 | **Transcript merging correctness** | Same-speaker utterances within 5s are merged. Verify no text duplication or loss at merge boundaries. | ⚠️ Tested briefly, needs longer session |
| C-2 | **Deepgram WebSocket reconnection** | Already implemented: `attemptReconnect()` with 3 retries, exponential backoff (1s, 2s, 3s). | ✅ Implemented |
| C-3 | **AI streaming error recovery** | If Claude/OpenAI API returns 429 or 500 mid-stream, does the UI show a useful error? | ⚠️ Error shown, no auto-retry |
| C-4 | **Session persistence integrity** | Start recording, talk for 5 min, stop, quit app, reopen — verify session appears with full transcript. | ❌ Not formally tested |
| C-5 | **Overlay click-through** | With `setIgnoreMouseEvents(true)`, the overlay must not intercept clicks meant for the app underneath. | ⚠️ Works in dev, needs more testing |
| C-6 | **Overlay invisible to screen share** | `setContentProtection(true)` correctly applied. Config: `type: 'panel'` + `screen-saver` z-level. | ✅ Fixed (needs per-app verification) |
| C-7 | **Multiple monitor support** | Overlay should follow the correct screen if user has multiple displays. | ❌ Not tested |
| C-8 | **Dark mode consistency** | `nativeTheme` detection is integrated. Verify dashboard switches themes correctly. | ❌ Not tested |
| C-9 | **RAG document upload** | Upload a PDF/text file, ask AI a question referencing it. | ❌ Not formally tested |
| C-10 | **Keyboard shortcuts on all platforms** | All shortcuts must work. On Windows, `Ctrl` equivalents. | ❌ Windows not tested |
| C-11 | **Graceful shutdown** | `audioManager.shutdown()` called in `before-quit` handler. Kills `audiocapture`, closes Deepgram WebSockets, saves session. | ✅ Fixed (needs runtime verification) |

### LLM / Prompt Quality

| # | Item | Details | Status |
|---|------|---------|--------|
| C-12 | **Priority system works correctly** | User types a question while recording → AI answers the question (not the transcript). | ⚠️ Designed, needs live test |
| C-13 | **Screenshot interpretation accuracy** | `Cmd+Enter` with no session → AI focuses on screen content. With session → AI uses both. | ⚠️ Designed, needs live test |
| C-14 | **Math/aptitude rendering** | KaTeX rendering for math problems. | ❌ Not tested |
| C-15 | **Action prompts: "What should I say?"** | Uses full transcript context, references the last thing the other person said. | ⚠️ Designed, needs live test |
| C-16 | **Mode prompts** | Switch to Interview mode → AI uses STAR structure. Verify mode-specific behavior. | ❌ Not live tested |

---

## Priority Order for Open-Source Launch

**Fixed (code changes applied):**
1. ~~O-10~~ ✅ README Node version corrected to 22+
2. ~~O-11~~ ✅ Windows GStreamer instructions added
3. ~~O-13/O-14~~ ✅ macOS permission checks added (mic prompt + screen recording error)
4. ~~O-15~~ ✅ API key security audited — clean
5. ~~O-17~~ ✅ Tray icons using actual Raven logo (16x16 + @2x)
6. ~~C-2~~ ✅ Deepgram reconnection already implemented
7. ~~C-6~~ ✅ Screen-share invisibility bug fixed
8. ~~C-11~~ ✅ Graceful shutdown added
9. ✅ AI models updated — defaults are fast models (Claude Haiku 4.5, GPT-5 Mini)
10. ✅ Overlay spawns centered on screen
11. ✅ Fast/Deep model toggle implemented (pro-only, hidden in open-source)
12. ✅ Open-core repo structure set up (public + private repos, feature gating)
13. ✅ Backend integrated into monorepo on `premium` branch
14. ✅ Custom AI model dropdown in settings
15. ✅ Incognito icon replaced with custom hat-and-glasses SVG

**Premium features implemented (this session):**
16. ✅ Google OAuth with PKCE flow and deep linking
17. ✅ Multi-step onboarding (welcome → auth → permissions → tour → shortcuts → done)
18. ✅ Overlay tour with 10 interactive steps matching actual button states
19. ✅ Profile picture crop/edit modal (zoom, pan, apply)
20. ✅ Dashboard header with authenticated user data and sign out
21. ✅ Settings profile: password reset, delete account, unified free/pro UI
22. ✅ Onboarding-aware tray menu and hotkey suppression
23. ✅ Backend: OAuth routes, web auth pages, redirect pages
24. ✅ CSP updated for Google avatar URLs
25. ✅ Audio settings "Default" label duplication fixed
26. ✅ Auth token encryption with safeStorage
27. ✅ Browser tab auto-close after auth redirect

**Still needs runtime testing:**
1. O-4 — Fresh clone test (the single most important validation)
2. O-1 — Heap stability (30-min session)
3. O-2 — CPU/RAM alongside Zoom/Teams
4. O-5 — Windows dev build
5. O-6/O-7 — Native build from source
6. O-8 — Long session transcript accuracy
7. C-12 through C-16 — LLM quality validation

**CI/CD and Server Prompts (latest session):**
28. ✅ Backend deploy CI/CD pipeline (`deploy-backend.yml`) — ARM64 buildx, ECR, ECS, migrations
29. ✅ Electron release CI/CD pipeline (`release-electron.yml`) — TypeScript+Vite build, artifact paths fixed
30. ✅ GitHub Actions secrets & variables documented (`.github/SECRETS.md`)
31. ✅ Server-side prompts Prisma model + migration (`0002_add_prompts_table`)
32. ✅ Prompts API routes (`GET /api/prompts/system`, `GET /api/prompts/mode/:id`)
33. ✅ Prompts seed script (idempotent, system prompt + 6 action prompts)
34. ✅ Staging deployed and verified end-to-end (`https://api-staging.raven.ciaraai.com`)

**Cloud sync and hardening:**
35. ✅ Cloud sync end-to-end: push on session end, pull on launch, batch upload, periodic sync, offline queue
36. ✅ Sync progress banner UI (uploading X of Y sessions, progress bar, auto-dismiss)
37. ✅ Sync security: authorization-safe upserts, input validation schemas, batch cap, body limit, gzip
38. ✅ Sync observability: last-50-event log, consecutive failure tracking, payload size metrics
39. ✅ Auth token validation on startup (auto-refresh or clear expired tokens — no more stuck state)
40. ✅ Overlay/tray onboarding fix (free mode suppresses overlay until API keys configured)
41. ✅ Session route tests (16 tests: auth bypass, validation, enforcement)
42. ✅ `dev:pro:staging` script for testing against AWS staging
43. ✅ Database index `[userId, syncedAt]` for incremental sync queries
44. ✅ Migration `0003_add_synced_at_index`

**Still needs implementation:**
8. P-18 — General settings tab (launch on login, theme, version)
9. P-19 — Sidebar support section (tutorial, changelog, help center)
10. P-17 — Billing integration (Stripe)
11. P-1 through P-11 — Packaging and distribution

**Nice to have:**
12. O-3 — Device hot-swap (edge case)
13. C-7 — Multi-monitor
14. C-8 — Dark mode
