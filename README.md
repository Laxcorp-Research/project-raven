<p align="center">
  <img src="logo/raven_full.svg" alt="Project Raven" height="80" />
</p>

<p align="center">
  <strong>Open-source, AI-powered meeting copilot with real-time transcription and echo cancellation.</strong>
</p>

Raven captures system audio and microphone during meetings, cancels echo so speaker audio doesn't bleed into your mic, transcribes both sides of the conversation in real-time via Deepgram, and gives you AI assistance (Claude or OpenAI) with context-aware responses — all running locally on your desktop.

---

## Screenshots

<table>
<tr>
<td width="50%">

**Dashboard — Session History**
![Dashboard](docs/sessions.png)

</td>
<td width="50%">

**Settings — API Keys**
![API Keys](docs/API-Keys.png)

</td>
</tr>
<tr>
<td>

**Stealth Mode OFF — Overlay visible to screen share**
![Detectable](docs/Detectable.jpeg)

</td>
<td>

**Stealth Mode ON — Overlay invisible to screen share**
![Undetectable](docs/Undetectable.jpeg)

</td>
</tr>
<tr>
<td>

**Settings — Model Selection**
![Model Selection](docs/Model-Selection.png)

</td>
<td>

**Onboarding — Overlay Tour**
![Overlay Tour](docs/onboarding-4.png)

</td>
</tr>
</table>

<details>
<summary>Full onboarding flow (6 steps)</summary>

| Step 1: Welcome | Step 2: API Keys | Step 3: Permissions |
|---|---|---|
| ![Welcome](docs/onboarding-1.png) | ![API Keys](docs/onboarding-2.png) | ![Permissions](docs/onboarding-3.png) |

| Step 4: Overlay Tour | Step 5: Shortcuts | Step 6: Ready to Go |
|---|---|---|
| ![Overlay Tour](docs/onboarding-4.png) | ![Shortcuts](docs/onboarding-5.png) | ![Ready](docs/onboarding-6.png) |

</details>

---

## Features

- **Dual-stream audio capture** — System audio + microphone, captured natively on macOS (ScreenCaptureKit) and Windows (WASAPI)
- **Echo cancellation** — GStreamer pipeline using the WebRTC AEC3 engine (the same echo canceller used in Chrome)
- **Real-time transcription** — Deepgram Nova-3 over WebSocket with separate connections for mic and system audio
- **AI assistance** — Anthropic Claude or OpenAI, user-configurable via a provider pattern
- **Stealth overlay** — Invisible to Zoom, Meet, Teams, and Discord screen sharing
- **Local-first** — Your API keys and data stay on your machine (SQLite via better-sqlite3)
- **RAG** — Upload local documents, embedded with `@xenova/transformers`, and reference them in AI context
- **Sessions** — Auto-saved with full transcript, AI responses, and summaries
- **Modes** — Customizable AI behavior profiles with system prompts and quick actions
- **Profile picture editor** — Crop, zoom, and pan before saving your avatar
- **Pro features** — Optional auth, billing, and sync for a paid tier (connects to a separate backend)

## Architecture

![Architecture](docs/architecture.png)

## How It Works

1. User starts a recording session
2. A native binary captures system audio and microphone simultaneously
   - **macOS:** Swift process using ScreenCaptureKit (system) + CoreAudio (mic)
   - **Windows:** Rust/NAPI-RS module using WASAPI loopback + capture
3. Both streams are fed into a GStreamer echo-cancellation pipeline (`webrtcechoprobe` / `webrtcdsp`) so the remote speaker's voice doesn't contaminate the mic signal
4. The clean mic audio and system audio are sent over two parallel WebSocket connections to Deepgram Nova-3 for transcription
5. Transcripts appear in real-time in the overlay window
6. The user can ask AI (Claude or OpenAI) for help, with full conversation context

## Project Structure

