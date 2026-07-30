# Local AI architecture

```text
WASAPI/CoreAudio mic + system
        -> Raven GStreamer AEC
        -> separate 16 kHz mono linear16 PCM
        -> two provider-configured WebSockets
           Deepgram cloud OR WLK 127.0.0.1:<dynamic>/v1/listen
        -> existing normalized transcript/session context
        -> existing ClaudeService/provider factory
           Anthropic/OpenAI OR Ollama 127.0.0.1:11434/v1
        -> existing typed preload IPC and overlay stream
```

Electron main owns every provider connection. The renderer receives status, model metadata, readiness, transcripts, and response deltas through typed IPC; local service URLs are not used for renderer fetches. WLK is spawned without a shell, bound to loopback, checked through `/health`, retried across at most three dynamic ports, restarted once after a crash, and stopped with Raven. Its stdout/stderr contents are redacted.

Provider selections are additive store settings; `mode: free | pro` is unchanged. Missing `transcriptionProvider` reads as Deepgram, preserving existing users. Readiness is derived from only the selected providers. Local-local has no automatic cloud fallback.

Normal live replies are capped at 300 output tokens and 30 seconds. Every provider receives an AbortSignal; timeout, user cancellation, replacement, and shutdown stop the underlying request and suppress late callbacks/history writes. Summary and deep-analysis budgets remain separate.
