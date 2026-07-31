## 1. Structured Context Compiler

- [x] 1.1 Add typed active/superseded constraints, ordered subquestions, prior Q/A anchors, ambiguity, and screen facts to interview context
- [x] 1.2 Implement newest-correction-wins, short-follow-up resolution, multipart decomposition, and screen-conflict detection
- [x] 1.3 Add focused compiler tests for corrections, interruptions, multipart questions, follow-ups, ambiguity, and bounded context

## 2. Dynamic Coverage and Repair

- [x] 2.1 Derive dynamic requirements for question parts, corrections, complexity, edge cases, uncertainty, and screen conflicts
- [x] 2.2 Feed structured context and dynamic missing criteria into the existing single targeted repair
- [x] 2.3 Add generation tests proving incomplete drafts are repaired without replacing a better original

## 3. Local Model Routing

- [x] 3.1 Add a pure interview-complexity classifier and content-safe routing decision
- [x] 3.2 Add a persisted complex interview model setting and installed-model selector in Local Providers settings
- [x] 3.3 Route complex Ollama interview turns before screenshot capability checks, with primary-model fallback and no cloud fallback
- [x] 3.4 Add routing, missing-model, vision compatibility, and cancellation tests

## 4. Production-Path Evaluation

- [x] 4.1 Update the ten-minute live evaluation to use production context, generation, verification, and repair
- [x] 4.2 Extend repeated comparison output with content-redacted dimension averages, pass rates, and latency distribution
- [x] 4.3 Run three attempts each with qwen3.5:9b and qwen3.6:35b and retain the measured routing policy

## 5. Verification

- [x] 5.1 Run focused interview tests and full Raven verification
- [x] 5.2 Strictly validate the OpenSpec change and confirm all tasks complete
