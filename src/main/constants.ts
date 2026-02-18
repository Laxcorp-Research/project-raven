/**
 * Application-wide constants for the main process.
 * Centralises magic numbers so they're easy to find, document, and change.
 */

// ── Window Dimensions ────────────────────────────────────────────────

export const DASHBOARD_DEFAULT_WIDTH = 1000
export const DASHBOARD_DEFAULT_HEIGHT = 700
export const DASHBOARD_MIN_WIDTH = 1000
export const DASHBOARD_MIN_HEIGHT = 600

export const OVERLAY_DEFAULT_WIDTH = 520
export const OVERLAY_DEFAULT_HEIGHT = 216
export const OVERLAY_MIN_WIDTH = 520
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

export const STREAM_MAX_TOKENS = 4096
export const SUMMARY_MAX_TOKENS = 2000
export const SUMMARY_TRANSCRIPT_SLICE = 8000
export const SUMMARY_MIN_TRANSCRIPT_LENGTH = 20

export const RAG_QUERY_TRANSCRIPT_SLICE = 500
export const RAG_DEFAULT_TOP_K = 5
export const RAG_MAX_CONTEXT_TOKENS = 3000
export const RAG_CHUNK_SIZE = 500
export const RAG_CHUNK_OVERLAP = 50

export const CONVERSATION_HISTORY_LIMIT = 20

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
