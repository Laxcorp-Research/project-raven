# WebRTC Audio Processing (AEC3)

This directory contains WebRTC's audio processing module, specifically the AEC3 (Acoustic Echo Cancellation) component.

## What is AEC3?

AEC3 is WebRTC's third-generation echo canceller. It removes speaker audio that bleeds into the microphone, enabling clean voice capture even when using speakers instead of headphones.

## Architecture
```
System Audio (speakers) ──► aec_process_render() ──┐
                                                   ├──► AEC Algorithm
Microphone Audio ─────────► aec_process_capture() ─┘
                                                   │
                                                   ▼
                                          Clean Mic Output
                                          (echo removed)
```

## Building

### macOS (Universal Binary)
```bash
cd src/native/webrtc-aec
mkdir -p build && cd build
cmake .. -DCMAKE_OSX_ARCHITECTURES="x86_64;arm64"
make -j$(sysctl -n hw.ncpu)
```

### Windows (x64)
```bash
cd src/native/webrtc-aec
mkdir build && cd build
cmake .. -G "Visual Studio 17 2022" -A x64
cmake --build . --config Release
```

## Pre-built Libraries

Pre-built libraries are included in `lib/` for CI convenience:
- `lib/macos/libwebrtc_audio_processing.a` - Universal (x86_64 + arm64)
- `lib/windows/webrtc_audio_processing.lib` - x64

## C API

The C API (`include/aec_api.h`) provides a simple interface:
- `raven_aec_create()` - Create AEC processor
- `raven_aec_destroy()` - Clean up
- `raven_aec_process_render()` - Feed speaker/system audio (reference)
- `raven_aec_process_capture()` - Process mic audio, get clean output
- `raven_aec_set_stream_delay()` - Set estimated delay if known

## Source

Based on WebRTC M124 audio processing module.
Original: https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/
