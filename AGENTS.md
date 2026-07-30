# Project Raven contributor guide

## Supported runtimes

- Node.js 22.12.x (the package engine accepts Node >=22.12.0)
- npm with the committed `package-lock.json`; prefer `npm ci`
- Python 3.12.x for the optional local STT runtime
- WhisperLiveKit 0.2.24 only

## Build and test

- `npm run lint`
- `npm test`
- `npm run typecheck`
- `npm run build:code`
- `npm run verify`
- `npm run test:e2e` only with an interactive Electron/display environment
- `npm run build` only after Windows Build Tools, Rust, CMake, GStreamer, and both Raven native modules are available
- `npm run local-stt:setup` and `npm run local-stt:check` for optional local transcription

## Branch rules

- Never modify `main` directly; use a `feature/*` branch.
- Preserve unrelated user changes. Never reset or discard them.
- Do not push, merge, publish, release, or open a PR unless explicitly requested.
- Keep Raven's license unchanged and do not copy third-party source into the repository.

## Privacy rules

- Never log transcripts, prompts, AI responses, screenshots, audio samples, keys, authorization headers, uploaded document content, or local secrets.
- Ollama and WhisperLiveKit networking belongs in Electron main; renderer access is typed IPC only.
- Local provider URLs must be HTTP/WebSocket loopback addresses. Never add automatic cloud fallback for local-local mode.
- Do not commit `.raven-runtime`, models, audio, transcripts, generated databases, caches, or local logs.

## Architecture paths

- Capture/AEC: `src/main/audioManager.ts`, `src/main/systemAudioNative.ts`, `src/native/`
- Transcription: `src/main/transcriptionService.ts`, `src/main/services/localStt/`
- AI: `src/main/claudeService.ts`, `src/main/services/ai/`
- Settings/readiness: `src/main/store.ts`, `src/main/services/providerReadiness.ts`
- IPC: `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/types/`
- UI: `src/renderer/src/components/`
- OpenSpec change: `openspec/changes/local-ai-providers/`

## Definition of done

Cloud regressions pass; local-local creates no cloud meeting-content provider; both PCM streams preserve speaker mapping; cancellation stops the underlying request; text-only Ollama models receive no screenshots; child processes stop on shutdown; content-safe logs, mocked tests, setup docs, and manual-test gaps are current.
