## 1. Structured requirements and context

- [x] 1.1 Extend coverage requirements and assessments with stable IDs, severity, and categorized missing results
- [x] 1.2 Associate multipart subquestions with explicit ordered-answer requirements
- [x] 1.3 Extract a distinctive prior-decision anchor for short follow-up questions
- [x] 1.4 Add active-correction requirements and superseded-constraint conflict detection
- [x] 1.5 Add distinct, applicable edge-case requirements instead of accepting a generic edge-case phrase

## 2. Validation and repair

- [x] 2.1 Validate ascending numbered structure and coverage for every multipart subquestion
- [x] 2.2 Validate causal follow-up answers against the extracted prior-decision anchor
- [x] 2.3 Implement best-candidate selection and at most two targeted repair attempts
- [x] 2.4 Preserve cancellation and content-safe behavior across all repair attempts

## 3. Evaluation semantics

- [x] 3.1 Categorize scoring criteria and turn diagnostics as critical or advisory
- [x] 3.2 Add aggregate critical/completeness pass rates and passed/incomplete/failed status
- [x] 3.3 Update the evaluation runner output without exposing interview content

## 4. Verification

- [x] 4.1 Add unit tests for ordered multipart answers, anchors, corrections, edge cases, and repair convergence
- [x] 4.2 Add scoring tests that distinguish incorrect from correct-but-incomplete results
- [x] 4.3 Run focused interview tests and strict OpenSpec validation
- [x] 4.4 Run the complete project verification suite
