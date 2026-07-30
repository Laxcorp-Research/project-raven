# Local dependencies

| Component | Pin | Purpose |
|---|---:|---|
| Node.js | 22.12.x | Raven build/runtime baseline (`>=22.12.0` engine) |
| Python | 3.12.x | Repository-local STT virtual environment |
| WhisperLiveKit | 0.2.24 | `/health` and Deepgram-compatible `/v1/listen` |
| WhisperLiveKit reference | `362d709a376b0717a3970fe6d59f184902d08639` | Inspected upstream reference |
| faster-whisper | 1.2.1 (resolved by WLK) | Default CPU/CUDA backend |
| CTranslate2 | 4.8.1 (resolved by faster-whisper) | Inference engine |

`whisperlivekit==0.2.24` was verified on the configured Python index and is pinned in `requirements-local-stt.txt`; no Git fallback is needed. npm dependencies remain locked by `package-lock.json`.

Ollama and its models, WLK model weights, CUDA, cuDNN, Python, Windows Build Tools, Rust, CMake, and GStreamer are system/user-managed and are not bundled or downloaded automatically.
