import type { ScoreCriterion } from '../../services/interviewSystemScoring'

export type InterviewScenarioCategory = 'conversation' | 'audio' | 'coding' | 'ui' | 'recovery' | 'endurance'
export type InterviewAutomation = 'automated' | 'live' | 'manual'
export type InterviewPipelineStage = 'audio' | 'transcription' | 'question-detection' | 'screen-context' | 'ai-response' | 'overlay' | 'lifecycle'

export interface InterviewSystemScenario {
  id: string
  category: InterviewScenarioCategory
  automation: InterviewAutomation
  title: string
  stages: InterviewPipelineStage[]
  steps: string[]
  expected: string[]
  evidence: string[]
  automatedBy?: string[]
}

const scenario = (
  id: string,
  category: InterviewScenarioCategory,
  automation: InterviewAutomation,
  title: string,
  stages: InterviewPipelineStage[],
  expected: string[],
  automatedBy: string[] = [],
): InterviewSystemScenario => ({
  id,
  category,
  automation,
  title,
  stages,
  steps: [`Arrange the ${title.toLowerCase()} condition.`, 'Run the interview action and observe Raven through the listed pipeline stages.'],
  expected,
  evidence: automation === 'manual'
    ? ['device and application configuration', 'pass/fail observation', 'latency or accuracy measurement', 'content-free evidence reference']
    : ['automated assertion output'],
  automatedBy,
})

