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
