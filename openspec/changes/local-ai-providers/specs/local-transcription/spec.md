## ADDED Requirements

### Requirement: Managed WhisperLiveKit runtime
Raven SHALL support a repository-local WhisperLiveKit 0.2.24 Python 3.12 runtime, spawn it without a shell on loopback, wait for health, retry bounded port collisions, restart once after an unexpected crash, and terminate it on shutdown.

#### Scenario: Healthy CPU startup
- **WHEN** the pinned runtime and configured model exist
- **THEN** Raven starts WLK on a dynamic loopback port in raw PCM CPU mode and marks STT ready only after health succeeds

#### Scenario: Unexpected crash
- **WHEN** WLK exits unexpectedly during use
- **THEN** Raven attempts exactly one restart and reports failure if the restart does not become healthy

### Requirement: Dual-stream local transcription
Raven SHALL open separate WhisperLiveKit-compatible WebSockets for 16 kHz mono linear16 microphone and system PCM while preserving microphone-to-`you` and system-to-`them` mapping.

#### Scenario: Both speakers transcribed
- **WHEN** final transcript messages arrive on microphone and system sockets
- **THEN** Raven normalizes them into `you` and `them` entries through the existing transcript/session pipeline

### Requirement: Bounded reconnect behavior
Raven SHALL bound queued PCM during reconnect and preserve compatible KeepAlive, Finalize, CloseStream, and final-flush handling.

#### Scenario: Recording stops with uncommitted local speech
- **WHEN** Raven stops a WhisperLiveKit stream while its latest recognized words are still interim
- **THEN** Raven waits for the bounded server-side final flush and preserves any remaining interim tail as a final transcript entry

#### Scenario: Extended outage
- **WHEN** audio continues while a local transcription socket is unavailable
- **THEN** the queue remains within its configured byte limit and older audio is discarded safely

### Requirement: Selectable Windows recording endpoints
Raven SHALL enumerate active Windows microphone and playback endpoints, let the user persist each endpoint or follow the appropriate Windows default, and use those selections for microphone and WASAPI loopback capture.

#### Scenario: Selected video output is captured
- **WHEN** the user selects the playback endpoint used by a background video and starts a recording
- **THEN** Raven opens loopback capture on that endpoint and sends its non-silent PCM to the system transcription stream

#### Scenario: Selected microphone is captured
- **WHEN** the user selects an active recording input and starts a recording
- **THEN** Raven captures microphone PCM from that endpoint and maps its transcription to `you`

#### Scenario: Saved endpoint is unavailable
- **WHEN** a saved input or output endpoint is disconnected or no longer active
- **THEN** Raven falls back to the corresponding current Windows default instead of failing the recording
