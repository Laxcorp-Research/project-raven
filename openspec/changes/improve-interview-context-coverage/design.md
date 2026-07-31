## Context

Raven currently extracts bounded lists of transcript sentences and appends question-type guidance. That preserves some facts but does not represent correction precedence, multipart structure, conversational referents, or screen/transcript conflicts. The first live system evaluation also called the raw Ollama provider directly rather than Raven's verified interview-answer path, producing an invalidly pessimistic baseline.

The selected local model must remain user-controlled, meeting content must remain local in local-local mode, and switching to a larger model must not break screenshot compatibility or push ordinary answers beyond live latency budgets.

## Goals / Non-Goals

**Goals:**

- Produce a compact structured interview state from transcript, current question, and optional screen facts.
- Give explicit interviewer corrections precedence while retaining provenance and superseded values.
- Resolve short follow-ups to the preceding interviewer question and candidate answer.
- Decompose multipart questions and dynamically verify every material requirement.
- Exercise the exact production generation and one-pass repair flow in live evaluation.
- Route only complex Ollama interview turns to a user-visible complex model and fall back safely when unavailable or incompatible.
- Measure three repeated runs for each candidate model before finalizing the routing policy.

**Non-Goals:**

- Replacing the language model with a deterministic answer engine.
- Sending transcripts to a cloud router or adding automatic cloud fallback.
- Persisting interview state, transcripts, prompts, screenshots, or answers to logs.
- Treating pattern scoring as a substitute for the existing manual hardware evaluation.

## Decisions

1. **Compile state with deterministic heuristics before generation.** `InterviewContext` will expose the current question, ordered subquestions, active constraints, superseded constraints, the previous Q/A anchor, ambiguity flags, screen facts, and required coverage labels. This is faster and more predictable than asking a second LLM to summarize every turn.

2. **Use newest explicit correction wins.** Sentences beginning with correction signals such as “actually,” “instead,” “correction,” or “assume” become active constraints. Earlier constraints in the same semantic family are marked superseded and excluded from active prompt instructions, while provenance remains available for explaining the revision.

3. **Resolve short follow-ups explicitly.** Questions such as “Why?” and “What would you change?” include the most recent completed interviewer question and candidate answer as a conversational anchor. The raw transcript remains available to the normal message builder, but the structured prompt tells the model exactly what the follow-up refers to.

4. **Build dynamic coverage from syntax and semantics.** The compiler adds requirements for each question clause, complexity dimensions, listed edge cases, corrections, uncertainty, and visible/spoken conflicts in addition to existing question-type requirements. The verifier uses those requirements for the existing single targeted repair.

5. **Route by complexity only in local interview mode.** A pure classifier marks coding, debugging, correction, multipart, synthesis, ambiguity, and screen-conflict turns complex. When the AI provider is Ollama and a distinct configured complex model is installed, Raven creates that provider for the turn. Otherwise it uses the selected primary model without cloud fallback and emits only an actionable, content-free warning.

6. **Keep screenshot capability tied to the final routed model.** Routing occurs before screenshot capture/capability inspection. Text-only complex models receive no screenshot; Raven warns and retains textual screen facts only when available.

7. **Evaluate the production path.** The live fixture calls `buildInterviewContext` and `generateVerifiedInterviewAnswer`, including draft coverage assessment and targeted repair. Reports remain score-only unless the explicit diagnostic flag is set.

## Risks / Trade-offs

- [Heuristic constraint families can misclassify unusual corrections] → Limit supersession to recognized families and always preserve the newest correction verbatim.
- [Large-model cold starts can exceed latency] → Route only complex turns, keep the model warm, apply the existing request timeout, and fall back to the primary model only before content generation begins.
- [Dynamic regex coverage can overfit wording] → Use concept alternatives and compare repeated live runs; do not weaken a criterion solely to make one model pass.
- [Two models consume more VRAM] → Expose routing in Settings and allow “same as primary/off”; document that constrained systems should disable it.
- [Evaluation could diverge again] → Share the same compiler and verified-answer function rather than duplicating prompt logic.

## Migration Plan

Add the new complex-model setting with a safe “same as primary” behavior when empty or unavailable. Existing users retain their selected model and can opt into or save the discovered stronger model. Rollback removes the setting and routes all turns through the primary provider.

## Open Questions

- Final default routing model is selected from the measured three-run comparison, not assumed in advance.
