# Raven interview-system test plan

This plan tests Raven from interviewer audio through transcription, question selection, screen grounding, local AI response, and overlay presentation. It intentionally separates deterministic tests from physical evidence. A manual scenario is **Not Run** until its evidence template is completed; passing unit tests never imply that a microphone, Zoom route, monitor, or capture-exclusion check passed.

## Commands

- `npm run test:interview:system` — fast deterministic catalog, transcript/context, scoring, coding, and layout checks. No services or hardware required.
- `npm run test:interview:system:live -- qwen3:14b --repeats=3` — opt-in ten-minute simulated timeline evaluated by the named local Ollama model. Output is content-redacted by default.
- Local-provider Settings includes a separate complex interview model. Raven uses it only for coding, debugging, multipart, correction, synthesis, short-follow-up, ambiguous, or screen-conflict turns; unavailable models fall back to the primary Ollama model without cloud access.
- Set `INTERVIEW_EVAL_INCLUDE_CONTENT=1` only for a deliberate local diagnostic run; never attach that output to an issue or commit it.
- `npm run test:e2e` — interactive Electron UI checks when the native/display prerequisites are available.
- Copy [the evidence template](./_evidence/interview-system-run-template.md) for each physical run.

## Baseline setup

1. Start the packaged Raven build and select Interview mode.
2. Select the webcam microphone as recording input and the same output device Zoom uses for interviewer audio.
3. Select the intended local Whisper and Ollama models; verify provider readiness.
4. Open a free Zoom meeting with a second participant or a controlled playback source.
5. Do not record real interview content for test evidence. Use the synthetic script and retain only content-free measurements.
6. Record Raven version/commit, Windows version, device names, model names, and display topology in the evidence template.

## Ten-minute scripted run

Use the timestamped fixture represented by `TEN_MINUTE_MOCK_INTERVIEW`. It contains rapid multipart speech, a visible broken polling helper, overlapping speakers, an eventual-consistency correction, three questions, a one-word follow-up, a rhetorical question, simulated Ollama failure/recovery, an obscure undocumented feature, and final context synthesis. Score each response from 0–1 for:

- transcription accuracy (normalized word error rate);
- context accuracy (required prior/newest constraints);
- technical correctness (required and forbidden concepts);
- usefulness (speakable structure, assumptions, next action);
- latency (target and maximum budgets).

A turn passes only when transcription ≥ 0.85, context ≥ 0.80, correctness ≥ 0.80, usefulness ≥ 0.70, latency is under the maximum, and no forbidden claim appears. The run passes only when every turn passes, aggregate correctness ≥ 0.85, and aggregate score ≥ 0.80.

## Gated physical scenarios

For every row: arrange the condition, speak only synthetic content, observe all listed stages, fill every evidence field, and reset the device/application state before the next test.

| ID | Exact procedure | Pass criteria |
|---|---|---|
| `conversation-overlap` | Candidate speaks into the webcam mic while the interviewer speaks through Zoom output for 3–5 seconds. | Mic/system lines retain the correct speaker/source as well as the two-channel capture permits; record WER for each source separately. |
| `audio-webcam-only-mic` | Disconnect/disable other inputs, select the webcam mic, restart capture, and speak a 30-word reference. | Selected device stays active and reference WER is recorded. |
| `audio-zoom-output` | Route Zoom to the configured output and play a 30-word interviewer reference. | System stream contains the reference under the remote-speaker label. |
| `audio-headphones-speakers` | Repeat the same reference once with headphones and once with speakers. | Both runs produce usable transcripts without swapping source labels; compare WER. |
| `audio-volume-changes` | Speak/play quiet, normal, loud, then abrupt level changes. | No long omission or clipping-induced unusable segment; record WER per level. |
| `audio-accent-speed-terms` | Read the reference at normal and fast pace with hesitations and technical terms. | Record overall WER and exact technical-token accuracy. |
| `audio-background-noise` | Repeat the reference with keyboard, fan, notification, and low music noise individually. | Speech remains usable and noise is not emitted as fabricated dialogue. |
| `audio-code-acronyms` | Dictate variable names, a URL, HTTP status codes, SQL, CI/CD, and UUID. | Record exact-token accuracy and note every ambiguity. |
| `audio-device-change` | Disconnect the active mic, select a replacement, then reconnect the webcam mic. | Raven shows actionable device state and resumes on the chosen input without restart. |
| `audio-mute-states` | Test Zoom mute, Raven capture mute/stop, and disabled system audio separately. | The inactive source is identifiable and no transcript is fabricated for it. |
| `audio-five-minute-drift` | Run alternating mic/system speech for five minutes with timestamped reference markers. | Speaker mapping remains stable and final timing drift is recorded. |
| `coding-partial-code` | Show only the middle of a function and ask what is wrong. | Raven identifies the visibility limitation and does not claim unseen code works. |
| `coding-multiple-tabs` | Display two editors and a browser with unrelated code; focus one relevant surface. | Answer uses the relevant active surface and does not blend unrelated code. |
| `ui-hide-restore` | Hide Raven, focus Zoom, press Ctrl+\\, and interact with the restored overlay. | Overlay returns once, is reachable, and accepts input. |
| `ui-global-assist` | Focus the editor/Zoom, press Ctrl+Enter once, and observe Raven. | One Assist request uses current transcript/screen context without stealing unusable focus. |
| `ui-independent-scroll` | Populate both panes with long content and scroll each independently. | Scrolling one pane does not move the other. |
| `ui-new-transcript-while-reading` | Scroll to an older response, then deliver new interviewer audio. | Reading position remains usable and new content is discoverable. |
| `ui-second-monitor` | Move Raven to monitor two, disconnect/reconnect it, then change resolution/scaling. | Overlay remains on a reachable display and can be restored. |
| `ui-capture-exclusion` | Share and locally record the target display in Zoom while Raven is visible locally. | Overlay is absent from captured output where Windows content protection is supported; note unsupported capture paths explicitly. |
| `recovery-whisper-stopped` | Stop the managed Whisper process during speech, then restart/retry from Raven. | Actionable transcription state appears and transcription recovers without restarting Raven. |
| `recovery-hidden-error` | Hide Raven, cause a provider error, then restore Raven. | Error remains accessible and offers a recovery action. |
| `recovery-sleep-lock` | During synthetic capture, lock and sleep the laptop, then resume. | Raven reports device/provider state explicitly and can resume or restart cleanly. |
| `endurance-thirty-sixty-minutes` | Run synthetic alternating conversation for 30 minutes, optionally 60, sampling memory every five minutes. | No unbounded growth trend, source drift, stuck response, or loss of relevant corrected context. |

## Automated/live traceability

All remaining scenario IDs and their pipeline stages live in `src/main/__tests__/fixtures/interviewSystemScenarios.ts`. Catalog validation fails if an automated/live scenario lacks a named test, if an ID is duplicated, if a category disappears, or if a manual procedure/evidence contract is incomplete.

## Result interpretation

- **Pass:** measured acceptance criteria satisfied with evidence.
- **Fail:** criteria violated; record only scenario ID, measurement, symptom, and content-free evidence reference.
- **Blocked:** prerequisite unavailable (device, display, model, Zoom participant).
- **Not Run:** default for every manual scenario until executed.

Never store transcript text, audio, screenshots, prompts, model responses, keys, or meeting content in the repository or automated logs.
