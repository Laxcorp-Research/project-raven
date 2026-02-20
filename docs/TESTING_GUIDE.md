# Raven Manual Testing Guide

Step-by-step runtime tests for both the open-source and premium app. Every test includes what to do, what to look for, where to look, and what to log.

---

## Before You Start

### Terminal Setup

Open **two** terminal tabs:

**Tab 1 — App (with logs):**
```bash
cd project-raven
npm run dev 2>&1 | tee ~/Desktop/raven-test-log.txt
```
This pipes ALL logs to a file on your Desktop while also showing them in the terminal.

**Tab 2 — Activity Monitor (for memory/CPU):**
```bash
# Snapshot every 30 seconds during the test
while true; do
  echo "=== $(date) ===" >> ~/Desktop/raven-perf-log.txt
  ps aux | grep -E "(Electron|audiocapture|node)" | grep -v grep >> ~/Desktop/raven-perf-log.txt
  sleep 30
done
```

### What to Watch in the Terminal Logs

| Log prefix | What it means | Healthy sign | Bad sign |
|------------|---------------|--------------|----------|
| `[Audio]` | Audio pipeline events | `Audio pipeline configured`, `Recording started` | `Failed to start`, repeated errors |
| `[SystemAudio]` | Native capture + AEC | `GStreamer AEC pipeline initialized`, `AEC health: drift=<50ms` | `AEC module not available`, `drift>200ms`, `bypassed=true` |
| `[Transcription]` | Deepgram WebSocket | `mic WebSocket connected`, `system WebSocket connected`, transcript lines | `WebSocket error`, repeated `no transcript in message` for 30+ seconds during speech |
| `[Permissions]` | macOS permission checks | `Microphone permission granted` | `denied`, `restricted` |
| `[AI]` | LLM provider | `Created anthropic provider with model...` | `No API key configured`, `429`, `500` |
| `[SessionManager]` | Session lifecycle | `Session started`, `Session ended` with duration | `Session ended` with 0 entries |
| `[Database]` | SQLite persistence | `Initialized successfully`, `Created session`, `Updated session` | Any errors |
| `[Tray]` | System tray | `Tray icon created` | `Tray icon not found`, `Failed to create tray` |
| `[Auth]` | Premium auth (pro mode only) | `Backend configured`, `User authenticated` | `No backend configured`, `Token refresh failed` |

---

## Test 1: First Launch & Onboarding (Open-Source)

**Goal:** Verify a new user can set up the free app from scratch.

**Steps:**
1. Reset all data first:
   ```bash
   rm -rf ~/Library/Application\ Support/project-raven/
   ```
2. Run `npm run dev`
3. Dashboard should open with the onboarding flow

**Check:**
- [ ] Onboarding appears (not the main dashboard)
- [ ] Can enter Deepgram API key
- [ ] Can choose AI provider (Anthropic / OpenAI) and enter key
- [ ] Key validation works (shows error for invalid keys, green check for valid)
- [ ] After completing onboarding, overlay appears on screen
- [ ] Tray icon appears in the menu bar (should show the Raven logo)
- [ ] Dashboard shows the main view (not onboarding again)

**Logs to check:**
```
[Raven] Hotkeys registered: { visibility: true, aiSuggestion: true, recording: true, ... }
[Tray] Tray icon created
```

**Failure indicators:**
- Blank tray icon (icon not loaded)
- Overlay doesn't appear after onboarding
- `Hotkeys registered` shows any `false` values

---

## Test 1b: First Launch & Onboarding (Premium)

**Goal:** Verify the full premium onboarding flow works end-to-end.

**Prerequisites:** Backend running (`cd backend && npm run dev`), PostgreSQL running.

**Steps:**
1. Reset all data:
   ```bash
   rm -rf ~/Library/Application\ Support/project-raven/
   ```
2. Run `npm run dev:pro`

