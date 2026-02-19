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

These items are needed when we ship the packaged product. Not blocking for open-source launch.

### Packaging & Distribution

| # | Item | Details | Status |
|---|------|---------|--------|
| P-1 | **electron-builder config** | `npm run build` runs `electron-builder`. Need to verify the builder config in `package.json` includes all native addons, resources, and platform-specific settings. | ❌ Not configured |
| P-2 | **GStreamer native module bundling** | `raven-aec.node` + all `.dylib`/`.dll` dependencies must be copied into `resources/`. Code already looks for `process.resourcesPath/raven-aec.node` and `process.resourcesPath/gstreamer-1.0/` — but we need the builder to actually put them there. | ❌ Not configured |
| P-3 | **Swift binary bundling (macOS)** | The `audiocapture` binary (from `swift build -c release`) must be included in the `.app` bundle at the path `systemAudioNative.ts` expects. | ❌ Not configured |
| P-4 | **Windows WASAPI module bundling** | The Rust NAPI module (`.node` file) must be included in the packaged app. | ❌ Not configured |
| P-5 | **better-sqlite3 bundling** | Native module must be rebuilt for the packaged Electron ABI. `@electron/rebuild` handles this in dev, but electron-builder needs `afterPack` or `extraResources` config. | ❌ Not configured |
| P-6 | **macOS code signing & notarization** | Required for Gatekeeper. Without this, users see "app is damaged" or "unidentified developer" warnings. Needs Apple Developer account + `electron-builder` signing config. | ❌ Not set up |
| P-7 | **Windows code signing** | EV certificate for SmartScreen trust. Without it, Windows Defender flags the installer. | ❌ Not set up |
| P-8 | **Auto-updater feed** | `electron-updater` is integrated but needs a GitHub Releases feed or S3 bucket configured in `package.json` `publish` field. | ❌ No feed configured |
| P-9 | **Tray icon proper template images** | Using actual Raven logo resized to 16x16 + @2x. Functional for both open-source and premium. | ✅ Done |
| P-10 | **DMG installer design** | Background image, icon positions, drag-to-Applications layout. | ❌ Not designed |
| P-11 | **Windows installer (NSIS/MSI)** | Proper install/uninstall, Start Menu shortcuts, file associations if needed. | ❌ Not configured |
| P-12 | **Crash reporting** | Sentry or similar. In open-source mode we log to console only. Packaged app needs remote crash reporting. | ❌ Not integrated |
| P-13 | **Analytics / telemetry** | `analytics.ts` is a stub. Needs real Mixpanel/PostHog integration with opt-in consent. | ❌ Stub only |

### Pro Features (Backend Required)

| # | Item | Details | Status |
|---|------|---------|--------|
| P-14 | **Authentication backend** | `src/pro/` has client-side code. `backend/` (Fastify + Prisma) lives in the monorepo on the `premium` branch with auth, billing, and AI proxy endpoints. Needs integration testing. | ⚠️ Backend exists, not integration-tested |
| P-15 | **License/subscription enforcement** | Pro features gated by `proLoader` — but actual license validation against a backend is not implemented. | ❌ Not implemented |
| P-16 | **Cloud sync** | Session sync, settings sync across devices. Client stubs exist, backend endpoints exist in `backend/`. Needs end-to-end wiring. | ⚠️ Stubs exist both sides |
| P-17 | **Billing integration** | Stripe/Paddle integration for subscription management. Backend has Stripe webhook stubs. | ❌ Not implemented |

---

## Common (Both Versions)

These affect both open-source and premium and should be solid before either ships.

### Core Stability