export const INTERVIEW_SYSTEM_SCENARIOS: InterviewSystemScenario[] = [
  scenario('conversation-fast-multipart', 'conversation', 'automated', 'interviewer speaks quickly with a multipart question', ['transcription', 'question-detection', 'ai-response'], ['wait for the completed multipart question', 'answer every part in order'], ['interviewSystemPipeline.test.ts']),
  scenario('conversation-long-context', 'conversation', 'automated', '30–60 seconds of context before the question', ['transcription', 'question-detection', 'ai-response'], ['retain relevant earlier constraints', 'do not answer only the final sentence'], ['interviewSystemPipeline.test.ts']),
  scenario('conversation-interruption', 'conversation', 'automated', 'interviewer interrupts and clarifies', ['transcription', 'question-detection', 'ai-response'], ['select the newest clarification', 'do not conflate the abandoned question'], ['interviewSystemPipeline.test.ts']),
  scenario('conversation-overlap', 'conversation', 'manual', 'candidate and interviewer overlap', ['audio', 'transcription'], ['preserve microphone and system speaker labels as well as possible']),
  scenario('conversation-silence', 'conversation', 'live', 'silence after a completed question', ['transcription', 'question-detection', 'ai-response'], ['respond within the configured maximum latency', 'do not wait indefinitely'], ['liveInterviewSystem.test.ts']),
  scenario('conversation-rhetorical', 'conversation', 'automated', 'rhetorical confirmation question', ['question-detection', 'ai-response'], ['suppress an unnecessary candidate answer'], ['interviewSystemPipeline.test.ts']),
  scenario('conversation-three-questions', 'conversation', 'live', 'three related questions in one turn', ['transcription', 'question-detection', 'ai-response'], ['address all three parts in a clear order'], ['liveInterviewSystem.test.ts']),
  scenario('conversation-short-followup', 'conversation', 'automated', 'follow-up without repeated context', ['transcription', 'question-detection', 'ai-response'], ['connect why or what-would-you-change to the preceding exchange'], ['interviewSystemPipeline.test.ts']),
  scenario('conversation-correction', 'conversation', 'automated', 'corrected eventually-consistent API constraint', ['transcription', 'question-detection', 'ai-response'], ['use the corrected constraint', 'revise the prior recommendation'], ['interviewSystemPipeline.test.ts']),
  scenario('conversation-unknown', 'conversation', 'live', 'obscure or ambiguous technical question', ['question-detection', 'ai-response'], ['state assumptions or uncertainty', 'do not fabricate facts'], ['liveInterviewSystem.test.ts']),

  scenario('audio-webcam-only-mic', 'audio', 'manual', 'webcam microphone with other microphones disconnected', ['audio', 'transcription'], ['selected webcam input remains active']),
  scenario('audio-zoom-output', 'audio', 'manual', 'Zoom interviewer audio from selected output device', ['audio', 'transcription'], ['system stream captures the selected Zoom output']),
  scenario('audio-headphones-speakers', 'audio', 'manual', 'headphones versus speakers', ['audio', 'transcription'], ['both routes transcribe without switching speaker identity']),
  scenario('audio-volume-changes', 'audio', 'manual', 'quiet, loud, and sudden volume changes', ['audio', 'transcription'], ['speech remains intelligible without clipping or long omissions']),
  scenario('audio-accent-speed-terms', 'audio', 'manual', 'accent, fast speech, hesitation, and technical terminology', ['audio', 'transcription'], ['measure word and technical-term accuracy']),
  scenario('audio-background-noise', 'audio', 'manual', 'music, keyboard, fan, and notification noise', ['audio', 'transcription'], ['question content remains usable and noise is not hallucinated as speech']),
  scenario('audio-code-acronyms', 'audio', 'manual', 'spoken code, variables, URLs, and acronyms', ['audio', 'transcription'], ['critical tokens remain recognizable']),
  scenario('audio-device-change', 'audio', 'manual', 'audio device disconnected or changed mid-interview', ['audio', 'transcription', 'lifecycle'], ['show an actionable state and recover after reselection']),
  scenario('audio-mute-states', 'audio', 'manual', 'Zoom muted, Raven muted, or system audio disabled', ['audio', 'transcription', 'overlay'], ['identify the inactive source without fabricating transcript']),
  scenario('audio-five-minute-drift', 'audio', 'manual', 'five minutes of continuous conversation', ['audio', 'transcription'], ['speaker mapping and transcript timing do not drift materially']),

  scenario('coding-screen-only', 'coding', 'live', 'problem visible but never read aloud', ['screen-context', 'ai-response'], ['ground the response in visible requirements'], ['liveInterviewSystem.test.ts']),
  scenario('coding-spoken-only', 'coding', 'live', 'problem spoken but not visible', ['transcription', 'ai-response'], ['answer from transcript without requiring a screenshot'], ['liveInterviewSystem.test.ts']),
  scenario('coding-conflicting-requirements', 'coding', 'live', 'spoken requirements conflict with visible problem', ['transcription', 'screen-context', 'ai-response'], ['call out the conflict and prefer the interviewer’s newest constraint'], ['liveInterviewSystem.test.ts']),
  scenario('coding-added-constraint', 'coding', 'automated', 'constraint added after the first answer', ['transcription', 'ai-response'], ['revise the solution using the new constraint'], ['interviewSystemPipeline.test.ts']),
  scenario('coding-buggy-visible-code', 'coding', 'live', 'buggy code visible with what-is-wrong prompt', ['screen-context', 'ai-response'], ['identify the concrete defect and a verifiable fix'], ['liveInterviewSystem.test.ts']),
  scenario('coding-partial-code', 'coding', 'manual', 'only scrolled portion of code is visible', ['screen-context', 'ai-response'], ['state the visibility limitation and avoid claiming unseen behavior']),
  scenario('coding-multiple-tabs', 'coding', 'manual', 'multiple editors or browser tabs visible', ['screen-context', 'ai-response'], ['use the active relevant surface and avoid mixing unrelated code']),
  scenario('coding-compiler-error-only', 'coding', 'live', 'compiler error without original code', ['screen-context', 'ai-response'], ['explain likely causes and request missing code when needed'], ['liveInterviewSystem.test.ts']),
  scenario('coding-answer-progression', 'coding', 'live', 'explanation to pseudocode to implementation to tests', ['transcription', 'screen-context', 'ai-response'], ['follow the requested representation at each turn'], ['liveInterviewSystem.test.ts']),
  scenario('coding-complexity-tradeoffs', 'coding', 'automated', 'time, space, and tradeoff question', ['question-detection', 'ai-response'], ['cover time complexity, space complexity, and tradeoffs'], ['interviewSystemPipeline.test.ts']),
  scenario('coding-hidden-traps', 'coding', 'automated', 'empty, duplicate, Unicode, overflow, null, and large inputs', ['screen-context', 'ai-response'], ['enumerate applicable edge cases and tests'], ['interviewSystemPipeline.test.ts']),
  scenario('coding-language-switch', 'coding', 'live', 'language switches from JavaScript to Python', ['transcription', 'screen-context', 'ai-response'], ['produce the requested language without stale syntax'], ['liveInterviewSystem.test.ts']),
  scenario('coding-insufficient-information', 'coding', 'automated', 'insufficient information to claim code works', ['screen-context', 'ai-response'], ['state assumptions and avoid an unsupported success claim'], ['interviewSystemPipeline.test.ts']),

  scenario('ui-hide-restore', 'ui', 'manual', 'hide overlay and restore with Ctrl+\\', ['overlay'], ['overlay restores and remains interactive']),
  scenario('ui-global-assist', 'ui', 'manual', 'Ctrl+Enter while another application has focus', ['question-detection', 'screen-context', 'ai-response', 'overlay'], ['Assist triggers once and targets current context']),
  scenario('ui-side-by-side', 'ui', 'automated', 'transcript and response side by side', ['overlay'], ['both panes remain visible at supported width'], ['overlayLayout.test.ts']),
  scenario('ui-breakpoint', 'ui', 'automated', 'resize around split-view breakpoint', ['overlay'], ['layout switches only at the specified breakpoint'], ['overlayLayout.test.ts']),
  scenario('ui-divider-persistence', 'ui', 'automated', 'drag divider and restart', ['overlay', 'lifecycle'], ['saved valid ratio is restored and invalid ratios are clamped'], ['overlayLayout.test.ts']),
  scenario('ui-independent-scroll', 'ui', 'manual', 'several long responses with independent pane scrolling', ['overlay'], ['each pane scrolls without moving the other']),
  scenario('ui-new-transcript-while-reading', 'ui', 'manual', 'new transcript while reading an older response', ['transcription', 'overlay'], ['reading position remains usable and new content is discoverable']),
  scenario('ui-cancel-restart', 'ui', 'automated', 'cancel response and immediately restart', ['ai-response', 'overlay'], ['underlying request is cancelled and a new request can start'], ['claudeService.test.ts']),
  scenario('ui-thinking-toggle', 'ui', 'automated', 'thinking toggled during session', ['ai-response', 'overlay'], ['subsequent requests use the selected thinking mode'], ['ollamaProvider.test.ts', 'store.test.ts']),
  scenario('ui-second-monitor', 'ui', 'manual', 'second monitor or resolution change', ['overlay', 'lifecycle'], ['overlay remains on a reachable display']),
  scenario('ui-capture-exclusion', 'ui', 'manual', 'Zoom sharing or recording with overlay visible locally', ['overlay'], ['overlay is excluded where the OS supports content protection']),

  scenario('recovery-ollama-stopped', 'recovery', 'live', 'Ollama stops during generation', ['ai-response', 'overlay', 'lifecycle'], ['show an actionable error and allow retry after restart'], ['liveInterviewSystem.test.ts']),
  scenario('recovery-model-missing', 'recovery', 'automated', 'selected model missing or unloaded', ['ai-response', 'overlay'], ['surface model readiness failure without hanging'], ['providerReadiness.test.ts']),
  scenario('recovery-whisper-stopped', 'recovery', 'manual', 'Whisper service stops', ['transcription', 'overlay', 'lifecycle'], ['show transcription failure and recover without app restart']),
  scenario('recovery-search-offline', 'recovery', 'automated', 'internet search requested offline', ['ai-response', 'overlay'], ['surface search unavailability without inventing sourced facts'], ['webSearchService.test.ts']),
  scenario('recovery-search-empty-rate-limit', 'recovery', 'automated', 'search returns no results or rate limits', ['ai-response', 'overlay'], ['report missing evidence and retain local-only operation'], ['webSearchService.test.ts']),
  scenario('recovery-model-latency', 'recovery', 'live', 'model exceeds interview latency budget', ['ai-response', 'overlay'], ['record a latency failure and permit cancellation'], ['liveInterviewSystem.test.ts']),
  scenario('recovery-hidden-error', 'recovery', 'manual', 'error occurs while Raven is hidden', ['overlay', 'lifecycle'], ['error is accessible after restoring the overlay']),
  scenario('recovery-sleep-lock', 'recovery', 'manual', 'laptop sleeps or locks during session', ['audio', 'transcription', 'ai-response', 'lifecycle'], ['resume with explicit provider and device state']),
  scenario('recovery-restart-release', 'recovery', 'automated', 'Raven restarts and releases owned resources', ['audio', 'transcription', 'lifecycle'], ['microphone and child processes are released and reusable'], ['audioManager.test.ts', 'localSttProcessManager.test.ts', 'localSearchProcessManager.test.ts']),
  scenario('endurance-thirty-sixty-minutes', 'endurance', 'manual', '30–60 minute interview', ['audio', 'transcription', 'ai-response', 'overlay', 'lifecycle'], ['memory growth remains bounded and relevant context remains available']),
]