### Step 1 — Welcome Screen
- [ ] Raven logo and "Welcome to Raven" message displayed
- [ ] "Get Started" button present
- [ ] Settings gear icon in top-right with "Quit Raven" option
- [ ] Tray menu only shows "Quit Raven" (simplified for onboarding)
- [ ] `Cmd+\` does NOT open the overlay (hotkeys suppressed)

### Step 2 — Authentication
- [ ] Clicking "Get Started" opens browser for Google login
- [ ] "Waiting for sign in..." screen shown with "Go back" button
- [ ] Google OAuth consent screen loads in browser
- [ ] After login, browser shows "Opening Raven" page with your name/email/avatar
- [ ] Browser tab attempts to auto-close
- [ ] App receives auth callback and advances to permissions

### Step 3 — Permissions
- [ ] Shows "Welcome, [Your Name]!" (personalized greeting)
- [ ] Microphone and Screen Recording permission status shown
- [ ] If already granted, shows green "Granted" state
- [ ] Does NOT auto-advance even if both permissions are already granted
- [ ] "Next" button advances to overlay tour
- [ ] No "Back" button (user is already authenticated)

### Step 4 — Overlay Tour
- [ ] Shows 10 interactive steps with the overlay pill mock
- [ ] Step 1: "Your Control Center" — pill overview
- [ ] Step 2: "Hide" — hide button highlighted
- [ ] Step 3: "Start Session" — mic button in default state (mic icon)
- [ ] Step 4: "Stop Session" — mic button in active state (stop icon, green)
- [ ] Step 5: "Detectable" — stealth button off state
- [ ] Step 6: "Undetectable" — stealth button on state (teal/green)
- [ ] Step 7: "Fast Mode" — smart toggle in fast state
- [ ] Step 8: "Deep Mode" — smart toggle in deep state (purple)
- [ ] Step 9: "Incognito Off" — incognito off
- [ ] Step 10: "Incognito On" — incognito on (amber)
- [ ] No step numbering (no "1/10", "2/10")
- [ ] Descriptions are single-line
- [ ] Button visuals match actual overlay colors and icons

### Step 5 — Keyboard Shortcuts
- [ ] All hotkeys shown with proper key glyphs (`⌘`, `\`, `↵`, etc.)
- [ ] Key icons are readable size inside kbd boxes

### Step 6 — Done
- [ ] "Raven is ready. Start a session and let your AI co-pilot handle the rest." on one line
- [ ] "Open Dashboard" button works
- [ ] After clicking, overlay appears and tray menu shows full options
- [ ] `Cmd+\` now works (hotkeys enabled)

### Auth Edge Cases
- [ ] "Go back" on waiting screen cancels auth cleanly (no timeout error)
- [ ] Re-clicking "Get Started" after cancellation starts fresh auth flow
- [ ] Closing/restarting app during onboarding resumes at appropriate step

---

## Test 2: Permissions (macOS)

**Goal:** Verify mic and screen recording permissions are prompted correctly.

**Steps:**
1. If you've already granted permissions, revoke them first:
   - System Settings → Privacy & Security → Microphone → uncheck Electron/project-raven
   - System Settings → Privacy & Security → Screen Recording → uncheck Electron/project-raven
2. Start a recording session (click the record button on the pill or press `Cmd+R`)

**Check:**
- [ ] macOS microphone permission dialog appears
- [ ] After granting mic, recording starts (or you get a clear error about screen recording)
- [ ] If screen recording is denied, you see: "Screen recording permission is required..."
- [ ] After granting both and restarting, recording works normally

**Logs to check:**
```
[Permissions] Requesting microphone permission...
[Permissions] Microphone permission granted
[Audio] Starting recording...
[Audio] Recording started (default)
```

**Failure indicators:**
- No permission dialog appears
- Recording silently starts but system audio is all zeros (`first10max=0` for 30+ seconds)
- App crashes

---

## Test 3: Recording & Transcription (5-min call)

**Goal:** Core functionality — does speech turn into text?

**Steps:**
1. Join a call with a colleague (Zoom/Teams/Meet) or play a YouTube video with speech
2. Press `Cmd+R` or click the record button on the pill
3. Talk for at least 2 minutes, let the other side talk for at least 2 minutes
4. Watch the transcript tab in the overlay

**Check:**
- [ ] Pill shows recording indicator (pulsing red dot or active state)
- [ ] Tray icon changes to the active/recording state
- [ ] Your speech appears on the RIGHT side of the transcript (labeled with your display name)
- [ ] Their speech appears on the LEFT side (labeled "Them")
- [ ] Interim results appear in italic while someone is still speaking
- [ ] Final results replace interims (no duplication)
- [ ] Same-speaker consecutive utterances merge within 5 seconds
- [ ] No echo — your own voice doesn't appear on the "Them" side (if using headphones)
- [ ] Speaker labels never swap (your voice stays "You", theirs stays "Them")

**Logs to check — healthy pattern:**
```
[SystemAudio] GStreamer AEC pipeline initialized
[Audio] Recording started (default)
[SystemAudio] audiocapture: [AudioCapture] Both captures running
[Transcription] mic WebSocket connected
[Transcription] system WebSocket connected
[Transcription] mic transcript: "..." (final: true)
[Transcription] system transcript: "..." (final: true)
```

**Logs to check — AEC health (appears every ~10s):**
```
[SystemAudio] AEC health: drift=28.9ms rms=sys:0/mic:2277/out:6453 bufs=... bypassed=false
```
- `drift` should stay under 100ms for most of the session
- `rms` values: `mic` and `out` should be non-zero when speaking
- `sys` is 0 when using headphones (no system audio leaking) — this is correct
- `bypassed=false` means AEC is active

**Failure indicators:**
- `drift>200ms` sustained → AEC will bypass
- `bypassed=true` → echo cancellation is OFF
- All system audio `first10max=0` for entire session → screen recording permission missing
- Mic transcript appears but system never does (or vice versa)
- Same text appearing on both sides (echo leak)

---

## Test 4: AI Assistance

**Goal:** Verify LLM responds with context-aware answers.

### 4a: Quick Actions During Recording

**Steps (while recording from Test 3):**
1. Click "Assist" in the quick action bar (or press `Cmd+Enter`)
2. Wait for the AI response
3. Click "What should I say?"
4. Try "Follow-up"
5. Try "Recap"
6. On an existing response card, try "Tell me more"

**Check:**
- [ ] "Assist" gives a relevant response based on the conversation context
- [ ] "What should I say?" references the LAST thing the other person said
- [ ] "Follow-up" asks a relevant follow-up question based on context
- [ ] "Recap" provides a summary of the conversation so far
- [ ] Responses stream in (word by word, not all at once)
- [ ] Markdown renders properly (bold, bullet points, etc.)
- [ ] "Tell me more" (on response card) expands on the previous response
- [ ] Response cards have correct action badges ("Assist", "What should I say?", "Follow-up", "Recap")

### 4b: Typed Question Override

**Steps:**
1. While recording, type a specific question in the input bar (e.g., "What is the capital of France?")
2. Press Enter

**Check:**
- [ ] AI answers YOUR TYPED QUESTION, not the transcript
- [ ] The response is direct and specific (not generic ChatGPT-style)

### 4c: Screenshot Interpretation (No Session)

**Steps:**
1. STOP the recording session
2. Open a webpage with a math problem or aptitude question
3. Press `Cmd+Enter`

**Check:**
- [ ] AI describes and solves what's on the screen
- [ ] No references to "the conversation" or "the meeting" (there's no active session)
- [ ] Math notation renders with KaTeX if the answer includes formulas
- [ ] For multiple choice: AI explains why each wrong answer is wrong

### 4d: Screenshot Interpretation (During Session)

**Steps:**
1. Start a recording session
2. Have a brief conversation
3. Open a relevant document/slide on screen
4. Press `Cmd+Enter`

**Check:**
- [ ] AI uses BOTH the transcript context AND the screen content
- [ ] Response is contextually relevant to the ongoing conversation

**Logs to check:**
```
[AI] Created anthropic provider with model claude-haiku-4-5
```
No API key values should appear in the logs.

**Failure indicators:**
- `No API key configured` error
- Response is generic ("I'd be happy to help!")
- "What should I say?" references something said 5+ minutes ago instead of the last thing
- Screenshot response references stale conversation after session ended

---

## Test 5: UI / UX Polish

**Goal:** Verify the overlay looks and behaves correctly.

### 5a: Overlay Appearance

**Check:**
- [ ] Overlay spawns **centered** on screen (not in a corner)
- [ ] Glass-like transparency (backdrop blur visible, not opaque black)
- [ ] Rounded corners on the overlay panel
- [ ] Raven logo visible on the controller pill
- [ ] Smooth animations when responses appear (spring physics, not instant)
- [ ] Response cards fade in with AnimatePresence

### 5b: Resize & Drag

**Steps:**
1. Drag the overlay by the pill to move it
2. Resize from the left edge
3. Resize from the right edge
4. Resize from the bottom edge
5. Double-click a resize edge

**Check:**
- [ ] Drag works smoothly (no jitter, no lag)
- [ ] Resize respects minimum width (480px) and minimum height
- [ ] Double-click resets to default size **and re-centers** on screen
- [ ] Overlay stays within screen bounds (doesn't go off-screen)

### 5c: Click-Through / Mouse Pass-Through

**Steps:**
1. Position the overlay over a Zoom/Teams window
2. Try clicking on the meeting app through the transparent parts of the overlay
3. Hover over the pill and overlay content

**Check:**
- [ ] Clicks pass through transparent areas to the app behind
- [ ] Hovering over the pill/content shows the overlay interactive elements
- [ ] Moving mouse away from interactive areas returns to click-through mode

### 5d: Controller Pill

**Check:**
- [ ] Raven logo button works (click to toggle expanded/compact view)
- [ ] Record button shows correct state (red when recording, neutral when stopped)
- [ ] Stealth toggle icon is visible (eye-off icon)
- [ ] Fast/Deep toggle is **hidden** in open-source mode (visible only with `npm run dev:pro`)
- [ ] Incognito mode toggle works (hat-and-glasses icon)
- [ ] Tooltips appear on hover and stay within screen bounds
- [ ] Hide button hides the overlay (bring back with `Cmd+\`)

### 5e: Tabs & Navigation

**Check:**
- [ ] Response tab shows AI responses
- [ ] Transcript tab shows the live conversation
- [ ] Chat tab shows conversation history with the AI
- [ ] Tab switching is smooth

### 5f: Copy Features

**Steps:**
1. Get an AI response
2. Hover over it and click the copy icon
3. Click the transcript copy button in the toolbar
4. Try copying "My transcript", "Their transcript", and "Full transcript"

**Check:**
- [ ] Response copy shows a brief "Copied!" visual feedback
- [ ] Transcript copy dropdown menu appears
- [ ] Clicking outside the dropdown closes it
- [ ] Pasting in another app shows the correct content

### 5g: Notifications

**Check:**
- [ ] Notifications appear with animation (slide in from top)
- [ ] Auto-dismiss after the specified time
- [ ] Can be manually dismissed

---

## Test 6: Keyboard Shortcuts

**Test each shortcut:**

| Shortcut | Expected | Check |
|----------|----------|-------|
| `Cmd + \` | Toggle overlay visibility | [ ] |
| `Cmd + R` | Start/stop recording | [ ] |
| `Cmd + Enter` | AI assist (with screenshot) | [ ] |
| `Cmd + Shift + R` | Clear conversation history | [ ] |
| `Cmd + Up/Down/Left/Right` | Move overlay position | [ ] |
| `Cmd + Shift + Up/Down` | Scroll overlay content | [ ] |

---

## Test 7: Session Persistence

**Goal:** Verify sessions survive app restart.

**Steps:**
1. Start a recording, have a conversation for 2+ minutes
2. Ask AI a question and get a response
3. Stop the recording
4. Note the session duration shown
5. Quit the app completely (`Cmd+Q`)
6. Reopen with `npm run dev`
7. Open the dashboard

**Check:**
- [ ] Session appears in the dashboard session list
- [ ] Session title is auto-generated (relevant to the conversation content)
- [ ] Clicking the session shows the full transcript
- [ ] AI responses are preserved in the session detail view
- [ ] Session duration matches what you noted
- [ ] "Regenerate Summary" button works

**Logs to check on quit:**
```
[Audio] Session saved with X entries
[Audio] Recording stopped. Chunks: XXXX, Duration: XXs
[SessionManager] Session ended: <uuid> duration: XX s
[Database] Updated session: <uuid>
```

**Failure indicators:**
- `Session saved with 0 entries`
- Session doesn't appear in the dashboard after restart
- Transcript is empty in the session detail

---

## Test 8: Graceful Shutdown

**Goal:** Verify quitting during recording doesn't leave orphan processes.

**Steps:**
1. Start a recording session
2. While recording is active, press `Cmd+Q` to quit
3. Check Activity Monitor

**Check:**
- [ ] App quits within 2-3 seconds (not hung)
- [ ] No `audiocapture` process in Activity Monitor after quit
- [ ] No `Electron` processes lingering
- [ ] Reopen app — session from interrupted recording is saved

**Logs to check:**
```
[Audio] Shutdown: stopping active recording...
[Audio] Shutdown: session saved with X entries
[SystemAudio] AEC final stats: ...
[SystemAudio] Capture stopped.
[SystemAudio] Stopped
[Database] Updated session: <uuid>
```

**Failure indicators:**
- `audiocapture` process still running after app closes
- App hangs on quit (force quit needed)
- Session not saved

---

## Test 9: Screen-Share Invisibility

**Goal:** Verify the overlay is hidden from screen capture.

**Steps:**
1. Start a Zoom/Teams/Meet call with a colleague
2. Make sure the Raven overlay is visible on YOUR screen
3. Start sharing your screen
4. Ask your colleague: "Can you see anything unusual on my screen?"

**Check:**
- [ ] Colleague CANNOT see the Raven overlay
- [ ] The overlay is still visible to YOU while sharing
- [ ] This works even with the overlay positioned directly over the shared content

**Alternative self-test:**
1. Open QuickTime Player → File → New Screen Recording
2. Record your screen with the Raven overlay visible
3. Play back the recording

**Check:**
- [ ] Raven overlay does NOT appear in the QuickTime recording

---

## Test 10: System Tray

**Check:**
- [ ] Raven logo icon appears in the macOS menu bar
- [ ] Right-clicking shows context menu with: Show/Hide Overlay, Start/Stop Recording, Open Dashboard, Quit
- [ ] "Start Recording" changes to "Stop Recording" when recording
- [ ] Clicking the tray icon toggles the overlay
- [ ] "Open Dashboard" brings the dashboard window to front
- [ ] "Quit Raven" quits cleanly

---

## Test 11: Modes

**Steps:**
1. Open the dashboard
2. Go to Modes
3. Switch to "Interview" mode
4. Start a recording and ask for AI assistance

**Check:**
- [ ] Mode list shows built-in modes (Interview, Sales, Meeting, Learning)
- [ ] Switching modes changes the active mode indicator
- [ ] AI responses reflect the active mode's personality (e.g., Interview mode uses STAR structure)
- [ ] Can create a custom mode with custom system prompt
- [ ] Can reset a built-in mode to defaults

---

## Test 12: Dashboard Settings

**Goal:** Verify all settings tabs work correctly.

### 12a: Profile Tab

**Check (free mode):**
- [ ] Can upload profile picture (crop editor opens)
- [ ] Crop editor: zoom slider works, drag to reposition, Reset/Cancel/Apply
- [ ] Can change and remove profile picture
- [ ] Can edit display name
- [ ] "Where your profile is used" info box displayed

**Check (premium mode):**
- [ ] Google avatar shown by default
- [ ] Can upload custom picture (overrides Google avatar)
- [ ] Display name pre-filled from Google, editable
- [ ] Account email shown (read-only)
- [ ] "Password & Security" section with Update button → opens reset link modal
- [ ] "Delete Account" section → opens confirmation modal with subscription warning

### 12b: Audio Tab

**Check:**
- [ ] Microphone dropdown shows available devices
- [ ] Default mic shows as "Default - MacBook Pro Microphone" (no duplicate "Default")
- [ ] Test Microphone button works (shows waveform bars + live transcription)
- [ ] Capture meeting audio toggle saves state

### 12c: Language Tab
- [ ] Transcription language dropdown works
- [ ] Output language dropdown works

### 12d: Hotkeys Tab
- [ ] All shortcuts listed with correct key glyphs

### 12e: About Tab
- [ ] Version number displayed
- [ ] GitHub, Issues, Discussions links work

### 12f: Header User Menu (Premium)

**Check:**
- [ ] Avatar and name shown in header
- [ ] Clicking opens dropdown with name, email
- [ ] "Sign out" button works (logs out and reloads)
- [ ] "Quit Raven" button works

---

## Test 13: Edge Cases

### 13a: No Internet During Recording
1. Start recording
2. Disconnect WiFi
3. Reconnect after 10 seconds

**Check:**
- [ ] Transcript pauses during disconnect
- [ ] Deepgram reconnects after WiFi returns
- [ ] No app crash

### 13b: Very Long Single Utterance
1. Speak continuously for 60+ seconds without pausing

**Check:**
- [ ] Interim results keep updating
- [ ] Final result appears once you pause
- [ ] No text loss

### 13c: Rapid Start/Stop
1. Start recording
2. Immediately stop (within 2 seconds)
3. Start again
4. Stop again

**Check:**
- [ ] No crashes or errors
- [ ] Each start/stop creates a clean session
- [ ] No orphan processes

### 13d: Auth Timeout (Premium)
1. Click "Get Started" on welcome screen
2. Wait without logging in for 5+ minutes

**Check:**
- [ ] Eventually shows timeout message
- [ ] Can retry by clicking "Get Started" again

### 13e: Auth Cancellation (Premium)
1. Click "Get Started"
2. Immediately click "Go back"
3. Click "Get Started" again
4. Complete login

**Check:**
- [ ] No timeout error on the second attempt
- [ ] Login completes successfully

---

## After Testing

### Files to Keep

| File | What it contains |
|------|-----------------|
| `~/Desktop/raven-test-log.txt` | Full terminal output from the test session |
| `~/Desktop/raven-perf-log.txt` | CPU/memory snapshots every 30 seconds |

### Quick Health Summary

Grep the log file for issues:
```bash
# Errors
grep -i "error\|failed\|crash" ~/Desktop/raven-test-log.txt

# AEC problems
grep "AEC health" ~/Desktop/raven-test-log.txt | tail -5

# Permission denials
grep -i "denied\|permission" ~/Desktop/raven-test-log.txt

# Auth issues (premium)
grep -i "\[Auth\]" ~/Desktop/raven-test-log.txt

# Reconnection attempts
grep -i "reconnect" ~/Desktop/raven-test-log.txt

# Session summary
grep "Session" ~/Desktop/raven-test-log.txt
```