```
src/
├── main/                  # Electron main process
│   ├── audioManager.ts    #   Audio capture orchestration
│   ├── transcriptionService.ts  #   Deepgram WebSocket connections
│   ├── aiService.ts       #   AI provider abstraction (Claude / OpenAI)
│   ├── sessionManager.ts  #   Session persistence & history
│   ├── store.ts           #   SQLite database (better-sqlite3)
│   └── index.ts           #   App lifecycle, IPC handlers, windows
├── renderer/              # React UI (Vite + Tailwind)
│   └── src/
│       ├── components/    #   Dashboard, overlay, settings, onboarding
│       └── ...
├── preload/               # Electron preload scripts (context bridge)
└── native/
    ├── swift/             # macOS audio capture (ScreenCaptureKit + CoreAudio)
    │   └── AudioCapture/
    ├── windows/           # Windows audio capture (WASAPI, Rust/NAPI-RS)
    └── aec/               # GStreamer AEC C++ addon (WebRTC AEC3)
```

## Platform Support

| Platform | System Audio | Microphone | Echo Cancellation | Status |
|----------|-------------|------------|-------------------|--------|
| **macOS 12+** | ScreenCaptureKit | CoreAudio | GStreamer AEC3 | Primary, fully tested |
| **Windows 10/11** | WASAPI Loopback | WASAPI Capture | GStreamer AEC3 | Supported |
| Linux | — | — | — | Not yet supported |

## Getting Started

This section is a complete, linear walkthrough — from a fresh machine to a running app. Pick your platform, follow every numbered step in order, and verify each one before moving on.

