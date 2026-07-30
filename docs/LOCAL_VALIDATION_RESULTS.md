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
- Ollama `/api/generate` returned the requested exact `RAVEN_LOCAL_OK` response from `qwen2.5-coder:1.5b` after the firewall allowances were applied.
- Electron onboarding selected WhisperLiveKit + Ollama, reached readiness without cloud keys, and advanced to Permissions.
- Raven-managed WLK exited with the Electron E2E process. A separate manual WLK process required the documented Windows process-tree fallback; no repository-runtime Python/WLK processes remained afterward.
- Added automated coverage for AI timeout abortion, text-only screenshot exclusion, local-local provider boundaries, and Windows process-tree cleanup.
- Corrected the E2E fixture to use the current `dist` output, isolate user data, and select the dashboard independently of creation order.
- Re-ran the repository quality gate after building the native modules: lint, 659 unit tests, typecheck, and the production code build passed.
- Re-ran the Electron suite: all 20 end-to-end tests passed.
- Started WLK with the same loopback-only `faster-whisper`/`base.en` arguments used by Raven; `/health` returned HTTP 200 and the process was stopped without leaving a child process behind.

## Native build validation

- Rust 1.97.1 stable MSVC is installed. Cargo reached crates.io through TinyWall, downloaded the locked dependencies, and completed the optimized build.
- GStreamer 1.28.5 MSVC x86_64 runtime/development files are installed. `src/native/aec/build-deps-win.bat` passed its header, library, DLL, and WebRTC DSP plugin checks.
- The AEC addon built successfully at `src/native/aec/build/Release/raven-aec.node`.
- The WASAPI addon built successfully at `src/native/windows/raven-windows-audio.win32-x64-msvc.node`; Node loaded all nine expected exports and all three native-module tests passed.
- A live microphone start/stop check produced 69 callback chunks (47,016 bytes) without saving audio.
- A live WASAPI loopback check captured a short synthesized phrase in 156 callback chunks (106,408 bytes) without saving audio.
- The NSIS packaging build completed and produced `release/0.1.0/Raven-Windows-0.1.0-Setup.exe` (195,354,133 bytes). The unpacked resources contain the WASAPI addon, AEC addon, WebRTC DSP plugin, and GStreamer runtime. This local artifact is unsigned because no code-signing certificate was configured.

## Hardware and third-party application gaps

Teams, Zoom, and OBS were not installed or discoverable in this Windows profile. No second meeting accounts were available. Device switching, a real multi-party meeting, window/display sharing, OBS capture, remote content-protection visibility, long-duration stability, and CUDA latency tests therefore remain manual and unverified.
