## Context

Raven already captures 16 kHz mono signed-16-bit PCM from microphone and system audio, applies native echo cancellation, normalizes two Deepgram streams into `you`/`them` transcript entries, and sends context through a provider-backed `ClaudeService` to the existing overlay. Local mode must reuse those seams, keep cloud behavior compatible, and keep all service networking in Electron main.

## Goals / Non-Goals

**Goals:**

- Add Ollama and WhisperLiveKit as first-class provider selections.
- Make readiness, privacy disclosure, lifecycle, timeouts, cancellation, and logs provider-aware.
- Preserve existing capture, session, context, overlay, cloud providers, and free/pro semantics.
- Provide a reproducible Python 3.12 runtime setup without implicit model downloads.

**Non-Goals:**

- Bundling Python, model weights, Ollama, CUDA, or firewall policy.
- Replacing native capture, AEC, the overlay, `ClaudeService`, or Raven's context system.
- Automatic cloud fallback, model download, meeting joining, speech generation, or strict air-gap claims.

## Decisions

1. **Extend existing provider interfaces.** `AIProvider` gains request options with `AbortSignal`; `TranscriptionService` gains a connection configuration. Parallel AI/transcript frameworks were rejected because they would duplicate session and overlay logic.
2. **Keep endpoints main-process-only.** Settings contain a validated Ollama loopback base URL, while the dynamic WLK port remains service state. Renderer IPC exposes status/results rather than raw fetch access. Renderer networking and CSP changes were rejected.
3. **Use native Ollama discovery endpoints and the existing OpenAI SDK for chat.** `/api/version`, `/api/tags`, and `/api/show` provide health, installed models, and capabilities; `/v1` chat preserves Raven's provider shape. Redirects are disabled and every configured URL is limited to HTTP loopback.
4. **Manage WLK as an optional repository runtime.** A Node setup script uses Python 3.12 to create `.raven-runtime/venv` and install `whisperlivekit==0.2.24`. Electron spawns `wlk` without a shell, selects/retries loopback ports, polls health for at least 120 seconds, restarts once, and tears down the process tree.
5. **Treat internet search as an explicit tool boundary.** Ollama receives a `web_search` function only when the configured permission permits it. Electron main executes Brave requests against a fixed HTTPS endpoint or SearXNG against a validated loopback URL, bounds and sanitizes results, and returns evidence to Ollama as untrusted data with source URLs.
5. **Derive privacy labels from provider selections.** No separate privacy mode is stored. Existing users default to Deepgram and retain their existing AI choice/model/keys.
6. **Capability-gate screenshots.** Local model capabilities are checked before image content is passed; text-only models receive text only and UI readiness includes an actionable warning.
7. **Bound resources.** Live replies use 300 output tokens and a 30-second aborting timeout. WLK reconnect buffering has a fixed byte cap; late callbacks are ignored after cancellation.

## Risks / Trade-offs

- [WLK CLI flags vary by release] → Pin 0.2.24, derive launch arguments only from its installed `wlk serve --help`, and cover arguments with tests.
- [First model startup is slow] → use a 120-second startup window and expose model-loading state.
- [Port probe races] → retry startup on a newly selected loopback port up to three times.
- [CPU transcription latency] → default to CPU/int8 for reliable installation and document optional CUDA diagnostics.
- [Optional runtimes are absent in packaged builds] → surface readiness errors and keep production bundling explicitly deferred.
- [Upstream baseline omits private pro sources/native artifacts] → keep changes isolated and validate code/tests independently from packaging.

## Migration Plan

Add default-on-read settings (`deepgram`, current AI provider) so existing databases require no destructive migration. New local settings are additive. Rollback consists of selecting cloud providers or reverting this feature branch; existing keys, modes, sessions, and database rows remain intact.

## Open Questions

- Real WASAPI/Teams/Zoom behavior, content protection, and hour-long stability remain manual validation items.
- GPU library combinations and production Python/runtime packaging remain follow-up work.
