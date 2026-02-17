# Contributing to Raven

Thanks for your interest in contributing to Raven! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- API keys: [Deepgram](https://deepgram.com), and [Anthropic](https://anthropic.com) or [OpenAI](https://openai.com)
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Windows**: Rust toolchain ([rustup](https://rustup.rs/)), Visual Studio Build Tools with "Desktop development with C++" workload

### Getting Started (macOS)

```bash
# Clone the repo
git clone https://github.com/Laxcorp-Research/project-raven.git
cd project-raven

# Install dependencies
npm install

# Build the native Swift audio capture module
cd src/native/swift/AudioCapture
swift build -c release
cd ../../../..

# Start the dev server
npm run dev
```

### Getting Started (Windows)

```bash
# Clone the repo
git clone https://github.com/Laxcorp-Research/project-raven.git
cd project-raven

# Install dependencies
npm install

# Install the NAPI-RS CLI globally
npm install -g @napi-rs/cli

# Build the native Rust audio module
cd src/native/windows
napi build --platform --release
cd ../../..

# Start the dev server
npm run dev
```

> **Note**: The Rust module requires the Windows SDK. Install Visual Studio Build Tools with the "Desktop development with C++" workload. See [`src/native/windows/README.md`](src/native/windows/README.md) for detailed build instructions.

The app will open with an onboarding flow where you can enter your API keys.

## Making Changes

### Branch Naming

- `feat/description` for new features
- `fix/description` for bug fixes
- `docs/description` for documentation
- `refactor/description` for code refactoring

### Code Style

- TypeScript strict mode where possible
- Avoid `any` types — use `unknown` for catch blocks
- Use Tailwind CSS for styling (no inline styles or CSS modules)
- Follow existing patterns in the codebase
- Run `npm run lint` before committing

### Commit Messages

Use clear, concise commit messages:

```
feat: add speaker diarization support
fix: resolve transcript duplication on session stop
docs: update API key setup instructions
refactor: extract audio capture into separate service
```

### Project Structure

```
src/
  main/           # Electron main process
    services/     # Core services (database, sessions, AI, RAG)
    claudeService.ts
    transcriptionService.ts
    audioManager.ts
    store.ts
  preload/        # Electron preload scripts (IPC bridge)
  renderer/       # React frontend
    src/
      components/
        dashboard/  # Dashboard UI components
        overlay/    # Overlay UI components
      types/        # TypeScript type definitions
  native/
    swift/        # macOS audio capture (ScreenCaptureKit + AVFoundation)
    windows/      # Windows audio capture (WASAPI via Rust/NAPI-RS)
```

## Pull Request Process

1. Fork the repository and create your branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `npm run lint` passes
4. Update documentation if you changed any user-facing behavior
5. Open a PR with a clear title and description of what changed and why
6. Link any related issues

## Reporting Bugs

Open an issue on GitHub with:

- Steps to reproduce
- Expected vs actual behavior
- OS version (macOS/Windows) and Raven version
- Console logs if relevant (View > Toggle Developer Tools)

## Feature Requests

Open a GitHub Discussion or Issue with:

- What problem it solves
- Proposed solution or approach
- Whether you're willing to implement it

## Questions?

Open a [GitHub Discussion](https://github.com/Laxcorp-Research/project-raven/discussions) — we're happy to help.
