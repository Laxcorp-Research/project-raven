## Why

The first scored ten-minute interview run was fast but passed only 2 of 8 turns because Raven omitted constraints, multipart sections, short-follow-up context, uncertainty, and bounded recovery details. The current prompt path relies too heavily on raw transcript history and the evaluation path bypasses Raven's production context and repair logic, so both orchestration and measurement need correction before model quality can be judged.

## What Changes

- Compile interview history into a structured current question, ordered subquestions, active/superseded constraints, prior-answer anchor, screen facts, and evidence boundary.
- Give corrections newest-wins semantics and resolve short follow-ups against the preceding question and candidate answer.
- Generate dynamic coverage requirements for multipart, coding, ambiguity, correction, complexity, and screen-conflict cases.
- Strengthen targeted answer repair using the structured context and missing requirements.
- Route complex local interview turns to an explicitly configured stronger installed Ollama model while retaining the fast model for ordinary turns and respecting screenshot capability.
- Update the ten-minute evaluation to use Raven's real production context/generate/verify/repair pipeline.
- Compare three runs each of the fast and complex local models and retain routing only when quality improves within interview latency limits.

## Capabilities

### New Capabilities

- `interview-context-orchestration`: Structured interview state, dynamic answer coverage, targeted repair, and measured local-model routing for high-context interview turns.

### Modified Capabilities


## Impact

- Affects interview transcript/context services, ClaudeService provider selection, local-provider settings, typed store/UI state, interview evaluation fixtures, and automated/live tests.
- Does not add cloud fallback or send meeting content outside the selected provider.
- Keeps content-safe reporting and preserves the user's selected primary model.
