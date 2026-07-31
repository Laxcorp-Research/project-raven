## Context

Raven supports SearXNG through a loopback URL but treats the service as externally managed. The user wants a zero-fee search option with no Docker or manual service startup during normal interviews. Raven already manages an optional Python runtime for local transcription, and project privacy rules require provider networking and process ownership to remain in Electron main.

## Goals / Non-Goals

**Goals:**

- Install a reproducible SearXNG Python runtime into `.raven-runtime`, never the repository or packaged application contents.
- Start the service lazily on the first readiness check or search, bind it only to loopback, and stop the owned process on application shutdown.
- Give Settings explicit install, progress, readiness, and retry states.
- Keep search queries and results out of logs and never fall back to a public or paid provider.
- Preserve custom loopback SearXNG URLs as externally managed advanced configurations.

**Non-Goals:**

- Shipping or committing third-party SearXNG source or models in Raven.
- Supporting a public multi-user SearXNG server, reverse proxy, Valkey, bot limiter, or Docker.
- Automatically downloading the runtime without a user-initiated setup action.
- Guaranteeing availability of upstream search engines or bypassing their rate limits.

## Decisions

1. **Pin SearXNG by Git commit and install it into an isolated virtual environment.** The setup script uses supported Python 3.12, fetches commit `6bfd82705a545a1535e36d0903fafe26c669a0fe` into a bare repository, exports only the Python application paths into `.raven-runtime/local-search/app`, and installs them into `.raven-runtime/local-search/venv`. A selected archive is required because upstream Linux deployment templates contain colon-bearing filenames that NTFS cannot check out. This avoids Docker and prevents unreviewed upstream updates. Alternatives considered: a normal Windows checkout fails on those filenames; an unpinned `pip install` is not reproducible; committing source violates repository policy; scraping DuckDuckGo is unofficial and fragile.

   The setup also applies a pinned, idempotent Windows compatibility repair to SearXNG's optional Valkey module because the upstream revision imports the Unix-only `pwd` module before the disabled limiter configuration is evaluated. The repair makes that import optional and changes no search behavior; setup fails closed if the expected source no longer matches.

2. **Use a managed Electron-main process.** A singleton process manager owns `python -m searx.webapp`, writes a minimal loopback-only settings file, waits for a bounded health response, deduplicates concurrent starts, and terminates the child tree on shutdown. It never logs command output containing queries or results. This mirrors the local-STT lifecycle pattern and keeps renderer access behind typed IPC.

3. **Manage only Raven's default endpoint.** `http://127.0.0.1:8080` is the managed endpoint. A different validated loopback URL remains externally managed and is never started or stopped by Raven. If port 8080 already serves a compatible SearXNG instance, Raven may use it but must not claim ownership or terminate it.

4. **Setup is explicit; startup is automatic.** Settings exposes an install action because setup downloads third-party code and Python packages. Once installed, readiness checks and searches start the runtime automatically. This keeps first-run consent clear while eliminating normal-operation steps.

5. **SearXNG remains an explicit backend with no fallback.** Search failures return a concise actionable error. Raven never sends the query to Brave, a public SearXNG instance, or another provider automatically.

6. **Test through dependency injection and a real local smoke check.** Unit tests mock spawn, filesystem, and fetch behavior; integration tests verify IPC and search handoff without network content. A setup/check script validates the actual Windows runtime and one live result query without persisting query or result content.

## Risks / Trade-offs

- **SearXNG's reference installation targets Linux more heavily than Windows** → Pin the commit, use Python 3.12 wheels in an isolated runtime, fail setup with actionable diagnostics, and verify on the supported Windows environment.
- **Upstream engines can rate-limit or change** → Return a visible search-unavailable state, keep ordinary local answers working, and never disguise search failure as an Ollama failure.
- **The runtime adds disk usage and setup time** → Install only after explicit user action and expose setup progress.
- **Port 8080 can be occupied** → Probe compatibility before spawning and never kill a process Raven does not own.
- **Child shutdown can fail on Windows** → Use bounded graceful termination followed by an owned-PID tree cleanup; never target an unverified PID.

## Migration Plan

1. Add the setup/check scripts and process manager without changing existing custom endpoints.
2. Add IPC/readiness and Settings controls.
3. Select SearXNG and run setup once on this workstation.
4. Verify live search, shutdown cleanup, and packaged-app behavior.
5. Rollback by selecting another backend or deleting the ignored `.raven-runtime/local-search` directory while Raven is stopped.

## Open Questions

None. The pinned commit can be deliberately updated in a future reviewed change.
