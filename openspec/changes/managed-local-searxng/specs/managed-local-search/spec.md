## ADDED Requirements

### Requirement: Explicit container-free installation
Raven SHALL provide a user-initiated setup action that installs a pinned SearXNG source revision and its dependencies into an ignored Raven runtime directory without requiring Docker or modifying the repository.

#### Scenario: Successful first-time setup
- **WHEN** the user selects the free local-search setup action on a supported Windows system with Python 3.12 and internet access
- **THEN** Raven installs the pinned runtime in `.raven-runtime/local-search` and reports it ready

#### Scenario: Setup fails safely
- **WHEN** cloning or dependency installation fails
- **THEN** Raven reports an actionable sanitized error and does not mark the runtime ready

### Requirement: Automatic managed lifecycle
Electron main SHALL start the installed managed SearXNG runtime automatically when the default local endpoint is needed and SHALL stop every child process it owns during application shutdown.

#### Scenario: First search starts runtime
- **WHEN** the installed runtime is stopped and a search targets Raven's default SearXNG endpoint
- **THEN** Raven starts one loopback-only process, waits for readiness, and then performs the search

#### Scenario: Concurrent callers share startup
- **WHEN** multiple readiness or search requests arrive while startup is in progress
- **THEN** Raven performs only one start operation and all callers observe its result

#### Scenario: Shutdown cleans up owned process
- **WHEN** Raven exits after starting managed SearXNG
- **THEN** Raven terminates the owned child process tree within a bounded interval

### Requirement: Safe endpoint ownership
Raven MUST bind the managed runtime only to `127.0.0.1`, MUST NOT terminate an unowned process, and MUST treat non-default validated loopback URLs as externally managed.

#### Scenario: Compatible service already occupies default port
- **WHEN** the default endpoint already returns a compatible SearXNG response before Raven starts a process
- **THEN** Raven uses the endpoint without claiming or later terminating that process

#### Scenario: Custom loopback endpoint
- **WHEN** the configured SearXNG URL differs from Raven's default managed endpoint
- **THEN** Raven checks and uses that endpoint without starting or stopping a managed runtime for it

### Requirement: No paid or public fallback
Raven MUST NOT automatically send a failed local-search query to Brave, a public SearXNG instance, or any other search provider.

#### Scenario: Managed search unavailable
- **WHEN** setup is missing, startup fails, or upstream search is unavailable
- **THEN** Raven returns an actionable local-search error while preserving the user's query on device except for the explicitly selected SearXNG upstream request

### Requirement: Content-safe observability
Raven MUST NOT log search queries, search results, authorization data, transcripts, prompts, or AI answers while managing or checking the local-search runtime.

#### Scenario: Runtime emits output
- **WHEN** the managed child writes stdout or stderr
- **THEN** Raven records at most content-free lifecycle status and does not copy child output into application logs

### Requirement: Settings readiness and recovery
Raven SHALL expose typed IPC and Settings UI states for not installed, installing, starting, ready, stopped, and error conditions, with setup and retry actions.

#### Scenario: Installed runtime is stopped
- **WHEN** Settings checks an installed but stopped managed runtime
- **THEN** Raven starts it automatically and reports ready without requiring Docker or a terminal command

#### Scenario: Runtime is not installed
- **WHEN** Settings checks the default local endpoint before setup
- **THEN** Raven reports that free local search needs one-time installation and offers the setup action
