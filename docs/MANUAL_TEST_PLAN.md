# Manual local-mode test plan

Automated mocks do not validate real WASAPI hardware, meeting applications, GPU acceleration, screen sharing, recording, or content protection. Record every result and failure evidence.

## Environment record

| Field | Value |
|---|---|
| Windows version | |
| Electron version | 40.4.1 baseline |
| Teams / Zoom versions | |
| GPU / driver | |
| Audio devices / headset | |
| WhisperLiveKit / STT model | 0.2.24 / base.en default |
| Ollama / model | |
| Transcript / AI latency | |
| CPU / GPU / RAM usage | |
| Dropped audio / duplicate transcripts | |
| Remote overlay visibility | |

## Procedure

1. Verify Windows 11 version and updates.
2. Build/load Raven's Windows WASAPI native module.
3. Build/load Raven's GStreamer AEC native module.
4. Run Python runtime setup and dependency check.
5. Explicitly download/check the WLK base.en model.
6. Install/start Ollama.
7. Explicitly install/select Ollama text and vision models.
8. Pass in-app WLK/Ollama health, model, capability, and readiness checks.
9. Run a Teams call with a second account; validate mic=`you`, system=`them`.
10. Repeat with Zoom and a second account.
11. Validate simultaneous separate microphone/system transcripts and final flush.
12. Repeat with a headset; confirm AEC and speaker mapping.
13. Switch audio input/output devices during a session and record recovery.
14. Run a 20-minute stability/latency/resource test.
15. Run a one-hour stability/latency/resource test.
16. Restart Ollama mid-session; verify actionable error, cancellation, and manual recovery without cloud fallback.
17. Restart/kill WLK mid-session; verify one restart, bounded buffering, and recovery/failure state.
18. Verify overlay hide/show and suggestion/cancel shortcuts.
19. Share a Teams window and verify overlay visibility behavior.
20. Share a Teams screen and repeat for Zoom window/entire-screen sharing.
21. Record in Teams and Zoom; inspect the recording from another device/account.
22. Test OBS display capture.
23. Test OBS window capture.
24. Test Windows Snipping Tool capture.
25. Exit normally and after a forced local-service fault; verify no WLK descendants remain.

Content-protection behavior remains **manually unverified** until the share/recording/capture output is checked from another device.
