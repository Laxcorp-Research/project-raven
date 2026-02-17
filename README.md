# Project Raven 🦅

**AI-powered meeting assistant with real-time transcription and stealth mode**

An open-source desktop app that provides real-time audio transcription and AI-powered suggestions during meetings, interviews, and calls — completely invisible to screen sharing.

## ✨ Features

- **Real-time Transcription** — Dual-stream capture (your mic + system audio) with speaker separation
- **AI Suggestions** — Claude or GPT-powered responses with quick action chips (Assist, What to say, Follow-up, Recap)
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

- Node.js 22+ (run `nvm use` if you have [nvm](https://github.com/nvm-sh/nvm) installed — the repo includes `.nvmrc`)
- Deepgram API key ([get one free](https://console.deepgram.com))
- Anthropic API key ([get one here](https://console.anthropic.com)) or OpenAI API key ([get one here](https://platform.openai.com))
- **macOS**: macOS 12+ (Monterey or later), Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Windows 10/11, Rust toolchain, Visual Studio Build Tools

## 🚀 Getting Started

### 1. Install Node.js 22

If you don't have Node.js 22+, install it using [nvm](https://github.com/nvm-sh/nvm) (recommended):

```bash
# Install nvm (skip if you already have it)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Restart your terminal, then:
nvm install 22
```

If you already have nvm, just run `nvm use` inside the project folder — it reads the `.nvmrc` file automatically.

### 2. Set up the project

#### macOS

```bash
# Clone the repo
git clone https://github.com/Laxcorp-Research/project-raven.git
cd project-raven

# Install dependencies (also rebuilds native modules for Electron automatically)
npm install

# Build the native Swift audio module
cd src/native/swift/AudioCapture
swift build -c release
cd ../../../..

# Run in development
npm run dev
```

#### Windows

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

On first launch, you'll be prompted to enter your API keys.

## ⌨️ Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle Overlay | `Cmd + \` |
| Start/Stop Recording | `Cmd + R` |
| Get AI Suggestion | `Cmd + Enter` |
| Clear Conversation | `Cmd + Shift + R` |
| Move Overlay | `Cmd + Arrow Keys` |
| Scroll Overlay | `Cmd + Shift + Up/Down` |

> On Windows, replace `Cmd` with `Ctrl`.

## 🧪 Testing

Raven has a comprehensive test suite: unit tests, integration tests, and end-to-end tests.

```bash
# Run all unit + integration tests (165 tests)
npm test

# Run with coverage report
npm run test:coverage

# Run only integration tests
npm run test:integration

# Run E2E tests (requires `npm run build` first)
npm run test:e2e

# Run everything (unit + integration + E2E)
npm run test:all
```

| Layer | Framework | Tests | What it covers |
|-------|-----------|-------|----------------|
| Unit | Vitest | 134 | AI providers, store, validators, sessions, transcription, RAG, auth, window manager |
| Integration | Vitest | 31 | AI pipeline end-to-end, session lifecycle, database CRUD, RAG pipeline |
| E2E | Playwright | 19 | Onboarding flow, dashboard, recording, window management, settings |

## 🔧 Troubleshooting

**`better-sqlite3` native module error:**

The `postinstall` script handles this automatically during `npm install`. If you still see `NODE_MODULE_VERSION` mismatch errors, run:

```bash
npx electron-rebuild -f -w better-sqlite3
```

**Reset everything (fresh start):**

Delete the config, database, and saved state to wipe all data and re-trigger onboarding:

```bash
# macOS
rm -rf ~/Library/Application\ Support/project-raven/
rm -rf ~/Library/Saved\ Application\ State/io.rave.desktop.savedState/

# Windows
rmdir /s /q "%APPDATA%\project-raven"
```

> This clears API keys, settings, and all session history. You'll start completely fresh.

**App shows "unexpectedly quit" on launch:**

This happens when a previous session crashed. Click "Don't Reopen" and the app will start normally. To prevent it, run the reset commands above.

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