export type MockInterviewEventType = 'transcript' | 'screen' | 'service' | 'checkpoint'

export interface MockInterviewEvent {
  atMs: number
  type: MockInterviewEventType
  id: string
  detail: string
  speaker?: 'interviewer' | 'candidate'
  unfinished?: boolean
}

export interface MockInterviewCheckpoint extends MockInterviewEvent {
  type: 'checkpoint'
  expectedTranscript: string
  contextCriteria: ScoreCriterion[]
  correctnessCriteria: ScoreCriterion[]
  usefulnessCriteria: ScoreCriterion[]
  forbidden?: ScoreCriterion[]
  targetLatencyMs: number
  maximumLatencyMs: number
}

export const TEN_MINUTE_MOCK_INTERVIEW: Array<MockInterviewEvent | MockInterviewCheckpoint> = [
  { atMs: 0, type: 'transcript', id: 'intro-context', speaker: 'interviewer', detail: 'We have ten minutes for a QA Automation Engineer interview.' },
  { atMs: 20_000, type: 'transcript', id: 'fast-part-one', speaker: 'interviewer', unfinished: true, detail: 'Tell me how you would test checkout across UI and API' },
  { atMs: 24_000, type: 'transcript', id: 'fast-part-two', speaker: 'interviewer', detail: 'and how you would prioritize it for a release tomorrow?' },
  { atMs: 30_000, type: 'checkpoint', id: 'multipart-checkpoint', detail: 'Answer the complete multipart question.', expectedTranscript: 'Tell me how you would test checkout across UI and API and how you would prioritize it for a release tomorrow?', contextCriteria: [{ label: 'release tomorrow', patterns: [/tomorrow/i] }], correctnessCriteria: [{ label: 'API', patterns: [/API/i] }, { label: 'UI', patterns: [/UI|browser/i] }, { label: 'risk priority', patterns: [/risk|priorit/i] }], usefulnessCriteria: [{ label: 'ordered answer', patterns: [/first|then|1\.|2\./i] }], targetLatencyMs: 8_000, maximumLatencyMs: 15_000 },
  { atMs: 90_000, type: 'screen', id: 'visible-code', detail: 'JavaScript polling helper calls fetch without await and uses a fixed sleep.' },
  { atMs: 105_000, type: 'transcript', id: 'coding-question', speaker: 'interviewer', detail: 'What is wrong, and how would you fix it?' },
  { atMs: 115_000, type: 'checkpoint', id: 'coding-checkpoint', detail: 'Diagnose visible code.', expectedTranscript: 'What is wrong, and how would you fix it?', contextCriteria: [{ label: 'screen code', patterns: [/fetch|sleep|poll/i] }], correctnessCriteria: [{ label: 'await', patterns: [/await/i] }, { label: 'bounded polling', patterns: [/bound|attempt|timeout|abort/i] }], usefulnessCriteria: [{ label: 'concrete fix', patterns: [/fix|replace|use/i] }], targetLatencyMs: 10_000, maximumLatencyMs: 18_000 },
  { atMs: 180_000, type: 'transcript', id: 'candidate-overlap', speaker: 'candidate', detail: 'I would add a five second wait.' },
  { atMs: 181_000, type: 'transcript', id: 'interviewer-overlap', speaker: 'interviewer', detail: 'No, avoid fixed waits—use observable readiness.' },
  { atMs: 195_000, type: 'transcript', id: 'clarification', speaker: 'interviewer', detail: 'Actually, assume the API is eventually consistent. What changes?' },
  { atMs: 205_000, type: 'checkpoint', id: 'correction-checkpoint', detail: 'Apply the correction.', expectedTranscript: 'Actually, assume the API is eventually consistent. What changes?', contextCriteria: [{ label: 'eventual consistency', patterns: [/eventual/i] }, { label: 'no fixed waits', patterns: [/fixed wait|observable|poll/i] }], correctnessCriteria: [{ label: 'poll observable state', patterns: [/poll|retry|status/i] }, { label: 'bounded', patterns: [/timeout|bound|max/i] }], usefulnessCriteria: [{ label: 'revision', patterns: [/instead|change|revise|now|updated|given that/i] }], forbidden: [{ label: 'fixed sleep', patterns: [/sleep\(5000|waitForTimeout\(5000/i] }], targetLatencyMs: 8_000, maximumLatencyMs: 15_000 },
  { atMs: 270_000, type: 'transcript', id: 'three-questions', speaker: 'interviewer', detail: 'What edge cases matter, what is the complexity, and what tradeoff would you choose?' },
  { atMs: 280_000, type: 'checkpoint', id: 'three-part-checkpoint', detail: 'Answer three parts.', expectedTranscript: 'What edge cases matter, what is the complexity, and what tradeoff would you choose?', contextCriteria: [], correctnessCriteria: [{ label: 'edge cases', patterns: [/empty|null|duplicate|unicode|large/i] }, { label: 'complexity', patterns: [/O\(|complexity/i] }, { label: 'tradeoff', patterns: [/tradeoff|memory|readability/i] }], usefulnessCriteria: [{ label: 'three-part structure', patterns: [/first|second|third|1\.|2\.|3\./i] }], targetLatencyMs: 10_000, maximumLatencyMs: 18_000 },
  { atMs: 340_000, type: 'transcript', id: 'short-followup', speaker: 'interviewer', detail: 'Why?' },
  { atMs: 350_000, type: 'checkpoint', id: 'followup-checkpoint', detail: 'Connect short follow-up.', expectedTranscript: 'Why?', contextCriteria: [{ label: 'preceding tradeoff', patterns: [/tradeoff|memory|readability|complexity/i] }], correctnessCriteria: [{ label: 'reasoning', patterns: [/because|so that|reason|therefore|since/i] }], usefulnessCriteria: [{ label: 'concise', patterns: [/.{20,}/] }], targetLatencyMs: 6_000, maximumLatencyMs: 12_000 },
  { atMs: 405_000, type: 'transcript', id: 'rhetorical', speaker: 'interviewer', detail: 'That makes sense, right?' },
  { atMs: 420_000, type: 'service', id: 'ollama-stop', detail: 'Ollama becomes unavailable during the next request.' },
  { atMs: 435_000, type: 'transcript', id: 'failure-question', speaker: 'interviewer', detail: 'How would you test recovery from a provider outage?' },
  { atMs: 445_000, type: 'checkpoint', id: 'failure-checkpoint', detail: 'Surface the outage.', expectedTranscript: 'How would you test recovery from a provider outage?', contextCriteria: [], correctnessCriteria: [{ label: 'actionable outage', patterns: [/unavailable|stopped|retry|restart/i] }], usefulnessCriteria: [{ label: 'no fabrication', patterns: [/cannot|unable|retry|restart/i] }], targetLatencyMs: 4_000, maximumLatencyMs: 10_000 },
  { atMs: 470_000, type: 'service', id: 'ollama-recover', detail: 'Ollama is restarted and readiness succeeds.' },
  { atMs: 490_000, type: 'transcript', id: 'unknown-question', speaker: 'interviewer', detail: 'Does the undocumented Zephyr consistency mode guarantee exactly-once rollback?' },
  { atMs: 500_000, type: 'checkpoint', id: 'unknown-checkpoint', detail: 'Handle unknown facts.', expectedTranscript: 'Does the undocumented Zephyr consistency mode guarantee exactly-once rollback?', contextCriteria: [], correctnessCriteria: [{ label: 'uncertainty', patterns: [/uncertain|cannot verify|not enough|assum|undocumented|would not claim/i] }], usefulnessCriteria: [{ label: 'clarifying action', patterns: [/documentation|clarify|verify|test/i] }], forbidden: [{ label: 'fabricated guarantee', patterns: [/definitely guarantees|always guarantees/i] }], targetLatencyMs: 8_000, maximumLatencyMs: 15_000 },
  { atMs: 560_000, type: 'transcript', id: 'final-synthesis', speaker: 'interviewer', detail: 'Summarize your first-day test plan using our corrected constraints.' },
  { atMs: 600_000, type: 'checkpoint', id: 'final-checkpoint', detail: 'Synthesize retained context.', expectedTranscript: 'Summarize your first-day test plan using our corrected constraints.', contextCriteria: [{ label: 'eventual consistency', patterns: [/eventual|poll|observable/i] }, { label: 'release deadline', patterns: [/tomorrow|first day/i] }, { label: 'UI and API', patterns: [/UI|browser/i, /API/i] }], correctnessCriteria: [{ label: 'risk-based plan', patterns: [/risk|priorit/i] }, { label: 'bounded readiness', patterns: [/bound|timeout|max attempt/i] }], usefulnessCriteria: [{ label: 'ordered plan', patterns: [/first|then|morning|afternoon|(?:^|\n)\s*1[.)]/i] }], targetLatencyMs: 10_000, maximumLatencyMs: 18_000 },
]
