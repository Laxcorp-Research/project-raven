# Project Raven 🦅

**AI-powered meeting assistant with real-time transcription and stealth mode**

An open-source desktop app that provides real-time audio transcription and AI-powered suggestions during meetings, interviews, and calls — completely invisible to screen sharing.

## ✨ Features

- **Real-time Transcription** — Dual-stream capture (your mic + system audio) with speaker separation
- **AI Suggestions** — Claude-powered responses with quick action chips (Assist, What to say, Follow-up, Recap)
- **Stealth Mode** — Invisible to Zoom, Meet, Teams, and Discord screen sharing
- **Multilingual** — Auto-detects language with Deepgram Nova-3
- **Local-First** — Your API keys, your data, stored locally

## 🛠 Tech Stack

- **Desktop:** Electron + React + TypeScript + Tailwind
- **Audio:** Swift native module with ScreenCaptureKit + Apple Voice Processing (AEC)
- **Transcription:** Deepgram Nova-3 (real-time WebSocket)
- **AI:** Claude claude-sonnet-4-20250514 (streaming responses)

## 📋 Requirements

- macOS 12+ (Monterey or later)
- Node.js 18+
- Deepgram API key ([get one free](https://console.deepgram.com))
- Anthropic API key ([get one here](https://console.anthropic.com))

## 🚀 Getting Started
```bash
# Clone the repo
git clone https://github.com/Laxcorp-Research/project-raven.git
cd project-raven

# Install dependencies
npm install

# Build the native Swift module
cd src/native/swift/AudioCapture
swift build -c release
cd ../../../..

# Run in development
npm run dev
```

On first launch, you'll be prompted to enter your Deepgram and Anthropic API keys.

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle Overlay | `Cmd + Shift + H` |
| Start/Stop Recording | `Cmd + Shift + R` |
| Get AI Suggestion | `Cmd + Enter` |

## 📦 Project Status

- [x] **Phase A:** Foundation (two-window architecture, onboarding, hotkeys)
- [x] **Phase B (macOS):** Audio engine with AEC, transcription, Claude AI
- [ ] **Phase B (Windows):** Windows audio capture (WASAPI + Voice Capture DSP)
- [ ] **Phase C:** Session management & history
- [ ] **Phase D:** Custom AI modes/profiles
- [ ] **Phase E:** Full settings UI
- [ ] **Phase F-J:** Distribution, backend, polish

## 🤝 Contributing

This project is in active development. Issues and PRs welcome!

## 📄 License

MIT
