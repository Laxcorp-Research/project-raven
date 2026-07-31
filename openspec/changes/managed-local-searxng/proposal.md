## Why

Raven's free web-search option currently assumes that a user separately runs SearXNG, commonly through Docker. Interview use needs search to be available without a paid API, Docker, or a manual service-start step.

## What Changes

- Add a pinned, container-free SearXNG runtime installed under Raven's ignored local runtime directory.
- Add Electron-main lifecycle management that lazily starts the loopback-only service, verifies health, restarts it when safe, and stops it during shutdown.
- Add setup, readiness, and recovery flows so users can install and test free local search from Raven settings.
- Make managed local SearXNG the free-search path while retaining explicit Brave support for users who choose it.
- Keep search queries out of logs and prohibit public-instance or paid-service fallback.

## Capabilities

### New Capabilities

- `managed-local-search`: Container-free installation, lifecycle, readiness, privacy, and use of a Raven-managed local SearXNG runtime.

### Modified Capabilities

None.

## Impact

- Electron main services, provider readiness, settings storage, IPC, and application shutdown.
- Settings UI and renderer IPC types.
- Setup/check scripts and documentation for the pinned Python runtime.
- Adds a pinned SearXNG runtime dependency downloaded during opt-in setup; no Docker or paid API is required during normal operation.
