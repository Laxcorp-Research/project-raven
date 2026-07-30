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
