# Local meeting-content setup

## Prerequisites

Install Node 22.12.x, Python 3.12.x, Raven's normal Windows Build Tools/Rust/CMake/GStreamer/native modules, and Ollama. The reliable first-run path is CPU; CUDA is advanced and requires compatible drivers/libraries that Raven does not install.

## WhisperLiveKit

1. Run `npm run local-stt:setup`. It creates `.raven-runtime/venv`, upgrades its pip, installs exactly `whisperlivekit==0.2.24`, and runs `wlk check`.
2. The setup command intentionally stops before downloading model weights and prints the exact explicit `wlk pull base.en` command with Raven's model cache.
3. Run `npm run local-stt:check` after the model download.
4. In Settings → API Keys, choose WhisperLiveKit and press **Start / health check**.

WLK 0.2.24 exposes `--backend faster-whisper`, `--model base.en`, `--pcm-input`, host/port, and language flags. It does not expose faster-whisper device/compute flags. Raven forces the CPU default by hiding CUDA from the child process; CTranslate2's CPU auto compute selection uses its supported quantized type (normally int8). Selecting CUDA removes that restriction; diagnostics must succeed and there is no silent fallback except the explicit `auto` selection.

## Ollama

1. Install/start Ollama separately.
2. Explicitly install a model, e.g. `ollama pull qwen3:4b` (choose a model appropriate for your machine).
3. In provider settings choose Ollama, keep `http://127.0.0.1:11434`, press **Discover / test**, select an installed model, and save.
4. Models advertising `vision` can receive Raven screen context. Text-only models never receive screenshots.

Ollama context length is configured in the installed model/Modelfile, not through Raven.

## Provider combinations

- WhisperLiveKit + Ollama: meeting content stays local; no API keys.
- WhisperLiveKit + OpenAI/Anthropic: audio transcription is local; transcript/supported screen context goes to the selected cloud AI.
- Deepgram + Ollama: audio goes to Deepgram; transcript/supported screen context is processed locally.
- Deepgram + OpenAI/Anthropic: audio and transcript use cloud providers.

## Troubleshooting and removal

- Wrong Python: `python` may be 3.13; setup deliberately locates `py -3.12` on Windows and rejects unsupported versions.
- WLK unavailable/model missing: rerun setup/check and the explicit `wlk pull` command. Startup permits 120 seconds for model loading.
- Ollama unavailable: verify `http://127.0.0.1:11434/api/version`; Raven rejects remote hosts, HTTPS, credentials, invalid ports, and redirects.
- CUDA errors: switch to CPU, then verify driver, CUDA/cuDNN, and CTranslate2 compatibility independently.
- Orphan process: normal shutdown is graceful; Windows falls back to `taskkill.exe /PID <numeric-pid> /T /F` without a shell.
- Remove local runtime/models: close Raven, then delete `.raven-runtime`. Remove Ollama models with `ollama rm <model>`.

Production Python/runtime bundling and strict air-gap mode are not included.
