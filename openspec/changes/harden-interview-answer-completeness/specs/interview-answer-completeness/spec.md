## ADDED Requirements

### Requirement: Structured coverage requirements
The system SHALL represent answer requirements with stable identifiers, severity, and optional association to an ordered subquestion.

#### Scenario: Multipart question creates traceable requirements
- **WHEN** an interviewer asks multiple related questions in one turn
- **THEN** the context SHALL contain an ordered subquestion list and traceable coverage requirements for each part

### Requirement: Ordered multipart answers
The system SHALL require multipart responses to address every detected part in the original order using visible numbering.

#### Scenario: Unordered concepts do not satisfy structure
- **WHEN** an answer contains relevant keywords but does not provide numbered parts in the requested order
- **THEN** validation SHALL report an ordered-structure requirement as missing

### Requirement: Explicit follow-up anchoring
The system SHALL anchor short follow-up questions to the preceding interviewer question and candidate decision or tradeoff.

#### Scenario: Why follow-up references the prior decision
- **WHEN** the interviewer asks a short follow-up such as “Why?”
- **THEN** the answer SHALL include causal language and a distinctive concept from the prior candidate answer

### Requirement: Correction precedence
The system SHALL apply the newest correction in each constraint family and SHALL detect an answer that relies on a superseded constraint.

#### Scenario: Corrected consistency model
- **WHEN** the interviewer replaces immediate consistency with eventual consistency
- **THEN** the answer SHALL explicitly use eventual consistency and SHALL NOT recommend behavior based on the superseded immediate-consistency assumption

### Requirement: Edge-case coverage
The system SHALL create distinct coverage checks for explicitly requested edge-case categories that can be inferred from the question or visible problem.

#### Scenario: Coding edge cases are individually covered
- **WHEN** the interviewer requests edge cases for a problem involving strings or collections
- **THEN** validation SHALL require multiple applicable categories such as empty input, duplicates, Unicode, null handling, or large input rather than accepting a generic mention of “edge cases”

### Requirement: Bounded targeted repair
The system SHALL perform no more than two targeted repair attempts and SHALL retain a repair only when it measurably improves the best answer.

#### Scenario: First repair remains incomplete
- **WHEN** the first repair reduces missing coverage but leaves a critical requirement unresolved
- **THEN** the system SHALL request one final repair containing only unresolved requirements and SHALL return the best validated answer

#### Scenario: Repair does not improve
- **WHEN** a repair does not reduce critical misses, total misses, or excess length
- **THEN** the system SHALL retain the prior better answer and SHALL NOT continue unbounded generation

### Requirement: Categorized evaluation outcomes
The evaluation system SHALL distinguish critical correctness failures from advisory completeness or presentation misses without discarding strict per-turn diagnostics.

#### Scenario: Correct but incomplete run
- **WHEN** all turns meet critical correctness thresholds but one turn misses an advisory completeness requirement
- **THEN** the aggregate SHALL report an incomplete status rather than a failed correctness status

#### Scenario: Critical error remains a failure
- **WHEN** any turn contains a forbidden claim or misses a critical correctness requirement
- **THEN** the aggregate SHALL report a failed status

### Requirement: Privacy and cancellation preservation
The verification pipeline SHALL pass cancellation to every generation attempt and SHALL NOT log answer content, prompts, transcripts, or missing requirement evidence.

#### Scenario: Cancellation during second repair
- **WHEN** cancellation occurs before or during a repair attempt
- **THEN** the underlying local request SHALL be cancelled and no content SHALL be logged
