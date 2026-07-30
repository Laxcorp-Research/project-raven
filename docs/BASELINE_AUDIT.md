# Baseline audit

## Starting state

- Reference and actual starting commit: `80181435fc5802467bca4346e3f3c5312b2727ed`
- Working branch: `feature/local-ai-providers`
- Initial workspace: empty Git repository; attached to `https://github.com/Laxcorp-Research/project-raven.git` and checked out the exact reference commit.
- Node: 22.16.0 installed (engine accepts >=22.12.0; project pins major 22 in `.nvmrc`/`.node-version`)
- npm: 10.9.2
- Python: default command 3.13.2; supported 3.12 interpreter available through `py -3.12`

## Actual architecture

- Native system/mic capture: Swift ScreenCaptureKit/CoreAudio on macOS and Rust/NAPI WASAPI on Windows (`systemAudioNative.ts`, `src/native/`).
- AEC: GStreamer WebRTC DSP, coordinated by `AudioManager`.
- PCM contract: 16,000 Hz, mono, signed 16-bit linear PCM, separate `mic` and `system` callbacks.
- Cloud STT: two `ws` connections to Deepgram; mic maps to `you`, system maps to `them`; transcript normalization, bounded reconnect buffer, session persistence, and window broadcasts are in `TranscriptionService`.
- AI: `ClaudeService` builds Raven context and streams through `AIProvider`; factory creates Anthropic/OpenAI providers; overlay consumes `claude:response` IPC.
- Settings: encrypted `electron-store`; existing provider/model/session/mode data is additive and preserved.
- Packaging: Vite renderer/main plus electron-builder; native modules are external build prerequisites.

## Baseline commands

| Command | Result |
|---|---|
| `npm ci` | PASS; 849 packages installed, Electron `better-sqlite3` rebuild completed; npm reported 17 dependency audit findings. |
| `npm run lint` | FAIL; pre-existing constant-condition error, unused disable, and two hook warnings. |
| `npm test -- --run` | ENVIRONMENT FAIL; 630/633 pass, only three tests requiring the absent Windows Raven audio `.node` fail. |
| `npx tsc --noEmit` | PASS. |
| `npx vite build` | PARTIAL; renderer passes; main fails resolving intentionally absent private `src/pro/main/deepLink`. |

## Native/private modules and README differences

The Windows audio binary and built AEC addon are absent. The public repository also omits premium `src/pro` sources that static Vite resolution expects. README architecture refers to `aiService.ts`, while the live equivalent is `claudeService.ts` plus `services/ai/`. These failures are understood prerequisites/OSS-tree gaps, not unexplained application regressions.

## Expected change areas

AI provider contracts/factory/ClaudeService, local STT process management, transcription configuration, store/readiness, main/preload IPC, settings/onboarding/overlay, tests, scripts, OpenSpec, and local-mode documentation.
