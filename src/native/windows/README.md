# Raven Windows Audio Module

Native Windows audio capture module built with Rust and [NAPI-RS](https://napi.rs). Provides system audio (loopback) and microphone capture via the Windows Audio Session API (WASAPI).

## How It Works

- **System audio**: WASAPI loopback capture on the default render device — captures everything playing through speakers/headphones
- **Microphone**: Standard WASAPI capture on the default recording device
- Both streams are resampled to 16 kHz mono Int16 PCM (matching Deepgram's expected format) using the `rubato` crate
- Audio chunks are delivered to Node.js via NAPI threadsafe callbacks

## Prerequisites

- **Windows 10/11** (WASAPI is built into Windows)
- **Rust toolchain** — install via [rustup](https://rustup.rs/)
  ```bash
  # Ensure the MSVC target is installed (default on Windows)
  rustup default stable-msvc
  ```
- **Node.js 18+**
- **NAPI-RS CLI**
  ```bash
  npm install -g @napi-rs/cli
  ```
- **Visual Studio Build Tools** or full Visual Studio with the "Desktop development with C++" workload (provides the Windows SDK and MSVC compiler)

## Building

From the `src/native/windows/` directory:

```bash
# Install JS dependencies (for napi-build)
npm install

# Build the native module
napi build --platform --release

# Or using cargo directly:
cargo build --release
```

This produces a file named `raven-windows-audio.win32-x64-msvc.node` in the current directory.

## Development Setup

For dev mode, the compiled `.node` file should be placed at:

```
src/native/windows/raven-windows-audio.win32-x64-msvc.node
```

The TypeScript layer (`src/main/systemAudioNative.ts`) looks for it at this path first, falling back to the packaged resources directory for production builds.

## Exported Functions

| Function | Description |
|----------|-------------|
| `isSystemAudioAvailable()` | Returns `true` (WASAPI is always available on Windows) |
| `hasPermission()` | Returns `true` (no permissions needed on Windows) |
| `requestPermission()` | Returns `true` (no-op on Windows) |
| `isCapturing()` | Whether system audio loopback is currently active |
| `startSystemAudioCapture(callback)` | Start capturing system audio; callback receives `{ data: Buffer, timestamp: number }` |
| `stopSystemAudioCapture()` | Stop the system audio capture thread |
| `startMicCapture(callback)` | Start capturing microphone audio; callback receives `{ data: Buffer, timestamp: number }` |
| `stopMicCapture()` | Stop the microphone capture thread |

## Dependencies

- **napi** / **napi-derive** — Node.js native addon bindings
- **windows** (0.52) — Safe Rust bindings for Windows APIs (WASAPI, COM)
- **rubato** (0.14) — High-quality audio resampling

## Troubleshooting

- **No audio captured**: Ensure the default audio devices are set correctly in Windows Sound Settings
- **Build errors about Windows SDK**: Install the Windows SDK via Visual Studio Installer
- **`AUDCLNT_E_DEVICE_INVALIDATED`**: The audio device was disconnected; restart the capture
