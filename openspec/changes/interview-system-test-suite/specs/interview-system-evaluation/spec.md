## ADDED Requirements

### Requirement: Canonical scenario coverage
The project SHALL maintain a machine-readable catalog covering conversational, audio, coding, UI/response, failure/recovery, endurance, and ten-minute mock-interview scenarios. Every scenario MUST have a stable identifier, automation level, pipeline stages, steps, and measurable expected behavior.

#### Scenario: Requested matrix is represented
- **WHEN** the catalog validation test runs
- **THEN** every requested interview edge case is represented exactly once or explicitly cross-referenced by a stable scenario identifier

#### Scenario: Automation boundary is explicit
- **WHEN** a scenario depends on physical audio hardware, Zoom, display topology, sleep/lock, or OS capture exclusion
- **THEN** it is classified as a gated manual test and is not reported as automatically passed

### Requirement: Deterministic interview pipeline tests
The default automated suite SHALL exercise production transcript preparation, speaker/source preservation, completed-question selection, context extraction, correction handling, answer assessment, cancellation, layout, and provider recovery behavior without requiring external services.

#### Scenario: Rapid multipart question remains incomplete until final
- **WHEN** rapid transcript fragments end with an unfinished interviewer segment
- **THEN** the suite verifies Raven does not select the unfinished tail as the completed question and selects the complete multipart question after finalization

#### Scenario: Context and corrections remain grounded
- **WHEN** a long background, a follow-up, or a corrected constraint precedes the current question
- **THEN** the suite verifies that relevant prior facts and the newest constraint are available to answer construction without conflating speakers

#### Scenario: Coding and UI contracts are checked
- **WHEN** coding constraints or overlay interactions are simulated
- **THEN** the suite verifies required correctness concepts, uncertainty boundaries, split-view behavior, persisted divider bounds, cancellation, thinking modes, and recovery contracts

### Requirement: Scored ten-minute mock interview
The project SHALL provide a timestamped ten-minute QA Automation Engineer interview fixture containing interruptions, corrections, overlapping speakers, visible coding context, multipart/follow-up questions, and a local-model or search failure followed by recovery.

#### Scenario: Deterministic timeline validation
- **WHEN** the mock timeline test runs
- **THEN** events are ordered, span at least ten simulated minutes, exercise every required pipeline stage, and define scoreable checkpoints

#### Scenario: Live local-model evaluation
- **WHEN** the operator explicitly enables the live interview-system runner
- **THEN** Raven evaluates each answer for transcription accuracy, context accuracy, correctness, usefulness, and latency and emits a compact machine-readable summary

#### Scenario: Sensitive content is not logged by default
- **WHEN** the live runner finishes
- **THEN** its default report contains scenario identifiers, scores, timings, and missing criteria but excludes transcript text, screen content, prompts, and full model answers

### Requirement: Scoring and thresholds
The evaluation utilities SHALL calculate normalized transcription accuracy, context coverage, correctness coverage, usefulness coverage, latency score, per-turn pass/fail, and aggregate results using documented thresholds.

#### Scenario: Fast incorrect answers fail
- **WHEN** an answer meets its latency budget but omits required correctness criteria
- **THEN** the turn fails and the aggregate report retains the low correctness score

#### Scenario: Uncertainty is rewarded for unknown questions
- **WHEN** an obscure or ambiguous question lacks sufficient evidence
- **THEN** the usefulness/correctness checks require stated assumptions or uncertainty and reject fabricated certainty

### Requirement: Guided physical-system verification
The project SHALL provide a manual runbook and evidence template for microphone/output routing, Zoom audio, noise/volume/accent conditions, device changes, simultaneous real speakers, hotkeys with another application focused, multiple monitors, capture exclusion, sleep/lock, and long-duration resource behavior.

#### Scenario: Manual run captures evidence
- **WHEN** an operator executes a hardware-dependent scenario
- **THEN** the runbook records prerequisites, exact steps, expected observation, result, latency or accuracy measurement where applicable, and an evidence reference without embedding meeting content

#### Scenario: Incomplete manual run remains unverified
- **WHEN** no evidence has been recorded for a gated scenario
- **THEN** reports identify the scenario as not run rather than passing it by inference
