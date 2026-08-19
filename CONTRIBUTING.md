# Contributing to Raven

Thanks for your interest in contributing to Raven! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 22+ (use `nvm use` -- the repo includes `.nvmrc`)
- npm 10+
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

## Testing

Always run the test suite before opening a PR.

### Unit & Integration Tests

```bash
# Run all unit + integration tests
npm test

# Run tests in watch mode during development
npm run test:watch

# Run with coverage report (outputs to coverage/)
npm run test:coverage

# Run only the integration tests
npm run test:integration
```

Tests live in `src/main/__tests__/`:

```
src/main/__tests__/
  # Unit tests (one per module)
  providerFactory.test.ts
  anthropicProvider.test.ts
  openaiProvider.test.ts
  ragService.test.ts
  authService.test.ts
  builtinModes.test.ts
  windowManager.test.ts
  validators.test.ts
  sessionManager.test.ts
  claudeService.test.ts
  summaryService.test.ts
  transcriptionService.test.ts
  database.test.ts
  store.test.ts
  logger.test.ts
  # Integration tests
  integration/
    aiPipeline.test.ts
    sessionLifecycle.test.ts
    databaseRoundTrip.test.ts
    ragPipeline.test.ts
```

### E2E Tests

E2E tests use Playwright for Electron and require a built app:

```bash
# Build the app first
npm run build

# Run E2E tests
npm run test:e2e
```

E2E specs live in `e2e/` and cover onboarding, dashboard, recording, window management, and settings.

### Writing Tests

- **Unit tests:** Mock all external dependencies (Electron APIs, SDKs, database). Follow the patterns in existing test files using `vi.hoisted()` + `vi.mock()`.
- **Integration tests:** Mock only the outermost boundaries (SDK HTTP calls, filesystem). Let multiple real modules work together.
- **E2E tests:** Test the actual built Electron app via Playwright. Use the shared fixture from `e2e/fixtures/electronApp.ts`.

## Releasing

Mac installers are **Developer ID–signed and notarized**. Apple certificates stay on `Laxcorp-Research/project-raven-private`; this public repo only starts that job and receives the artifacts.

### Cut a release

1. Bump `version` in `package.json` (and lockfile if needed). Merge to `main`.
2. Tag that commit `vX.Y.Z` (must match `package.json`).
3. **Publish a GitHub Release** on `Laxcorp-Research/project-raven` for that tag (GitHub UI or `gh release create vX.Y.Z`). Do **not** mark it as a prerelease if you want a Mac DMG.

Publishing the release is the trigger. You do not pack the Mac DMG on your laptop.

### What CI does (Mac)

1. Public workflow **Dispatch notarized Mac release** (`.github/workflows/dispatch-mac-release.yml`) runs on `release: published`.
2. It starts **Release OSS macOS** on `project-raven-private` (`release-oss-macos.yml`), packing this repo at the tag.
3. `electron-builder` signs with the Laxcorp Developer ID and notarizes (`-c.mac.notarize=true`).
4. The job uploads to the **same public release**:
   - `Raven-Mac-{version}-Installer.dmg` (+ `.blockmap`)
   - `Raven-Mac-{version}-Installer.zip` (+ `.blockmap`)
   - `latest-mac.yml`

Watch **Release OSS macOS** on the private repo until it is green. Confirm `spctl -a -vv -t install` on `Raven.app` inside the DMG shows `source=Notarized Developer ID`.

To retry without a new tag: **Actions → Dispatch notarized Mac release → Run workflow** with the existing tag (ref defaults to the tag).

### Secrets (one-time)

| Secret | Repo | Purpose |
|--------|------|---------|
| `PRIVATE_DISPATCH_TOKEN` | **public** `project-raven` | PAT: Actions read/write on `project-raven-private` (so this repo can start the pack). |
| `MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | **private** `project-raven-private` | Developer ID + notarytool (same as Pro). |
| `OSS_RELEASE_GITHUB_TOKEN` | **private** `project-raven-private` | PAT: Contents write on public `project-raven` (attach files to the GitHub Release). |

Do not put the Apple `.p12` on the public repo. Prefer fine-grained PATs over a `gh auth` OAuth token (OAuth tokens die if you log out of `gh`).

If notarytool returns **HTTP 403 agreement missing or expired**, the Account Holder must re-accept **Free Apps** in [App Store Connect → Agreements](https://appstoreconnect.apple.com/agreements). Skip Paid Apps bank/tax/DSA unless you actually sell on the App Store.

### Windows

NSIS is still packed on a **local Windows machine** (GStreamer + WASAPI). Upload `Raven-Windows-{version}-Setup.exe`, its `.blockmap`, and `latest.yml` to the same GitHub Release. Do not replace the Mac assets.

### What this does not do

- Merging to `main` does not build a DMG.
- Same-version clobber does not prompt installs already on that version (updater only offers a **newer** semver).
- Packaged Mac still uses the GitHub DMG flow, not ShipIt, until that is turned on separately.

## Pull Request Process

1. Fork the repository and create your branch from `main`
2. Make your changes with clear, focused commits
3. Ensure `npm test` passes (all unit + integration tests)
4. Ensure `npm run lint` passes
5. Add tests for new features or bug fixes
6. Update documentation if you changed any user-facing behavior
7. Open a PR with a clear title and description of what changed and why
8. Link any related issues

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
