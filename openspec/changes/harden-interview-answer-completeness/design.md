## Context

The existing pipeline extracts structured context and performs one keyword-oriented repair pass. It can identify many missing concepts, but its requirements do not encode severity, the subquestion they satisfy, or whether the requested output order was actually followed. A single repair may improve an answer while leaving one requirement unresolved, and aggregate evaluation currently treats one incomplete turn as the same overall run failure as a materially incorrect response.

All processing must remain local, cancellation-aware, bounded for meeting latency, and content-safe in logs.

## Goals / Non-Goals

**Goals:**

- Represent coverage requirements with stable identifiers, severity, and optional subquestion association.
- Validate multipart structure, explicit follow-up anchoring, active corrections, and requested edge-case coverage.
- Run at most two targeted repairs, retaining only measurable improvements.
- Report critical failures separately from noncritical completeness misses in turn and aggregate scores.
- Keep existing provider interfaces and privacy guarantees intact.

**Non-Goals:**

- Guarantee identical text across nondeterministic model runs.
- Add cloud fallback, new models, or external services.
- Replace semantic judgment with a full secondary LLM judge.
- Increase the number of unbounded generation attempts.

## Decisions

1. Extend `CoverageRequirement` with an identifier, severity (`critical` or `advisory`), optional subquestion index, and matching mode. Stable identifiers make repair prompts and test diagnostics reliable; labels remain user-readable.
2. Validate ordered multipart answers structurally by locating numbered markers in ascending order and associating one requirement with each subquestion. Keyword presence alone is insufficient because it can pass a collapsed answer that ignores ordering.
3. Enrich conversation anchors with a compact extracted decision phrase. For a short follow-up, the answer must repeat a distinctive term from that decision and provide causal language. This is more specific than accepting any generic word such as “complexity.”
4. Generate explicit requirements for every active corrected constraint and exclude superseded values. The validator detects use of superseded constraints as a critical conflict.
5. Use a maximum of two repair passes. Each prompt contains only unresolved requirements plus exact structural instructions. A candidate replaces the current best only when it reduces critical misses, then total misses, then excess length. Cancellation is passed to every call.
6. Preserve binary per-turn `passed`, but add `criticalPassed`, categorized missing fields, aggregate critical pass rate, completeness pass rate, and a run status that distinguishes `passed`, `incomplete`, and `failed`. A run is failed for correctness/safety failures; advisory omissions produce incomplete status rather than mislabeling the system as incorrect.

## Risks / Trade-offs

- [Risk] A second repair can increase latency. → Mitigation: invoke it only when the first repair measurably improves coverage and critical requirements remain, cap attempts at two, and reuse the selected local model.
- [Risk] Regex validation can reject valid paraphrases. → Mitigation: support multiple patterns, use stable typed requirements, and classify presentation-only checks as advisory.
- [Risk] Repeating anchor terms can make answers sound mechanical. → Mitigation: require one distinctive decision term and causal explanation, not verbatim repetition of the prior answer.
- [Risk] Evaluation changes could hide regressions. → Mitigation: retain strict turn pass/fail and all dimension scores while adding—not replacing—categorized diagnostics.

## Migration Plan

The data types are internal and require no persisted-data migration. Update the validator, generator, tests, and runner together. Rollback consists of reverting this change; provider and store schemas are unchanged.

## Open Questions

None.
