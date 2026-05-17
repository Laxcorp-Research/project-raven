/**
 * Application-wide constants for the main process.
 * Centralises magic numbers so they're easy to find, document, and change.
 */

// ── Window Dimensions ────────────────────────────────────────────────

export const DASHBOARD_DEFAULT_WIDTH = 1040
export const DASHBOARD_DEFAULT_HEIGHT = 700
export const DASHBOARD_MIN_WIDTH = 1040
export const DASHBOARD_MIN_HEIGHT = 600

export const OVERLAY_DEFAULT_WIDTH = 480
export const OVERLAY_DEFAULT_HEIGHT = 216
export const OVERLAY_MIN_WIDTH = 480
export const OVERLAY_MIN_HEIGHT = 210
export const OVERLAY_SCREEN_EDGE_OFFSET = 20

export const OVERLAY_SHOW_DELAY_MS = 500
export const WINDOW_MOVE_STEP_PX = 50

// ── AI / LLM ─────────────────────────────────────────────────────────

export const TITLE_MAX_TOKENS = 30
export const TITLE_TRANSCRIPT_SLICE = 1500
export const TITLE_MAX_LENGTH = 60
export const TITLE_TRUNCATE_AT = 50
export const TITLE_TRUNCATED_LENGTH = 47

// Per-stream response cap (max tokens claude/openai will emit before we
// cut them off). 16384 covers the worst-case Coding Interview mode
// response on Opus 4.7 + adaptive thinking + xhigh effort: full code
// solution (~3-6K tokens) + per-test-case walkthrough (~2-3K) +
// complexity analysis (~1K), plus the adaptive-thinking blocks the model
// emits before the final answer (~3-8K). Previous value (4096) routinely
// truncated mid-code on hard problems. Output tokens are billed only as
// emitted, so this cap doesn't increase the cost of short suggestions.
export const STREAM_MAX_TOKENS = 16384

// Per-stream wall-clock timeout. Adaptive thinking on Opus 4.7 emits
// reasoning blocks BEFORE the first content chunk, so the time-to-first-
// byte on a hard problem can be 60-120 seconds with the model still
// working correctly. The original 60s timeout fired in the middle of
// valid thinking on coding-interview-class problems. 180s covers the
// observed worst case with ~30s headroom. Streams that hit this timeout
// are genuinely stuck (network drop, upstream stall) and we want to
// fail rather than wait forever.
export const AI_STREAM_TIMEOUT_MS = 180_000

export const SUMMARY_MAX_TOKENS = 2000
export const SUMMARY_TRANSCRIPT_SLICE = 8000
export const SUMMARY_MIN_TRANSCRIPT_LENGTH = 20

export const RAG_QUERY_TRANSCRIPT_SLICE = 500
export const RAG_DEFAULT_TOP_K = 5
export const RAG_MAX_CONTEXT_TOKENS = 3000
export const RAG_CHUNK_SIZE = 500
export const RAG_CHUNK_OVERLAP = 50

// How many recent user/assistant message pairs to retain in the in-memory
// ClaudeService.conversation.messages array AND replay to the model on
// each request. Previous value (20) was sized for a typical short
// suggestion-style meeting session. A 2-3h working session (e.g. a
// CodeSignal Industry Coding Framework assessment with 4 chained tasks
// + iterative discussions per task) can easily exceed 20 turns by the
// end of Task 2, evicting Task 1 context entirely. 100 turns covers a
// full multi-hour session without hitting the cap.
//
// Cost trade-off: every retained turn is replayed to the model on every
// subsequent request. At 100 turns of ~200 input tokens each = ~20K
// input tokens per request vs the previous ~4K. For Pro users on
// Haiku/Sonnet that's a real per-request bump (~5x). The cap is
// deliberately global rather than per-mode so behaviour is predictable;
// if cost becomes a concern in production we can either drop this back
// for non-thinking models or add per-mode overrides.
export const CONVERSATION_HISTORY_LIMIT = 100

// How many recent lines of the live transcript to include in each AI
// request. Increased from 50 to 300 to cover sessions where multiple
// problems are read aloud in sequence (each problem statement alone
// can be 30-80 transcript lines once Deepgram has finished segmenting
// it). The `[...earlier conversation omitted - N lines]` marker still
// appears beyond the cap.
export const TRANSCRIPT_LINE_LIMIT = 300

// ── Audio / Transcription ────────────────────────────────────────────

export const AUDIO_SAMPLE_RATE = 16000
export const AUDIO_CHANNELS = 1

export const DEEPGRAM_KEEPALIVE_MS = 8000
export const DEEPGRAM_ENDPOINTING_MS = 300
export const DEEPGRAM_UTTERANCE_END_MS = 1500

export const TRANSCRIPT_MERGE_WINDOW_MS = 5000
export const TRANSCRIPT_FLUSH_TIMEOUT_MS = 3000

// ── Screenshot ───────────────────────────────────────────────────────

export const SCREENSHOT_CAPTURE_DELAY_MS = 45
export const SCREENSHOT_MAX_WIDTH = 1920
export const SCREENSHOT_MIN_WIDTH = 640
export const SCREENSHOT_MIN_HEIGHT = 360
export const SCREENSHOT_PREVIEW_WIDTH = 320

// ── Session / Auto-save ──────────────────────────────────────────────

export const SESSION_AUTOSAVE_INTERVAL_MS = 60_000

// ── Auth ─────────────────────────────────────────────────────────────

export const TOKEN_REFRESH_INTERVAL_MS = 13 * 60 * 1000
