## 1. Baseline and Environment

- [x] 1.1 Record the reference commit, live architecture, dependency versions, and baseline gate results
- [x] 1.2 Pin WhisperLiveKit and add local runtime setup/check scripts and ignores
- [x] 1.3 Add verification scripts without changing packaging

## 2. AI Providers and Cancellation

- [x] 2.1 Extend the AI provider contract with Ollama and AbortSignal options
- [x] 2.2 Implement loopback-safe Ollama health, model discovery, capabilities, generation, and streaming
- [x] 2.3 Propagate cancellation and live-reply limits through cloud providers and ClaudeService
- [x] 2.4 Add explicit cancellation IPC and shutdown cleanup

## 3. Local Transcription

- [x] 3.1 Implement the WhisperLiveKit process manager with health, retries, restart, and process-tree cleanup
- [x] 3.2 Add provider-specific dual WebSocket connection configuration to TranscriptionService
- [x] 3.3 Preserve speaker mapping, finalization, and bounded buffering for local and Deepgram paths

## 4. Readiness, IPC, and UI

- [x] 4.1 Add compatible provider settings and provider-readiness/data-path evaluation
- [x] 4.2 Expose typed main/preload IPC for local service status, discovery, setup, health, and cancellation
- [x] 4.3 Extend onboarding/settings for local providers without API-key requirements
- [x] 4.4 Add compact provider and LOCAL/CLOUD status to the existing overlay

## 5. Privacy and Tests

- [x] 5.1 Redact meeting content from operational logs
- [x] 5.2 Add Ollama, local STT, transcription, readiness, migration, privacy, and cancellation unit tests
- [x] 5.3 Add opt-in Brave/SearXNG web-search tooling, privacy settings, grounding, and mocked tests
- [x] 5.4 Tighten automatic search selection, primary-source grounding, concise local answers, and single-query limits
- [x] 5.3 Add a mocked dual-PCM-to-overlay integration test

## 6. Documentation and Validation

- [x] 6.1 Add concise AGENTS guidance and local dependencies, setup, architecture, privacy, notices, and manual test documentation
- [x] 6.2 Update README with local-mode setup and limitations
- [x] 6.3 Run OpenSpec validation and all supported quality gates
- [x] 6.4 Create focused local commits without pushing or opening a pull request
