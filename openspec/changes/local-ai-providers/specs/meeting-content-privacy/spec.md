## ADDED Requirements

### Requirement: Local meeting-content boundary
For a WhisperLiveKit plus Ollama selection, Raven SHALL send meeting audio only to local WLK and transcript/supported screenshots only to local Ollama, with no automatic cloud fallback.

#### Scenario: Local-local session
- **WHEN** a local-local session starts
- **THEN** Raven creates no Deepgram, OpenAI, or Anthropic meeting-content client

### Requirement: Content-safe operational logs
Raven MUST NOT log transcript text or payloads, prompt content, AI response content, raw audio samples, screenshot data, API keys, authorization headers, or uploaded document content.

#### Scenario: Transcript processing error
- **WHEN** malformed transcript data is received
- **THEN** logs include only provider, state, sizes, status, and error category without meeting content

### Requirement: Honest privacy claims
Raven SHALL distinguish local meeting-content mode from strict offline or air-gapped operation.

#### Scenario: Local data-path display
- **WHEN** both local providers are selected
- **THEN** the UI states that meeting content stays local and does not claim the entire application is air-gapped
