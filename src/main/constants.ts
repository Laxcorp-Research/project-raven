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

// Assist length is the model's official max output (see streamMaxTokensFor).
// STREAM_MAX_TOKENS is only a fallback if the catalog has no entry.
export const STREAM_MAX_TOKENS = 128_000

// Hung-socket safety only. Length is not time-capped by the product;
// max-effort coding can think for minutes before the first token.
export const AI_STREAM_TIMEOUT_MS = 1_800_000

export const SUMMARY_MAX_TOKENS = 2000
export const SUMMARY_TRANSCRIPT_SLICE = 8000
export const SUMMARY_MIN_TRANSCRIPT_LENGTH = 20

// Follow-up email draft: a short artifact, so a smaller output budget than
// the summary, but a generous transcript tail so the closing of the call
// (where next steps are usually agreed) is always in context.
export const FOLLOWUP_MAX_TOKENS = 1200
export const FOLLOWUP_TRANSCRIPT_SLICE = 6000
/** Ended sessions scanned on boot for missing title/summary. */
export const NOTES_RETRY_SCAN = 40
/** Max notes regenerations kicked off on a single boot. */
export const NOTES_RETRY_LIMIT = 8

export const RAG_QUERY_TRANSCRIPT_SLICE = 500
export const RAG_DEFAULT_TOP_K = 5
export const RAG_MAX_CONTEXT_TOKENS = 3000
export const RAG_CHUNK_SIZE = 500
export const RAG_CHUNK_OVERLAP = 50

// Ask-my-meetings: local Q&A across the transcript index. Higher top-K and
// token budget than per-mode RAG because it searches across many sessions.
export const SESSION_QA_TOP_K = 8
export const SESSION_QA_MAX_CONTEXT_TOKENS = 4000
export const SESSION_QA_MAX_TOKENS = 1024
/** Single-session Q&A feeds the transcript directly (no retrieval); slice cap. */
export const SESSION_SCOPED_QA_TRANSCRIPT_SLICE = 24000
/**
 * Recent-turn budget (characters) kept VERBATIM in each Ask call. Turns older
 * than this aren't dropped — they're folded into a running summary (see below)
 * so earlier context is never lost, only compressed. ~12k chars ≈ 4k tokens.
 */
export const SESSION_QA_HISTORY_MAX_CHARS = 12000
/** Output budget for the rolling summary of older conversation turns. */
export const SESSION_QA_SUMMARY_MAX_TOKENS = 512
/**
 * Cap on how much older-turn text is fed into a single summarization pass.
 * Large enough (~13k tokens) that only extreme conversations approach it; the
 * summary itself is carried forward so memory compounds rather than resets.
 */
export const SESSION_QA_SUMMARY_INPUT_SLICE = 40000
/** Sessions scanned/indexed lazily when the Ask view first opens. */
export const SESSION_INDEX_BACKFILL_SCAN = 40
export const SESSION_INDEX_BACKFILL_LIMIT = 10

// RAM / overlay bound for stored Assist turns. The model only sees the
// last RECENT_HISTORY_MESSAGES plus session_memory / pinned opening.
// Dropping oldest UI rows must not drop the original problem — that
// lives in SessionMemory, not in this ring.
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
