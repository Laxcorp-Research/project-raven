## Context

Raven already has unit coverage for transcript normalization, interview prompting, answer repair, overlay layout, cancellation, local providers, and window protection, plus an optional five-minute live Ollama evaluation. The requested matrix crosses those seams and includes conditions that CI cannot physically reproduce, such as a webcam microphone, Zoom output routing, monitor changes, sleep/lock, and capture exclusion.

The test design must preserve Raven's privacy rules: fixtures are synthetic, reports contain scores and scenario identifiers by default, and no real transcript, model answer, audio, screen image, or key is persisted automatically.

## Goals / Non-Goals

**Goals:**

- Maintain one canonical catalog for every requested conversational, audio, coding, UI, and recovery scenario.
- Run deterministic regression checks in ordinary `npm test` without Ollama, Whisper, Zoom, Docker, microphones, or displays.
- Provide an opt-in ten-minute Ollama-backed system evaluation with a fixed timeline and five-dimensional scoring.
- Make physical-device checks repeatable through a guided runbook and evidence template.
- Produce compact machine-readable summaries suitable for comparing repeated runs and models.

**Non-Goals:**

- Claiming real transcription accuracy from text-only fixtures.
- Automating Zoom account actions or storing meeting recordings.
- Making probabilistic live-model evaluation part of the default CI gate.
- Fixing every behavior gap discovered by the new suite in this change.

## Decisions

1. **Use a typed canonical catalog with automation levels.** Each scenario is `automated`, `live`, or `manual`, has a stable ID, pipeline stages, steps, and measurable acceptance criteria. This prevents a checklist from silently losing coverage and lets tests enforce unique IDs and complete category coverage. A prose-only checklist was rejected because it cannot be validated or filtered.

2. **Model the ten-minute interview as timestamped events.** Transcript fragments, speaker overlap, screen snapshots, corrections, service failures, recovery, and expected response checkpoints share one timeline. Tests can advance deterministically without sleeping for ten minutes, while the optional live runner sends only response checkpoints to the configured local model.

3. **Score five independent dimensions.** Transcription accuracy uses normalized word error rate for synthetic expected/actual text. Context accuracy, correctness, and usefulness use explicit required/forbidden patterns. Latency uses per-turn budgets. Scores remain separate and aggregate with a documented weighted mean, so a fast but incorrect answer cannot appear healthy.

4. **Keep probabilistic runs opt-in and redact output by default.** The runner emits scenario IDs, dimension scores, latency, missing criteria, and aggregate statistics. Full answers are emitted only when a dedicated diagnostic environment flag is set. This follows Raven's content-safe logging boundary.

5. **Treat hardware claims as gated manual evidence.** The runbook records device selections, expected observation, pass/fail, and a human-entered evidence reference. CI validates that every manual scenario has a procedure but never marks it passed. OS capture exclusion, actual simultaneous speech separation, acoustic noise, and sleep/lock behavior require physical execution.

6. **Reuse production interview utilities.** Deterministic tests call transcript preparation, context construction, response assessment, overlay layout, cancellation, and provider recovery paths already used by Raven. Test-only orchestration and scoring stay outside runtime application paths.

## Risks / Trade-offs

- [Pattern scoring can miss semantically correct answers] → Keep required checks concept-level with alternatives and reserve live human review for borderline results.
- [Word error rate on synthetic text overstates real STT confidence] → Label it deterministic transcript normalization coverage, while the manual audio matrix captures actual acoustic WER.
- [Live model output is nondeterministic] → Run it opt-in, support repeated attempts, report distributions, and keep default CI deterministic.
- [A ten-minute script executed without real-time delays does not reveal thermal or memory drift] → Include separate 30–60 minute manual endurance checks with process-memory observations.
- [Large scenario catalogs can become stale] → Validate IDs, categories, pipeline stages, procedures, and requested-case mapping in unit tests.

## Migration Plan

Additive only. Land the catalog, scorer, deterministic tests, runner, and documentation. Existing tests and scripts remain intact. Rollback consists of removing the new files and package scripts.

## Open Questions

- Establish baseline real-device WER and latency percentiles after the first guided Zoom run.
- Decide later whether stable live-model thresholds should become a scheduled CI job on a dedicated Windows GPU host.
