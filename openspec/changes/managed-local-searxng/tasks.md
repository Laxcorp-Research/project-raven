## 1. Runtime Setup

- [x] 1.1 Add pinned container-free SearXNG setup and readiness-check scripts for Python 3.12
- [x] 1.2 Generate a loopback-only, JSON-enabled managed SearXNG configuration without logging content

## 2. Electron Main Lifecycle

- [x] 2.1 Implement the deduplicated managed process lifecycle, compatibility probe, health wait, and owned shutdown cleanup
- [x] 2.2 Integrate lazy managed startup with the default SearXNG search path and preserve custom loopback endpoints
- [x] 2.3 Wire lifecycle cleanup into Raven shutdown and expose content-safe readiness state

## 3. Settings and IPC

- [x] 3.1 Add typed IPC for managed local-search status, setup, start/retry, and test actions
- [x] 3.2 Update Settings to make managed local search the free option with install progress and actionable states

## 4. Verification

- [x] 4.1 Add unit and integration coverage for setup state, concurrent startup, unowned endpoints, search failure, privacy, and shutdown
- [x] 4.2 Run lint, unit/integration tests, typecheck, build, and strict OpenSpec validation
- [x] 4.3 Perform one-time local setup, live search smoke test, packaged-app launch, automatic startup, and shutdown verification without Docker