> **API keys** (entered in-app on first launch — nothing to configure beforehand):
>
> - [Deepgram](https://console.deepgram.com) — real-time transcription (free tier available)
> - [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com) — AI assistance
>
> This guide covers the open-source app. For the premium/pro mode setup, see [`docs/REPO_STRUCTURE.md`](docs/REPO_STRUCTURE.md).

---

### macOS Setup

> Tested on macOS 12 (Monterey) through macOS 15 (Sequoia), Intel and Apple Silicon.

**Step 1 — Install Xcode Command Line Tools**

```bash
xcode-select --install
```

A system dialog will appear — click **Install** and wait for it to finish (~2 min).

Verify:
```bash
xcode-select -p
# Expected: /Library/Developer/CommandLineTools  (or an Xcode.app path)
```

> **If you see** `xcode-select: error: command line tools are already installed` — you're good, move on.

---

**Step 2 — Install Node.js 22**

Install via [nvm](https://github.com/nvm-sh/nvm) (recommended). Skip the `curl` line if you already have nvm.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

**Close and reopen your terminal**, then:

```bash
nvm install 22
nvm use 22
```

Verify:
```bash
node -v
# Expected: v22.x.x (any 22+ version)
```

> **If `nvm: command not found`:** Close your terminal and open a new one — nvm's install script adds itself to your shell profile, but only new shells pick it up.

---

**Step 3 — Install GStreamer**

```bash
brew install gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad
```

> Don't have Homebrew? Install it first from [brew.sh](https://brew.sh).

Verify:
```bash
pkg-config --modversion gstreamer-1.0
# Expected: 1.24.x (or similar)
```

> **If `Package gstreamer-1.0 was not found`:** Homebrew's `pkg-config` path isn't set. Add the correct line to your `~/.zshrc` and restart your terminal:
> ```bash
> # Apple Silicon (M1/M2/M3/M4):
> echo 'export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig:$PKG_CONFIG_PATH"' >> ~/.zshrc
>
> # Intel Mac:
> echo 'export PKG_CONFIG_PATH="/usr/local/lib/pkgconfig:$PKG_CONFIG_PATH"' >> ~/.zshrc
> ```

---

**Step 4 — Clone the repo and install dependencies**

```bash
git clone https://github.com/Laxcorp-Research/project-raven.git
cd project-raven
npm install
```

`npm install` takes a few minutes. It automatically rebuilds `better-sqlite3` for Electron via the `postinstall` script — you'll see `@electron/rebuild` output near the end.

Verify:
```bash
ls node_modules/.package-lock.json && echo "OK"
# Expected: OK
```

> **If `npm install` fails with `node-gyp` errors:** Make sure Xcode Command Line Tools installed successfully in Step 1. Run `xcode-select -p` to confirm.

---

**Step 5 — Build the GStreamer echo-cancellation addon**

```bash
cd src/native/aec
npm install
./build-deps.sh
npx cmake-js compile
cd ../../..
```

What this does:
1. Installs the addon's build tools (`cmake-js`, `node-addon-api`)
2. Verifies all GStreamer libraries and builds the WebRTC DSP plugin from source (Homebrew doesn't ship it)
3. Compiles the C++ echo-cancellation native module

Verify:
```bash
ls src/native/aec/build/Release/raven-aec.node && echo "OK"
# Expected: OK
```

> **If `build-deps.sh` fails with "gstreamer-1.0 not found":** Revisit Step 3 and make sure `pkg-config --modversion gstreamer-1.0` works.
>
> **If `cmake-js compile` fails with "cmake not found":** cmake is bundled with cmake-js. Run `npx cmake-js --version` — if that fails, delete `node_modules` inside `src/native/aec/` and re-run `npm install`.

---

**Step 6 — Build the Swift audio capture binary**

```bash
cd src/native/swift/AudioCapture
swift build -c release
cd ../../../..
```

Verify:
```bash
ls src/native/swift/AudioCapture/.build/release/audiocapture && echo "OK"
# Expected: OK
```

> **If `swift build` fails with unresolved imports:** Your Swift toolchain may be too old (5.9+ required). Check with `swift --version`. Update Xcode Command Line Tools:
> ```bash
> sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install
> ```

---

**Step 7 — Run the app**

```bash
npm run dev
```

The Electron app opens. On first launch you'll be prompted to enter your API keys in the settings.

> **If the app starts but audio capture doesn't work:** macOS requires explicit permissions. Go to **System Settings → Privacy & Security** and grant both **Microphone** and **Screen Recording** access to the app (or to your terminal emulator during development).

---

### Windows Setup

> Tested on Windows 10 (21H2+) and Windows 11. Commands work in both **PowerShell** and **Command Prompt (CMD)**. Where syntax differs, both variants are shown.

**Step 1 — Install Visual Studio Build Tools**

Download and run the [Visual Studio Build Tools installer](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

In the installer, check the **"Desktop development with C++"** workload and click Install. Make sure these optional components are selected (they should be by default):
- MSVC Build Tools for x64/x86 (Latest)
- Windows 10/11 SDK
- C++ CMake tools for Windows

After the install finishes, **tell npm which version you installed** — this is required for `node-gyp` to find it:

```
npm config set msvs_version 2022
```

> **Why this is necessary:** `node-gyp` (the tool that compiles native modules during `npm install`) uses a Visual Studio finder that often fails to auto-detect Build Tools. Without this config, you'll get `Could not find any Visual Studio installation to use` even though the tools are installed. This is a one-time global npm setting.

Verify:
```
npm config get msvs_version
# Expected: 2022
```

Also confirm the Build Tools are actually installed:
```powershell
# PowerShell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -products * -requires Microsoft.VisualStudio.Workload.VCTools -property displayName
```
```cmd
rem CMD
"%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe" -products * -requires Microsoft.VisualStudio.Workload.VCTools -property displayName
```
Expected: `Visual Studio Build Tools 2022` (or `Visual Studio Community/Professional/Enterprise 2022`).

> **If `vswhere.exe` is not found:** The Visual Studio Installer itself didn't install correctly. Re-download and run the [Build Tools installer](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
>
> **If you have full Visual Studio** (not just Build Tools) with the C++ workload, that works too — just make sure you still run `npm config set msvs_version 2022`.

---

**Step 2 — Install Node.js 22**

Option A — [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) (recommended):

Download and run the latest `nvm-setup.exe`, then open a **new** terminal:

```
nvm install 22
nvm use 22
```

Option B — Download the LTS 22.x MSI installer directly from [nodejs.org](https://nodejs.org/).

Verify (open a **new** terminal):
```
node -v
# Expected: v22.x.x
```

> **If `node` is not recognized:** Restart your terminal. If it still doesn't work, the Node.js installer may not have added itself to PATH — reinstall with the "Add to PATH" option checked.

---

**Step 3 — Install the Rust toolchain**

Download and run [rustup-init.exe](https://rustup.rs/). Accept the defaults (installs `stable-msvc`).

Verify (open a **new** terminal):
```
rustc --version
# Expected: rustc 1.xx.x (...)
cargo --version
# Expected: cargo 1.xx.x (...)
```

Make sure you're on the MSVC target:
```
rustup default stable-msvc
```

> **If `rustc` is not found:** Restart your terminal. The installer adds `%USERPROFILE%\.cargo\bin` to your PATH, but only new shells pick it up.

---

**Step 4 — Install GStreamer (MSVC)**

Download **both** MSI installers from [gstreamer.freedesktop.org/download](https://gstreamer.freedesktop.org/download/) — pick the **MSVC 64-bit (x86_64)** variants:

1. **Runtime** — `gstreamer-1.0-msvc-x86_64-X.XX.X.msi`
2. **Development** — `gstreamer-1.0-devel-msvc-x86_64-X.XX.X.msi`

Run both with default settings (installs to `C:\gstreamer\`).

Verify (open a **new** terminal — the installer sets an environment variable):
```powershell
# PowerShell
echo $env:GSTREAMER_1_0_ROOT_MSVC_X86_64
```
```cmd
rem CMD
echo %GSTREAMER_1_0_ROOT_MSVC_X86_64%
```
Expected: `C:\gstreamer\1.0\msvc_x86_64\` (or similar).

> **If the variable is empty:** The installer didn't set it. Set it manually and restart your terminal:
> ```powershell
> # PowerShell
> [Environment]::SetEnvironmentVariable("GSTREAMER_1_0_ROOT_MSVC_X86_64", "C:\gstreamer\1.0\msvc_x86_64\", "User")
> ```
> ```cmd
> rem CMD
> setx GSTREAMER_1_0_ROOT_MSVC_X86_64 "C:\gstreamer\1.0\msvc_x86_64\"
> ```

---

**Step 5 — Install the NAPI-RS CLI**

```
npm install -g @napi-rs/cli
```

Verify:
```
napi --version
# Expected: a version number like 3.x.x
```

> **If `napi` is not recognized:** npm's global bin directory isn't on your PATH. Find it with `npm config get prefix` and add the result to your PATH.

---

**Step 6 — Clone the repo and install dependencies**

```
git clone https://github.com/Laxcorp-Research/project-raven.git
cd project-raven
npm install
```

`npm install` takes a few minutes. It automatically rebuilds `better-sqlite3` for Electron via the `postinstall` script.

Verify:
```powershell
# PowerShell
Test-Path node_modules\.package-lock.json
# Expected: True
```
```cmd
rem CMD
if exist node_modules\.package-lock.json (echo OK) else (echo MISSING)
rem Expected: OK
```

> **If you see `Could not find any Visual Studio installation to use`:** This is the most common Windows setup error. It means `node-gyp` can't find your Build Tools. Fix:
> ```
> npm config set msvs_version 2022
> ```
> Then delete `node_modules` and re-run `npm install`:
> ```powershell
> # PowerShell
> Remove-Item -Recurse -Force node_modules
> npm install
> ```
> ```cmd
> rem CMD
> rmdir /s /q node_modules
> npm install
> ```
> If it still fails, verify Build Tools are installed by running the `vswhere.exe` command from Step 1.
>
> **If `npm install` fails with other `node-gyp` or MSBuild errors:** Make sure the "Desktop development with C++" workload is installed with the Windows SDK component (Step 1).

---

**Step 7 — Build the GStreamer echo-cancellation addon**

```
cd src\native\aec
npm install
npx cmake-js compile
cd ..\..\..
```

> **Note:** The `build-deps.sh` script is macOS-only. On Windows, the GStreamer MSVC installer already includes all required plugins (including WebRTC DSP).

Verify:
```powershell
# PowerShell
Test-Path src\native\aec\build\Release\raven-aec.node
# Expected: True
```
```cmd
rem CMD
if exist src\native\aec\build\Release\raven-aec.node (echo OK) else (echo MISSING)
rem Expected: OK
```

> **If cmake-js fails with "GStreamer not found":** The `GSTREAMER_1_0_ROOT_MSVC_X86_64` environment variable is not set. Revisit Step 4.

---

**Step 8 — Build the Windows audio capture module**

```
cd src\native\windows
npm install
napi build --platform --release
cd ..\..\..
```

Verify:
```powershell
# PowerShell
Test-Path src\native\windows\raven-windows-audio.win32-x64-msvc.node
# Expected: True
```
```cmd
rem CMD
if exist src\native\windows\raven-windows-audio.win32-x64-msvc.node (echo OK) else (echo MISSING)
rem Expected: OK
```

> **If the build fails with linker errors:** Make sure Rust is using the MSVC target. Run `rustup show` — the default toolchain should show `stable-x86_64-pc-windows-msvc`. If not, run `rustup default stable-msvc`.
>
> **If it fails with "Windows SDK not found":** Open **Visual Studio Installer → Modify → Individual components** and install the latest "Windows 10 SDK" or "Windows 11 SDK".
>
> See [`src/native/windows/README.md`](src/native/windows/README.md) for more details.

---

**Step 9 — Run the app**

```
npm run dev
```

The Electron app opens. On first launch you'll be prompted to enter your API keys in the settings.

> **If the app starts but audio capture doesn't work:** Check **Settings → Sound** and make sure the correct playback and recording devices are set as default. WASAPI captures from the default devices.

---

### Setup Troubleshooting Quick Reference

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Could not find any Visual Studio installation to use` | `node-gyp` can't auto-detect Build Tools | `npm config set msvs_version 2022`, then delete `node_modules` and re-run `npm install` |
| `npm install` fails with `node-gyp` errors | Missing C/C++ build tools | **macOS:** `xcode-select --install` **Windows:** VS Build Tools "Desktop development with C++" workload |
| `NODE_MODULE_VERSION mismatch` at runtime | Native module built for wrong Electron version | `npx @electron/rebuild -f -w better-sqlite3` from the project root |
| `build-deps.sh`: "gstreamer-1.0 not found" | GStreamer not installed or `pkg-config` can't find it | **macOS:** Install via Homebrew and check `PKG_CONFIG_PATH` (see macOS Step 3) |
| cmake-js: "GStreamer not found" on Windows | `GSTREAMER_1_0_ROOT_MSVC_X86_64` not set | Install both GStreamer MSI packages and restart PowerShell (see Windows Step 4) |
| `swift build` fails | Swift toolchain too old (need 5.9+) | `sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install` |
| `napi build` linker errors on Windows | Wrong Rust target or missing Windows SDK | `rustup default stable-msvc` and ensure VS Build Tools C++ workload is installed |
| App starts, no audio on macOS | Missing system permissions | **System Settings → Privacy & Security**: grant **Microphone** and **Screen Recording** |
| App starts, no audio on Windows | Wrong default audio device | **Settings → Sound**: set correct default playback/recording devices |

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle Overlay | `Cmd + \` |
| Start/Stop Recording | `Cmd + R` |
| Get AI Suggestion | `Cmd + Enter` |
| Clear Conversation | `Cmd + Shift + R` |
| Move Overlay | `Cmd + Arrow Keys` |
| Scroll Overlay | `Cmd + Shift + Up/Down` |

> On Windows, replace `Cmd` with `Ctrl`.

## Testing

```bash
npm test              # Unit + integration tests
npm run test:coverage # With coverage report
npm run test:e2e      # End-to-end (requires npm run build first)
npm run test:all      # Everything
```

## Troubleshooting

**`better-sqlite3` native module error:**

The `postinstall` script handles this automatically. If you still see `NODE_MODULE_VERSION` mismatch errors:

```bash
npx @electron/rebuild -f -w better-sqlite3
```

**Reset all data (fresh start):**

```bash
# macOS
rm -rf ~/Library/Application\ Support/project-raven/

# Windows
rmdir /s /q "%APPDATA%\project-raven"
```

## Contributing

Issues and pull requests are welcome. This project is in active development.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a pull request

## License

[MIT](LICENSE)
