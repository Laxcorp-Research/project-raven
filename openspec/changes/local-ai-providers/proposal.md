## Why

Raven currently requires cloud transcription and cloud AI credentials, which prevents users from keeping meeting content on-device. This change adds an opt-in local meeting-content path while preserving every existing cloud provider and Raven's native capture, transcript, session, and overlay architecture.

## What Changes

- Add Ollama as an AI provider with loopback-only URL validation, health/model/capability discovery, streaming, timeouts, and cancellation.
- Add a managed, repository-local WhisperLiveKit 0.2.24 runtime and connect Raven's separate mic/system PCM streams to its Deepgram-compatible WebSockets.
- Replace API-key-only session gating with provider-specific readiness and explicit data-path reporting.
- Extend typed main/preload/renderer IPC, settings, onboarding, and compact overlay status without exposing local service URLs to the renderer.
- Abort timed-out, cancelled, and shutdown AI requests and suppress late callbacks/history writes.
- Remove meeting-content logging, add local setup/check scripts, regression and mocked integration tests, and local-mode documentation.

## Capabilities

### New Capabilities

- `local-ai-provider`: Ollama discovery, capability checks, safe loopback access, streaming, and cancellation.
- `local-transcription`: WhisperLiveKit lifecycle and dual-stream transcription through Raven's existing pipeline.
- `provider-readiness`: Provider-aware start gates, persisted selections, migrations, and accurate data-path disclosure.
- `meeting-content-privacy`: Local-local network boundaries, content-safe logging, screenshot capability gating, and process cleanup.

### Modified Capabilities

None. This repository has no existing OpenSpec capability specifications.

## Impact

The Electron main process gains Ollama and local STT services; existing AI/transcription interfaces gain provider configuration and cancellation. Store settings, preload IPC contracts, onboarding/settings, and overlay status are extended compatibly. Python 3.12 and separately installed Ollama/model assets are optional local-mode dependencies; production installers remain unchanged.
