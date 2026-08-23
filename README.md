<p align="center">
  <img src="logo/raven_full.svg" alt="Project Raven" height="80" />
</p>

<p align="center">
  <strong>Open-source meeting copilot: dual-stream capture, local echo cancellation, BYOK transcription and AI.</strong>
</p>

Raven is an Electron desktop app. It captures microphone and system audio, cancels echo on your machine, transcribes **You** and **Them** on two parallel streams, and answers from the live transcript. You bring your own API keys. This build has **no Raven account, no hosted backend, and no cloud session sync**.

Capture, echo cancellation, SQLite history, and document RAG run locally. Microphone/system audio goes to **Deepgram** or **AssemblyAI**. Assist prompts (transcript excerpts, chat, optional screenshot, retrieved docs) go to **Anthropic** or **OpenAI**.

<p align="center">
  <a href="#download"><strong>Download</strong></a> &nbsp;|&nbsp;
  <a href="https://github.com/Laxcorp-Research/project-raven/releases"><strong>Releases</strong></a> &nbsp;|&nbsp;
  <a href="https://github.com/Laxcorp-Research/project-raven/issues"><strong>Issues</strong></a>
</p>

---

## Download

Prebuilt installers are on the [latest GitHub Release](https://github.com/Laxcorp-Research/project-raven/releases/latest). Enter your own API keys in Settings on first launch.

| Platform | Installer |
|----------|-----------|
| **Windows 10/11 (x64)** | [Raven-Windows-2.3.11-Setup.exe](https://github.com/Laxcorp-Research/project-raven/releases/download/v2.3.11/Raven-Windows-2.3.11-Setup.exe) |
| **macOS 12+ (Apple Silicon)** | [Raven-Mac-2.3.12-Installer.dmg](https://github.com/Laxcorp-Research/project-raven/releases/download/v2.3.12/Raven-Mac-2.3.12-Installer.dmg) |

**Windows:** run the setup executable. SmartScreen may warn on an unsigned OSS build — choose **More info → Run anyway**.

**macOS:** open the DMG, drag Raven to Applications, then open it. Intel Macs are not in this DMG — build from source below.

Installed copies check GitHub Releases for updates (`latest.yml` on Windows, `latest-mac.yml` on macOS). The in-app updater offers a build only when the published version is **newer** than the one you have. Maintainers: publishing a GitHub Release notarizes and attaches the Mac DMG — see [Releasing](CONTRIBUTING.md#releasing).

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
![Detectable](docs/Detectable.png)

</td>
<td>

**Stealth Mode ON — Overlay invisible to screen share**
![Undetectable](docs/Undetectable.png)

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

- **Dual-stream capture** — System audio + microphone. macOS uses ScreenCaptureKit + CoreAudio; Windows uses WASAPI loopback + capture (Rust/NAPI).
- **Echo cancellation** — GStreamer `webrtcechoprobe` / `webrtcdsp` (WebRTC AEC3), then a **residual echo gate** that drops mic chunks that still look like speaker bleed before they reach STT.
- **Real-time transcription** — Two streams: **You** (cleaned mic) and **Them** (system audio). Deepgram `nova-3` and/or AssemblyAI `u3-rt-pro`. Auto-routing prefers AssemblyAI for English, Spanish, French, German, Portuguese, and Italian when that key is present; otherwise Deepgram. Settings can force either engine.
- **AI assistance** — Anthropic or OpenAI from the overlay (Assist, recap, follow-up, and custom prompts). Optional screenshot via `desktopCapturer`.
- **Stealth overlay** — Electron `setContentProtection` so the overlay and dashboard are omitted from typical screen-share APIs (Zoom, Meet, Teams, Discord). Not a guarantee against every capture tool.
- **Modes** — Local behavior profiles (system prompt, notes templates). Attach documents for RAG on that mode.
- **RAG (per mode, local)** — Upload `.txt`, `.md`, `.pdf`, or `.docx`. Chunked and embedded on-device with `Xenova/all-MiniLM-L6-v2` (`@xenova/transformers`). Chunks live in SQLite; the top matches are injected into the Assist system prompt. First embed may download the ~30MB model.
- **Session context (not long-term memory)** — During a recording, Assist keeps recent turns, pins the opening transcript and your typed questions, and may compress older context with a cheap model **in RAM**. There is **no** cross-meeting user-memory profile.
- **Sessions** — Saved locally in SQLite (transcript, overlay chat, auto title/summary). Dashboard can generate insights with your LLM key. **Incognito** skips SQLite persistence for that session.
- **Local settings** — API keys and preferences in encrypted `electron-store` (`raven-config.json`).
- **Tray** — Packaged builds load icons from `resources/tray`. On Windows 11 a new icon may start in the `^` overflow.
- **Profile picture editor** — Crop, zoom, and pan before saving your avatar.

Live recording uses the **OS default** mic and playback devices. The Settings mic picker is for the in-app mic **test** only.

## Architecture

```mermaid
flowchart TB
  subgraph capture [Native capture]
    Win["Windows: WASAPI loopback + capture"]
    Mac["macOS: ScreenCaptureKit + CoreAudio"]
  end

  subgraph local [On this machine]
    SAN[systemAudioNative]
    AEC["GStreamer webrtcechoprobe / webrtcdsp"]
    REG[ResidualEchoGate]
    AM[audioManager]
    RAG["ragService — MiniLM embeddings"]
    MEM["sessionMemory — current recording only"]
    CS[claudeService]
    DB[("SQLite data/raven.db")]
    CFG["electron-store — keys and settings"]
    OV[Overlay]
    Dash[Dashboard]
  end

  subgraph byok [Your API keys — not a Raven server]
    STT["Deepgram nova-3 and/or AssemblyAI u3-rt-pro"]
    LLM[Anthropic or OpenAI]
  end

  Win --> SAN
  Mac --> SAN
  SAN -->|"system PCM = Them"| AM
  SAN --> AEC
  AEC -->|"cleaned mic"| REG
  REG -->|"You, if not echo"| AM
  AM --> STT
  STT --> OV
  OV --> CS
  MEM --> CS
  RAG --> CS
  CS --> LLM
  CS --> DB
  RAG --> DB
  AM --> DB
  CFG --- CS
  Dash --- DB
```

![Architecture](docs/architecture.png)

The PNG is generated from `docs/architecture.mmd` (same graph, more labels). Re-export if you change the mermaid.

**What “memory” means here**

| Mechanism | Lifetime | Used for |
|-----------|----------|----------|
| Live Assist turns + `sessionMemory` | Current recording, in RAM | Long meetings: running summary, pinned opening, pinned questions, last few turns |
| SQLite sessions / messages | Until you delete them | History, summaries, insights, overlay chat replay |
| RAG chunks | Until you remove the file from the mode | Retrieve-then-prompt on Assist, scoped to that mode |
| electron-store | Until you reset settings | Keys, STT preference, window bounds — not semantic memory |

There is no global “Raven remembers you across meetings” store.

## How It Works

1. You start a session (`Cmd/Ctrl + Shift + Space`, or the overlay). Incognito, if enabled, will not write the session to SQLite.
2. A native helper captures system audio and microphone at the same time.
   - **macOS:** Swift `audiocapture` — ScreenCaptureKit (system) + CoreAudio (mic). Needs Microphone and Screen Recording.
   - **Windows:** Rust/NAPI `raven-windows-audio` — WASAPI loopback + capture. Uses the default devices.
3. System PCM is the AEC **reference**. Mic PCM goes through GStreamer `webrtcechoprobe` / `webrtcdsp`. `ResidualEchoGate` then compares raw mic to recent system audio and drops leftover speaker echo so it does not land in **You**.
4. Two STT connections run in parallel (mic → You, system → Them). Engine pick is Settings `sttProvider` (`auto` / `assemblyai` / `deepgram`) plus language: AssemblyAI Universal-3 Pro for the six languages above when that key exists; Deepgram `nova-3` otherwise (including auto-detect / `multi`). AssemblyAI failures can fall back to Deepgram.
5. The overlay shows the live transcript. Assist (`Cmd/Ctrl + Enter`) builds a prompt from the mode brief, retrieved RAG chunks (if the mode has docs), session memory, recent chat, transcript tail, and an optional screenshot, then streams from your LLM.
6. On stop, a non-incognito session is saved. A cheap/fast model writes a title and summary. Insights are generated later from the dashboard, still with your key.

## Project Structure

```
src/
├── main/                         # Electron main process
│   ├── audioManager.ts           #   Recording orchestration, STT engine pick
│   ├── systemAudioNative.ts      #   Native capture + AEC wiring
│   ├── residualEchoGate.ts       #   Post-AEC mic echo drop before STT
│   ├── transcriptionService.ts   #   Deepgram dual WebSocket
│   ├── claudeService.ts          #   Overlay Assist (Claude / OpenAI)
│   ├── store.ts                  #   electron-store (encrypted keys + settings)
│   ├── index.ts                  #   App lifecycle, hotkeys, IPC
│   └── services/
│       ├── database.ts           #   SQLite (sessions, modes, RAG chunks)
│       ├── sessionManager.ts     #   Session lifecycle, incognito, autosave
│       ├── ragService.ts         #   Parse, embed, retrieve
│       ├── assemblyAITranscriptionService.ts
│       ├── summaryService.ts     #   Post-session title + summary
│       ├── insightsService.ts    #   Dashboard insights
│       └── ai/
│           ├── providerFactory.ts
│           └── sessionMemory.ts  #   In-recording compression / pins
├── shared/sttCapabilities.ts     # STT language + engine routing
├── renderer/                     # React UI (Vite + Tailwind)
├── preload/                      # Context bridge
└── native/
    ├── swift/AudioCapture/       # macOS capture
    ├── windows/                  # Windows WASAPI (Rust/NAPI)
    └── aec/                      # GStreamer AEC addon
```

## Platform Support

| Platform | System Audio | Microphone | Echo Cancellation | Status |
|----------|-------------|------------|-------------------|--------|
| **macOS 12+** | ScreenCaptureKit | CoreAudio | GStreamer AEC3 | Primary, fully tested |
| **Windows 10/11** | WASAPI Loopback | WASAPI Capture | GStreamer AEC3 | Supported |
| Linux | — | — | — | Not supported (no native capture path) |

Prebuilt Mac DMG is **Apple Silicon**. Intel Macs: build from source (this section). This OSS tree does not ship login, hosted Pro, cloud sync, or Recall meeting-bot capture.

## Getting Started

If you only want to run Raven, use a [prebuilt installer](#download) instead of this section.

This walkthrough is for building from source — from a fresh machine to a running app. Pick your platform, follow every numbered step in order, and verify each one before moving on.

> **API keys** (entered in-app on first launch — nothing to configure beforehand):
>
> - [Deepgram](https://console.deepgram.com) or [AssemblyAI](https://www.assemblyai.com) — real-time transcription
> - [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com) — AI assistance

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

> Tested on Windows 10 (21H2+) and Windows 11. All commands are for **PowerShell**. Open a **new terminal** after each installer to pick up PATH changes.

**Step 1 — Install Visual Studio Build Tools**

Download and run the [Visual Studio Build Tools installer](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

In the installer, check the **"Desktop development with C++"** workload and click Install. Make sure these optional components are selected (they should be by default):
- MSVC Build Tools for x64/x86 (Latest)
- Windows 10/11 SDK
- C++ CMake tools for Windows

Verify:
```powershell
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -products * -requires Microsoft.VisualStudio.Workload.VCTools -property displayName
# Expected: Visual Studio Build Tools 2022
```

> **If you have full Visual Studio** (not just Build Tools) with the C++ workload, that works too.

---

**Step 2 — Install Node.js (LTS)**

Option A — [nvm-windows](https://github.com/coreybutler/nvm-windows/releases) (recommended):

Download and run the latest `nvm-setup.exe`, then open a **new** terminal:

```
nvm install 22
nvm use 22
```

Option B — Download the LTS 22.x MSI installer directly from [nodejs.org](https://nodejs.org/).

Verify (in a **new** terminal):
```
node -v
# Expected: v22.x.x
```

> **Why Node 22 specifically?** The project requires `node >= 22.12.0` (see `package.json` engines). Using `nvm install lts` may install a newer major version that hasn't been tested.

---

**Step 3 — Install Python**

Python is required by `node-gyp` to compile native Node.js modules (`better-sqlite3`, `bufferutil`, etc.).

Option A — [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/):
```
winget install Python.Python.3.12 --source winget
```

Option B — Download from [python.org](https://www.python.org/downloads/). Make sure "Add to PATH" is checked during installation.

Verify (in a **new** terminal):
```
python --version
# Expected: Python 3.x.x
```

---

**Step 4 — Install the Rust toolchain**

Download and run [rustup-init.exe](https://rustup.rs/). Accept the defaults (installs `stable-msvc`).

Verify (in a **new** terminal):
```
rustc --version
# Expected: rustc 1.xx.x (...)
rustup default stable-msvc
```

---

**Step 5 — Install GStreamer (MSVC)**

Download the **MSVC x86_64** installer from [gstreamer.freedesktop.org/download](https://gstreamer.freedesktop.org/download/) — click **Windows** → **MSVC x86_64 (VS 2022, Release CRT)**.

> For GStreamer 1.28+, there is a single combined installer (runtime + development). For older versions, download both the Runtime and Development MSI files.

Run with default settings. The installer typically installs to `C:\gstreamer\` or `C:\Program Files\gstreamer\`.

After installation, verify the environment variable is set (open a **new** terminal):
```powershell
echo $env:GSTREAMER_1_0_ROOT_MSVC_X86_64
# Expected: C:\gstreamer\1.0\msvc_x86_64\ (or C:\Program Files\gstreamer\1.0\msvc_x86_64\)
```

Also make sure GStreamer's `bin` directory is on your PATH:
```powershell
$gstRoot = $env:GSTREAMER_1_0_ROOT_MSVC_X86_64
if ($gstRoot) { echo "GStreamer root: $gstRoot" } else { echo "NOT SET - see below" }
```

> **If the variable is empty:** The installer didn't set it. Find where GStreamer was installed and set it manually:
> ```powershell
> # Adjust the path below to match your installation
> [Environment]::SetEnvironmentVariable("GSTREAMER_1_0_ROOT_MSVC_X86_64", "C:\Program Files\gstreamer\1.0\msvc_x86_64\", "User")
> ```
> Then **restart your terminal**.
>
> **If GStreamer installed to `C:\Program Files\gstreamer\` instead of `C:\gstreamer\`:** That's fine — just make sure the environment variable points to the correct path (e.g. `C:\Program Files\gstreamer\1.0\msvc_x86_64\`).

---

**Step 6 — Install CMake**

CMake is required to compile the GStreamer echo-cancellation addon.

```
winget install Kitware.CMake --source winget
```

Or download from [cmake.org/download](https://cmake.org/download/). Make sure "Add to PATH" is checked.

Verify (in a **new** terminal):
```
cmake --version
# Expected: cmake version 3.x.x
```

---

**Step 7 — Clone the repo and install dependencies**

```
git clone https://github.com/Laxcorp-Research/project-raven.git
cd project-raven
npm install
```

`npm install` takes a few minutes. It automatically rebuilds `better-sqlite3` for Electron via the `postinstall` script.

Verify:
```powershell
Test-Path node_modules\.package-lock.json
# Expected: True
```

> **If `npm install` fails with `Could not find any Python installation`:** Revisit Step 3 — Python must be installed and on PATH.
>
> **If `npm install` fails with `Could not find any Visual Studio installation`:** `node-gyp` can't auto-detect your Build Tools. Try these fixes in order:
> ```powershell
> # Fix 1: Set the version hint for node-gyp
> npm config set msvs_version 2022
> Remove-Item -Recurse -Force node_modules
> npm install
> ```
> If `npm config set msvs_version` gives an error on newer npm versions, use the environment variable instead:
> ```powershell
> # Fix 2: Environment variable (works on all npm versions)
> $env:GYP_MSVS_VERSION = "2022"
> Remove-Item -Recurse -Force node_modules
> npm install
> ```

---

**Step 8 — Build the GStreamer echo-cancellation addon**

First, check the Electron version used by the project:
```
node -e "console.log(require('./node_modules/electron/package.json').version)"
# Note the version (e.g. 40.4.1)
```

Then build the addon targeting that version:
```
cd src\native\aec
npm install
npx cmake-js compile --runtime electron --runtime-version <ELECTRON_VERSION>
cd ..\..\..
```

Replace `<ELECTRON_VERSION>` with the version from the previous command (e.g. `40.4.1`).

> **Important:** The `--runtime electron --runtime-version` flags are required. Without them, the addon is built for Node.js instead of Electron, and it **will crash** when loaded. If you upgrade Electron later, you must rebuild this addon with the new version.
>
> **Note:** The `build-deps.sh` script is macOS-only. On Windows, the GStreamer MSVC installer already includes all required plugins (including WebRTC DSP).

Verify:
```powershell
Test-Path src\native\aec\build\Release\raven-aec.node
# Expected: True
```

> **If cmake-js fails with "CMake is not installed":** Revisit Step 6.
>
> **If cmake-js fails with "GStreamer not found":** The `GSTREAMER_1_0_ROOT_MSVC_X86_64` environment variable is not set. Revisit Step 5.
>
> **If the build succeeds but linking fails with "unresolved external symbol `g_object_set` / `g_type_check_instance_cast`":** GLib/GObject libraries are missing from the link step. This should be handled automatically by the CMakeLists.txt — if you see this error, file a bug.

---

**Step 9 — Build the Windows audio capture module**

```
cd src\native\windows
npm install
npx napi build --platform --release
cd ..\..\..
```

Verify:
```powershell
Test-Path src\native\windows\raven-windows-audio.win32-x64-msvc.node
# Expected: True
```

> **If the build fails with linker errors:** Make sure Rust is using the MSVC target: `rustup default stable-msvc`.
>
> **If it fails with "Windows SDK not found":** Open **Visual Studio Installer → Modify → Individual components** and install the latest "Windows 10 SDK" or "Windows 11 SDK".

---

**Step 10 — Run the app**

```
npm run dev
```

The Electron app opens. On first launch you'll see a 6-step onboarding flow — enter a transcription key (Deepgram and/or AssemblyAI) and an AI key (Anthropic or OpenAI).

> **If the app starts but audio capture doesn't work:** Check **Settings → Sound** and make sure the correct playback and recording devices are set as default. WASAPI captures from the **default** devices. The Settings mic picker only drives the in-app mic test.

---

### Setup Troubleshooting Quick Reference

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `Could not find any Python installation` | Python not installed | Install Python 3.x and add to PATH (Windows Step 3) |
| `Could not find any Visual Studio installation to use` | `node-gyp` can't auto-detect Build Tools | Set `$env:GYP_MSVS_VERSION = "2022"`, delete `node_modules`, re-run `npm install` |
| `npm install` fails with `node-gyp` errors | Missing C/C++ build tools | **macOS:** `xcode-select --install` **Windows:** VS Build Tools "Desktop development with C++" workload |
| `NODE_MODULE_VERSION mismatch` at runtime | Native module built for wrong Electron version | `npx @electron/rebuild -f -w better-sqlite3` from the project root |
| `build-deps.sh`: "gstreamer-1.0 not found" | GStreamer not installed or `pkg-config` can't find it | **macOS:** Install via Homebrew and check `PKG_CONFIG_PATH` (see macOS Step 3) |
| cmake-js: "CMake is not installed" | CMake not on PATH | Install CMake (Windows Step 6) |
| cmake-js: "GStreamer not found" on Windows | `GSTREAMER_1_0_ROOT_MSVC_X86_64` not set | Set the env var manually and restart terminal (see Windows Step 5) |
| AEC addon crashes Electron on startup | Built for Node.js instead of Electron | Rebuild with `--runtime electron --runtime-version <your-electron-version>` (Windows Step 8) |
| `swift build` fails | Swift toolchain too old (need 5.9+) | `sudo rm -rf /Library/Developer/CommandLineTools && xcode-select --install` |
| `napi build` linker errors on Windows | Wrong Rust target or missing Windows SDK | `rustup default stable-msvc` and ensure VS Build Tools C++ workload is installed |
| App starts, no audio on macOS | Missing system permissions | **System Settings → Privacy & Security**: grant **Microphone** and **Screen Recording** |
| App starts, no audio on Windows | Wrong default audio device | **Settings → Sound**: set correct default playback/recording devices |

## Keyboard Shortcuts

These match `registerGlobalHotkeys` in `src/main/index.ts`. On Windows use `Ctrl` instead of `Cmd`. Recording used to be `Cmd/Ctrl+R` and clear used to be `Cmd/Ctrl+Shift+R`; those were changed because they stole browser refresh globally. If an onboarding screenshot still shows the old keys, this table wins.

| Action | Shortcut |
|--------|----------|
| Toggle overlay | `Cmd + \` |
| AI Assist | `Cmd + Enter` |
| Start/Stop recording | `Cmd + Shift + Space` |
| Clear conversation | `Cmd + Shift + Backspace` |
| Move overlay | `Cmd + Arrow Keys` |
| Scroll overlay | `Cmd + Shift + Up/Down` |

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

SQLite is `data/raven.db` under the app user-data folder. Packaged builds use the product name **Raven**; `npm run dev` uses the package name **project-raven**.

```bash
# macOS (packaged)
rm -rf ~/Library/Application\ Support/Raven/

# macOS (dev)
rm -rf ~/Library/Application\ Support/project-raven/
```

```bat
:: Windows (packaged)
rmdir /s /q "%APPDATA%\Raven"

:: Windows (dev)
rmdir /s /q "%APPDATA%\project-raven"
```

## Contributing

Issues and pull requests are welcome. This project is in active development. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, tests, and [how to cut a release](CONTRIBUTING.md#releasing).

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a pull request

## License

[MIT](LICENSE)
