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
- **Audio (macOS):** Swift native module with ScreenCaptureKit + Apple Voice Processing (AEC)
- **Audio (Windows):** Rust native module with WASAPI loopback + microphone capture
- **Transcription:** Deepgram Nova-3 (real-time WebSocket)
- **AI:** Anthropic Claude / OpenAI GPT (streaming responses)

## 🖥 Platform Support

| Platform | System Audio | Microphone | Status |
|----------|-------------|------------|--------|
| **macOS 12+** | ScreenCaptureKit | AVFoundation Voice Processing | Primary, fully tested |
| **Windows 10/11** | WASAPI Loopback | WASAPI Capture | Supported, requires building native module |
| Linux | — | — | Not yet supported |

## 📋 Requirements

- Node.js 18+
- Deepgram API key ([get one free](https://console.deepgram.com))
- Anthropic API key ([get one here](https://console.anthropic.com)) or OpenAI API key ([get one here](https://platform.openai.com))
- **macOS**: macOS 12+ (Monterey or later), Xcode Command Line Tools
- **Windows**: Windows 10/11, Rust toolchain, Visual Studio Build Tools

## 🚀 Getting Started

### macOS

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

### Windows

```bash
# Clone the repo
git clone https://github.com/Laxcorp-Research/project-raven.git
cd project-raven

# Install dependencies
npm install

# Install NAPI-RS CLI and build the native Rust module
npm install -g @napi-rs/cli
cd src/native/windows
napi build --platform --release
cd ../../..

# Run in development
npm run dev
```

> See [`src/native/windows/README.md`](src/native/windows/README.md) for detailed build prerequisites and troubleshooting.

**`better-sqlite3` native module error:**

If you see `NODE_MODULE_VERSION` mismatch errors after `npm install`, rebuild the native module for Electron:

```bash
npx electron-rebuild -f -w better-sqlite3
```

On first launch, you'll be prompted to enter your API keys.

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle Overlay | `Cmd + Shift + H` |
| Start/Stop Recording | `Cmd + Shift + R` |
| Get AI Suggestion | `Cmd + Enter` |

## 🔧 Troubleshooting

**Reset everything (fresh start):**

Delete the config and database to wipe all data and re-trigger onboarding:

```bash
# macOS
rm ~/Library/Application\ Support/project-raven/raven-config.json
rm ~/Library/Application\ Support/project-raven/data/raven.db*

# Windows
del %APPDATA%\project-raven\raven-config.json
del %APPDATA%\project-raven\data\raven.db*
```

> This clears API keys, settings, and all session history. You'll start completely fresh.

## 📦 Project Status

- [x] **Phase A:** Foundation (two-window architecture, onboarding, hotkeys)
- [x] **Phase B (macOS):** Audio engine with AEC, transcription, AI suggestions
- [x] **Phase B (Windows):** Windows audio capture (WASAPI loopback + mic)
- [x] **Phase C:** Session management & history
- [x] **Phase D:** Custom AI modes/profiles
- [x] **Phase E:** Full settings UI
- [ ] **Phase F-J:** Distribution, backend, polish

## 🤝 Contributing

This project is in active development. Issues and PRs welcome!

## 📄 License

MIT
