## ADDED Requirements

### Requirement: Safe Ollama discovery
Raven SHALL discover Ollama health, installed models, and model capabilities from Electron main and SHALL reject non-HTTP, credentialed, non-loopback, invalid-port, and off-loopback redirect targets.

#### Scenario: Local model discovery
- **WHEN** Ollama is healthy at an allowed loopback URL
- **THEN** Raven returns its version, installed models, and selected-model capabilities to typed renderer IPC

#### Scenario: Unsafe URL
- **WHEN** a configured Ollama URL is not an HTTP loopback URL
- **THEN** Raven rejects it before making a network request

### Requirement: Cancellable local generation
Raven SHALL stream Ollama output through the existing response callbacks and SHALL abort the underlying request on timeout, explicit cancellation, replacement, or shutdown.

#### Scenario: Cancelled stream
- **WHEN** a user cancels an active Ollama response
- **THEN** the provider request stops and no late text or completed response is stored

#### Scenario: Meeting-ready model warm-up
- **WHEN** provider readiness confirms that the selected Ollama model is installed
- **THEN** Raven preloads that model with an empty loopback request and keeps it resident long enough to avoid ordinary meeting pauses causing a cold first answer

### Requirement: Vision-aware screenshots
Raven MUST NOT send screenshot content to a selected Ollama model unless model inspection reports vision capability.

#### Scenario: Text-only model
- **WHEN** a screenshot is available and the selected Ollama model lacks vision capability
- **THEN** Raven removes the image content and exposes an actionable warning

### Requirement: Verified local interview assistance
When Interview mode uses Ollama, Raven SHALL derive bounded structured memory from the meeting transcript, select a question-specific response template, and check the completed draft against a deterministic coverage rubric before displaying it. Raven SHALL make at most one repair attempt and SHALL retain the draft when the attempted repair does not improve coverage.

#### Scenario: Multi-turn interview follow-up
- **WHEN** an interviewer asks a follow-up that depends on constraints or evidence mentioned earlier
- **THEN** Raven supplies the relevant structured facts to the model and checks that the response preserves the required continuity

#### Scenario: Incomplete local draft
- **WHEN** an Ollama interview draft omits a required component for the detected question type
- **THEN** Raven requests one concise repair naming the missing components and displays whichever answer has better rubric coverage

#### Scenario: Ordinary meeting mode
- **WHEN** the active mode is not an interview mode
- **THEN** Raven preserves the existing streaming response path without interview-specific memory or verification

### Requirement: Two-stage interview presentation
Raven SHALL present Interview-mode responses as a short immediately speakable answer with optional expandable supporting detail. When local verification needs a repair pass, Raven SHALL expose the initial speakable draft before the repair completes and replace it only when the verified answer improves coverage.

#### Scenario: Candidate needs an immediate response
- **WHEN** an Interview-mode draft completes
- **THEN** the overlay shows a compact `Say now` section and keeps the remaining explanation behind a `Supporting points` control

### Requirement: Grounded personal interview knowledge
Raven SHALL allow existing mode-context uploads to supply a résumé, job description, STAR stories, and project notes. Raven SHALL distinguish candidate claims from target-role requirements by file role, retrieve only bounded relevant chunks, and SHALL NOT convert a job-description requirement into candidate experience.

#### Scenario: Résumé and job description are both relevant
- **WHEN** an interview question matches uploaded candidate experience and target-role requirements
- **THEN** Raven grounds the answer in résumé or STAR-story facts while using the job description only to choose emphasis

### Requirement: Transcription-aware interview questions
Raven SHALL normalize common spoken technical terms, merge fragmented consecutive speaker turns, and select the latest completed interviewer question while excluding an unfinished `(still speaking)` tail from question classification.

#### Scenario: Fragmented technical question
- **WHEN** final transcript fragments contain a term such as `play right` and the remote speaker asks a question across consecutive entries
- **THEN** Raven supplies a merged question using the canonical term `Playwright`

#### Scenario: Interviewer is still speaking
- **WHEN** the newest remote transcript entry is marked `(still speaking)`
- **THEN** Raven uses it as provisional context but classifies the latest completed question instead

### Requirement: Continuous interview quality evaluation
Raven SHALL provide deterministic interview evaluation scenarios in the normal test suite and an opt-in live multi-model runner that reports coverage, latency, repair count, forbidden claims, and context retention.

#### Scenario: Pull request validation
- **WHEN** CI runs the interview quality test
- **THEN** question classification, transcript stabilization, personal-knowledge boundaries, answer presentation, and quality scoring are validated without requiring Ollama or private meeting data
