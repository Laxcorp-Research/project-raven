## Why

Raven has focused transcription, interview-answer, audio, search, and overlay tests, but it lacks one traceable system-level suite covering the real interview edge cases from audio input through the protected overlay. A repeatable scored suite is needed to distinguish automated guarantees from hardware-dependent checks and to expose regressions in context retention, question handling, correctness, usability, and latency.

## What Changes

- Add a canonical interview-system scenario catalog spanning conversational, audio, coding, UI, failure/recovery, and endurance cases.
- Add deterministic automated tests for transcript assembly, question selection, context/correction handling, answer scoring, coding constraints, cancellation, layout, and recovery contracts.
- Add a scripted ten-minute mock QA Automation Engineer interview with interruptions, corrections, overlapping speakers, screen context, and service failure/recovery.
- Score applicable turns for transcription accuracy, context accuracy, technical correctness, usefulness, and response latency, with explicit thresholds and machine-readable summaries.
- Add a guided hardware/Zoom runbook and evidence template for cases that cannot be truthfully automated in headless CI.
- Add package scripts for the fast deterministic suite and the optional live local-model evaluation.

## Capabilities

### New Capabilities

- `interview-system-evaluation`: Defines scenario coverage, scoring, automation boundaries, mock-interview execution, and evidence requirements for Raven as a complete interview copilot.

### Modified Capabilities


## Impact

- Adds test fixtures, scoring utilities, Vitest integration coverage, an optional Ollama-backed runner, and manual evidence documentation.
- Extends package test commands without changing production provider, privacy, or networking behavior.
- Uses synthetic transcript/audio-event metadata in CI; real microphone, Zoom, monitor, sleep, and capture-exclusion claims remain gated manual checks.
