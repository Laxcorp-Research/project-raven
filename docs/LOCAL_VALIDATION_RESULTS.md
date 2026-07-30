# Local validation results

Date: 2026-07-30  
Branch: `feature/local-ai-providers`

## Environment

- Windows 11 Pro 10.0.26200 (build 26200)
- Node 22.16.0; project minimum/pin 22.12.0
- Python 3.12.10
- WhisperLiveKit 0.2.24 with `base.en`
- Ollama 0.32.1
- Tested Ollama model: `qwen2.5-coder:1.5b`
- GPUs: Intel Graphics 32.0.101.8724 and NVIDIA RTX 5090 32.0.16.1074
- MSVC x64 compiler 19.44.35228 from Visual Studio Build Tools 2022

## Completed checks

- Downloaded `base.en` explicitly into the ignored `.raven-runtime` model cache.
- Passed `wlk check` and the repository model check.
- Started WLK on `127.0.0.1:8999`; `/health` returned ready with the `faster-whisper` backend.
- Sent 16 kHz mono signed-16-bit synthetic speech through the real `/v1/listen` WebSocket. WLK returned the final transcript `What is the next step`.
- Ollama `/api/version` returned 0.32.1 and `/api/chat` returned the requested exact local response from `qwen2.5-coder:1.5b`.
- Electron onboarding selected WhisperLiveKit + Ollama, reached readiness without cloud keys, and advanced to Permissions.
- Raven-managed WLK exited with the Electron E2E process. A separate manual WLK process required the documented Windows process-tree fallback; no repository-runtime Python/WLK processes remained afterward.
- Added automated coverage for AI timeout abortion, text-only screenshot exclusion, local-local provider boundaries, and Windows process-tree cleanup.
- Corrected the E2E fixture to use the current `dist` output, isolate user data, and select the dashboard independently of creation order.

## Native build blockers

- The Rust compiler is not installed. Rustup was installed, but direct toolchain download was rejected by the current network policy.
- A standalone Rust MSVC installation was attempted through Windows Package Manager, but Windows Installer remained busy indefinitely. The installer client was stopped without terminating the system-wide Windows Installer service.
- GStreamer runtime/development files are not installed, so `src/native/aec/build-deps-win.bat` fails before compilation.
- Consequently, the Raven WASAPI `.node` and Windows AEC addon were not built, and full native packaging remains blocked.

## Hardware and third-party application gaps

Teams, Zoom, and OBS were not installed or discoverable in this Windows profile. No second meeting accounts were available. Real microphone/system capture, device switching, recording, window/display sharing, OBS capture, remote content-protection visibility, long-duration stability, and CUDA latency tests therefore remain manual and unverified.

