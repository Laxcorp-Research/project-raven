# Meeting-content privacy

Raven reports what happens to meeting content from the selected provider pair; it does not store a vague “privacy mode.”

In local meeting-content mode (WhisperLiveKit + Ollama), meeting audio is sent only to the loopback WLK process, transcript context only to loopback Ollama, and screenshots only to a loopback Ollama model whose inspected capabilities include vision. There is no cloud fallback.

Operational logs may contain provider names, connection state, byte/chunk counts, durations, status/error categories, model names, ports, queue depth, and process exit codes. They must not contain transcript text/payloads, prompt or response content, raw audio samples, screenshots, API keys, authorization headers, local secrets, or uploaded document content.

Local meeting-content mode means meeting content stays on this computer. It is not strict offline or air-gapped mode: Raven may still perform unrelated update, authentication, analytics, or other application networking depending on configuration. Firewall enforcement is outside this MVP.
