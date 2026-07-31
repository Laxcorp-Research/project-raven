## Why

Raven's interview answers are generally fast and correct, but intermittent omissions still reduce context coverage: multipart answers may lose their requested order, short follow-ups may not explicitly reference the prior tradeoff, and a valid answer can omit one edge case or corrected constraint. These gaps should be caught and repaired deterministically before the overlay presents the answer.

## What Changes

- Require ordered, numbered output for multipart interview questions and validate that each detected part is addressed.
- Preserve explicit follow-up anchors to the prior question, answer, and named tradeoff or decision.
- Track corrected constraints with newest-correction precedence and require the final answer to state the active constraint.
- Replace broad keyword-only coverage checks with typed requirements and targeted per-requirement repair instructions.
- Permit a bounded second repair when the first repair improves but does not complete coverage.
- Separate critical correctness failures from noncritical completeness/style misses in evaluation summaries while retaining per-turn diagnostics.
- Add deterministic and production-pipeline tests for multipart ordering, follow-up anchoring, edge-case coverage, correction precedence, and repair convergence.

## Capabilities

### New Capabilities
- `interview-answer-completeness`: Defines structured answer coverage, deterministic validation, bounded repair, and evaluation semantics for interview responses.

### Modified Capabilities

None.

## Impact

The change affects the interview context and verified-answer pipeline in `src/main/services/interviewCopilot.ts`, aggregate scoring in `src/main/services/interviewSystemScoring.ts`, and associated unit/integration evaluation tests. It does not add network services, cloud fallback, or content logging.
