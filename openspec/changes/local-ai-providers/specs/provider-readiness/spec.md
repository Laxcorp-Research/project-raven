## ADDED Requirements

### Requirement: Provider-specific readiness
Raven SHALL derive session readiness from the selected transcription and AI providers, requiring only the credentials, service health, and installed models relevant to that combination.

#### Scenario: Local-local ready
- **WHEN** WhisperLiveKit is healthy and the configured Ollama model is installed
- **THEN** Raven can start a session without API keys and does not create cloud providers

#### Scenario: Mixed provider missing credential
- **WHEN** Deepgram is selected without its key while Ollama is healthy
- **THEN** session start is blocked with a Deepgram-specific error

### Requirement: Compatible persistence
Raven SHALL persist actual provider selections without repurposing the free/pro mode and SHALL default existing users to Deepgram while preserving their AI provider, model, keys, sessions, and modes.

#### Scenario: Existing cloud user upgrade
- **WHEN** a store without transcription-provider settings is opened
- **THEN** Raven reads Deepgram as the default and leaves all existing data unchanged

### Requirement: Accurate data path
Raven SHALL derive an explicit data-path summary that reports whether audio and transcript content leave the device and names the selected providers.

#### Scenario: Local transcription with cloud AI
- **WHEN** WhisperLiveKit and OpenAI are selected
- **THEN** Raven reports local audio transcription and that transcript content is sent to OpenAI