| # | Item | Details | Status |
|---|------|---------|--------|
| C-1 | **Transcript merging correctness** | Same-speaker utterances within 5s are merged. Verify no text duplication or loss at merge boundaries. | ⚠️ Tested briefly, needs longer session |
| C-2 | **Deepgram WebSocket reconnection** | Already implemented: `attemptReconnect()` with 3 retries, exponential backoff (1s, 2s, 3s). Triggers on unexpected close (code ≠ 1000) while session active. | ✅ Implemented |
| C-3 | **AI streaming error recovery** | If Claude/OpenAI API returns 429 (rate limit) or 500 mid-stream, does the UI show a useful error? Does it recover on retry? | ⚠️ Error shown, no auto-retry |
| C-4 | **Session persistence integrity** | Start recording, talk for 5 min, stop, quit app, reopen — verify session appears in dashboard with full transcript and AI responses. | ❌ Not formally tested |
| C-5 | **Overlay click-through** | With `setIgnoreMouseEvents(true)`, the overlay must not intercept clicks meant for the meeting app underneath. Verify on Zoom/Teams/Meet. | ⚠️ Works in dev, needs more testing |
| C-6 | **Overlay invisible to screen share** | Fixed: `setContentProtection(true)` now correctly applied on both first launch and subsequent launches. Was broken — onboarding handler called `setStealthMode(false)`. Config: `type: 'panel'` + `screen-saver` z-level + `setContentProtection`. | ✅ Fixed (needs per-app verification) |
| C-7 | **Multiple monitor support** | Overlay should follow the correct screen if user has multiple displays. | ❌ Not tested |
| C-8 | **Dark mode consistency** | `nativeTheme` detection is integrated. Verify dashboard switches themes correctly when macOS appearance changes. | ❌ Not tested |
| C-9 | **RAG document upload** | Upload a PDF/text file, ask AI a question referencing it. Verify embeddings are created and context is used. | ❌ Not formally tested |
| C-10 | **Keyboard shortcuts on all platforms** | All shortcuts (`Cmd+\`, `Cmd+R`, `Cmd+Enter`, etc.) must work. On Windows, `Ctrl` equivalents. | ❌ Windows not tested |
| C-11 | **Graceful shutdown** | Fixed: `audioManager.shutdown()` now called in `before-quit` handler. Kills `audiocapture` child process, closes Deepgram WebSockets, saves session to DB. | ✅ Fixed (needs runtime verification) |

### LLM / Prompt Quality

| # | Item | Details | Status |
|---|------|---------|--------|
| C-12 | **Priority system works correctly** | User types a question while recording → AI answers the question (not the transcript). Verify the OVERRIDE RULE kicks in. | ⚠️ Designed, needs live test |
| C-13 | **Screenshot interpretation accuracy** | `Cmd+Enter` with no session → AI focuses on screen content. With session → AI uses both transcript + screen. | ⚠️ Designed, needs live test |
| C-14 | **Math/aptitude rendering** | KaTeX rendering for math problems. Send a screenshot of a math problem, verify answer uses proper notation and is correct. | ❌ Not tested |
| C-15 | **Action prompts: "What should I say?"** | Uses full transcript context, references the last thing the other person said. Verify it doesn't reference stale content. | ⚠️ Designed, needs live test |
| C-16 | **Mode prompts** | Switch to Interview mode → AI uses STAR structure. Switch to Sales → AI references objection handling. Verify mode-specific behavior. | ❌ Not live tested |

---

## Priority Order for Open-Source Launch

**Fixed (code changes applied):**
1. ~~O-10~~ ✅ README Node version corrected to 22+
2. ~~O-11~~ ✅ Windows GStreamer instructions added
3. ~~O-13/O-14~~ ✅ macOS permission checks added (mic prompt + screen recording error)
4. ~~O-15~~ ✅ API key security audited — clean
5. ~~O-17~~ ✅ Tray icons using actual Raven logo (16x16 + @2x)
6. ~~C-2~~ ✅ Deepgram reconnection already implemented
7. ~~C-6~~ ✅ Screen-share invisibility bug fixed (stealth was disabled on first launch)
8. ~~C-11~~ ✅ Graceful shutdown added (audioManager.shutdown() on quit)
9. ✅ AI models updated — defaults are fast models (Claude Haiku 4.5, GPT-5 Mini), deep models available in pro mode (Claude Sonnet 4.6, GPT-5.2)
10. ✅ Overlay spawns centered on screen (was bottom-right)
11. ✅ Overlay min/default width aligned to 480px across main + renderer
12. ✅ Fast/Deep model toggle implemented (pro-only, hidden in open-source)
13. ✅ Open-core repo structure set up (public + private repos, feature gating via `RAVEN_MODE`)
14. ✅ Backend integrated into monorepo on `premium` branch (`backend/`)
15. ✅ Custom AI model dropdown in settings (matches mic dropdown styling)
16. ✅ Incognito icon replaced with custom hat-and-glasses SVG

**Still needs runtime testing:**
1. O-4 — Fresh clone test (the single most important validation)
2. O-1 — Heap stability (30-min session)
3. O-2 — CPU/RAM alongside Zoom/Teams
4. O-5 — Windows dev build
5. O-6/O-7 — Native build from source
6. O-8 — Long session transcript accuracy
7. C-12 through C-16 — LLM quality validation

**Nice to have:**
8. O-3 — Device hot-swap (edge case)
9. C-7 — Multi-monitor
10. C-8 — Dark mode
