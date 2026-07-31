## ADDED Requirements

### Requirement: Structured interview context
Raven SHALL compile the current interview turn into a bounded structured context containing the current question, ordered subquestions, active constraints, superseded constraints, prior conversational anchor, relevant screen facts, ambiguity state, and required coverage.

#### Scenario: Multipart question
- **WHEN** an interviewer asks multiple related questions in one completed turn
- **THEN** Raven preserves their order and requires the answer to address each part

#### Scenario: Short follow-up
- **WHEN** the current question is a short follow-up such as “Why?” or “What would you change?”
- **THEN** Raven anchors it to the preceding interviewer question and candidate answer

#### Scenario: Screen and speech conflict
- **WHEN** the newest spoken requirement conflicts with visible screen content
- **THEN** Raven identifies the conflict, treats the newest interviewer constraint as active, and does not silently merge incompatible requirements

### Requirement: Correction precedence
Raven MUST treat the newest explicit interviewer correction as active and MUST prevent a superseded constraint from being presented as simultaneously active.

#### Scenario: Eventually-consistent correction
- **WHEN** the interviewer changes an immediate-consistency assumption to eventual consistency
- **THEN** the compiled state marks eventual consistency active, marks the prior assumption superseded when present, and requires a revised bounded-observation strategy

### Requirement: Dynamic coverage verification
Raven SHALL derive answer requirements from the actual current question and structured state in addition to question-type templates, assess the first draft, and perform at most one targeted repair when material requirements are missing.

#### Scenario: Coding completeness
- **WHEN** a coding question requests implementation, edge cases, time complexity, space complexity, and tradeoffs
- **THEN** all requested dimensions are independently required and missing dimensions trigger targeted repair

#### Scenario: Ambiguous or undocumented term
- **WHEN** the question contains an ambiguous or explicitly undocumented technical term without supporting evidence
- **THEN** Raven requires an assumption or uncertainty statement and a concrete verification step

#### Scenario: Repair does not improve answer
- **WHEN** the repaired answer does not improve required coverage or concision
- **THEN** Raven retains the better original draft

### Requirement: Measured local model routing
In local Ollama interview mode, Raven SHALL use the selected primary model for ordinary turns and MAY use a configured installed complex model for coding, debugging, correction, multipart, synthesis, ambiguity, or screen-conflict turns.

#### Scenario: Complex model is ready
- **WHEN** a turn is complex and the configured complex model is installed and compatible
- **THEN** Raven uses that model for generation and verification while preserving local-only networking

#### Scenario: Complex model unavailable
- **WHEN** the configured complex model is absent, unavailable, or identical to the primary model
- **THEN** Raven uses the primary model without cloud fallback and exposes a content-free readiness warning

#### Scenario: Text-only routed model
- **WHEN** the routed complex model does not support vision
- **THEN** Raven does not send a screenshot to it and communicates the limitation

### Requirement: Production-path evaluation
The ten-minute live evaluation SHALL use Raven's production context compilation, generation, assessment, and repair functions and SHALL support repeated comparisons across local models with content-redacted output.

#### Scenario: Three-run comparison
- **WHEN** two candidate models are evaluated with three repeats each
- **THEN** the report includes per-dimension averages, pass rates, latency distribution, and missing criterion labels without transcript, prompt, screenshot, or answer content

#### Scenario: Routing decision
- **WHEN** the complex model materially improves correctness/context while remaining within maximum latency
- **THEN** Raven may retain complexity routing; otherwise the complex model setting remains disabled or uses the primary model
