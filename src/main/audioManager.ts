/**
 * AudioManager - main process coordinator for recording lifecycle.
 * Owns the full pipeline: native capture -> AEC -> transcription.
 *
 * In pro mode, tries Recall SDK first (handles both capture + transcription).
 * Falls back to native capture + AssemblyAI, then Deepgram.
 * In free mode, uses native capture + user-provided Deepgram key.
 */

import { BrowserWindow, ipcMain } from 'electron'
import { getSetting, isProMode } from './store'
import { TranscriptionService } from './transcriptionService'
import { sessionManager } from './services/sessionManager'
import { setProcessedAudioCallback, setCaptureExitCallback, startCapture, stopCapture } from './systemAudioNative'
import { updateTrayRecordingState } from './trayManager'
import { checkPermissionsForRecording, requestMicrophoneAccess, getPermissionStatus, openMicrophonePreferences } from './permissions'
import { createLogger } from './logger'

const log = createLogger('Audio')

interface TranscriptionProvider {
  sendAudio(buffer: Buffer | ArrayBuffer, source: 'mic' | 'system'): void
  start(meetingWindowId?: number): Promise<{ success: boolean; error?: string; fallback?: boolean }>
  stop(): Promise<void>
  clearTranscript(): void
  getFullTranscript(): string
  getFullTranscriptWithInterims(): string
  getTranscriptEntries(): Array<{ id: string; source: string; text: string; speaker: string; timestamp: number; isFinal: boolean }>
  getTranscriptBySource(source: 'mic' | 'system' | 'all'): string
  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void
}

// If no AEC-processed audio chunk has arrived in this long during an
// active native-capture session, something is likely wrong: native
// helper wedged, macOS TCC permission revoked mid-session but the
// helper hasn't exited, AEC module stuck, etc. Surface a warning so
// the user can stop + restart rather than silently recording nothing.
// 10 min is the threshold used in the launch plan; a quiet meeting
// still produces continuous silence-audio chunks, so legitimate silence
// doesn't trip this - only the absence of ANY chunks does.
const AUDIO_SILENCE_WARN_THRESHOLD_MS = 10 * 60 * 1000
const AUDIO_SILENCE_CHECK_INTERVAL_MS = 60 * 1000

export class AudioManager {
  private isRecording = false
  private isStarting = false
  private dashboardWindow: BrowserWindow | null = null
  private overlayWindow: BrowserWindow | null = null
  private chunkCount = 0
  private recordingStartTime: number | null = null
  private transcriptionService: TranscriptionService
  private activeProvider: TranscriptionProvider | null = null
  private usingAssemblyAI = false
  private usingRecall = false
  private sessionTimer: ReturnType<typeof setTimeout> | null = null
  private transcriptionStartupAbort: AbortController | null = null
  private transcriptionRetryTimer: ReturnType<typeof setTimeout> | null = null
  private proSessionStarted = false
  // Silence watchdog: bookkeeping for F3. Only meaningful on the native
  // capture path (Recall sessions bypass setProcessedAudioCallback).
  private lastAudioChunkAt: number | null = null
  private silenceCheckTimer: ReturnType<typeof setInterval> | null = null
  private silenceWarningSent = false

  constructor() {
    this.transcriptionService = new TranscriptionService()
    this.registerIpcHandlers()
    this.setupAudioPipeline()
  }

  /**
   * Wire up the audio pipeline: native capture -> AEC -> Deepgram.
   * processedAudioCallback fires for every AEC-processed chunk.
   */
  private setupAudioPipeline(): void {
    setProcessedAudioCallback((buffer: Buffer, source: 'mic' | 'system') => {
      if (!this.isRecording) return

      this.chunkCount++
      // Stamp every chunk for the silence watchdog and clear any prior
      // "audio has been quiet" notification state. If audio had stopped
      // and then resumed, the user deserves a clean slate - a fresh
      // silence period can then produce a fresh warning.
      this.lastAudioChunkAt = Date.now()
      this.silenceWarningSent = false

      if (this.chunkCount <= 3) {
        log.debug(`AEC-processed chunk from ${source}, size: ${buffer.byteLength}`)
      }
      if (this.chunkCount % 50 === 0) {
        log.debug(`${this.chunkCount} chunks processed (source: ${source})`)
      }

      if (this.activeProvider) {
        this.activeProvider.sendAudio(buffer, source)
      }
    })

    // If the native capture child dies MID-SESSION (not as a result of
    // user-initiated stopCapture), stop the recording state and push an
    // error notification so the user isn't staring at a "Recording" UI
    // with no audio actually flowing. Common triggers:
    //   - macOS Screen Recording permission revoked in System Settings
    //     (SCStream fails, Swift helper exits with status 1)
    //   - Swift audiocapture binary hit a fatal error or OOM
    //   - Windows native module crashed
    // The callback only fires for UNEXPECTED exits - stopCapture() sets
    // an `expectingCaptureExit` flag in systemAudioNative that suppresses
    // this path, so normal user stops don't trip a spurious error toast.
    setCaptureExitCallback((reason) => {
      if (!this.isRecording || this.usingRecall) return

      const hintsAtPermission = /permission|SCStream|AVAuthorization|TCC/i.test(reason.stderrTail)
      const body = hintsAtPermission
        ? 'The audio capture process stopped. This usually means macOS revoked Screen Recording or Microphone access for Raven. Check System Settings → Privacy & Security and re-grant, then restart the app.'
        : 'The audio capture process exited unexpectedly and the session was stopped. Check the app logs for details.'

      log.error('Capture died mid-session:', reason)
      this.broadcastError('Recording stopped', body)
      this.stopRecordingInternal({ reason: 'CAPTURE_DIED' }).catch((err) =>
        log.error('Failed to stop after capture death:', err),
      )
    })

    log.info('Audio pipeline configured')
  }

  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard
    this.overlayWindow = overlay
    this.transcriptionService.setWindows(dashboard, overlay)
    if (this.activeProvider && this.activeProvider !== this.transcriptionService) {
      this.activeProvider.setWindows(dashboard, overlay)
    }
  }

  private registerIpcHandlers(): void {
    ipcMain.on('audio:stop-from-limit', () => {
      if (!this.isRecording) return
      log.info('AI limit reached - auto-stopping recording')
      this.stopRecordingInternal({ reason: 'SESSION_TIME_LIMIT' })
        .catch((err) => log.error('Failed to stop recording on AI limit:', err))
    })

    ipcMain.handle('audio:start-recording', async (_event, deviceId?: string) => {
      if (this.isRecording || this.isStarting) {
        log.warn('Recording already in progress or starting')
        return { success: false, error: 'Recording already in progress' }
      }
      this.isStarting = true
      log.info('Starting recording...')

      try {
      let shouldStartProRetryLoop = false

      if (process.platform === 'darwin') {
        const perms = checkPermissionsForRecording()
        if (!perms.ok) {
          if (perms.missing.includes('microphone')) {
            const granted = await requestMicrophoneAccess()
            if (!granted) {
              log.error('Microphone permission denied')
              return { success: false, error: 'Microphone permission is required. Grant access in System Settings → Privacy & Security → Microphone.' }
            }
          }
          if (perms.missing.includes('screen')) {
            log.error('Screen recording permission denied')
            return { success: false, error: 'Screen recording permission is required for system audio capture. Grant access in System Settings → Privacy & Security → Screen Recording, then restart the app.' }
          }
        }
      } else if (process.platform === 'win32') {
        // Windows has no programmatic mic prompt - the OS shows it the
        // first time a stream opens for a 'not-determined' app, so we let
        // that case proceed. But if the user has explicitly turned
        // Microphone access OFF (Settings -> Privacy -> Microphone),
        // recording would start and silently capture NOTHING - no mic
        // transcript, no error. That is the most common reason Raven
        // "works on one PC but not another fresh install": the dev box
        // granted mic long ago, a teammate's clean machine has it off.
        // permissions.ts already reads the real Windows status; gate on
        // it here (win32-scoped, so the macOS branch above is untouched)
        // and fail loudly with a deep link instead of recording silence.
        const micStatus = getPermissionStatus().microphone
        if (micStatus === 'denied') {
          log.error('Microphone access denied at OS level (Windows privacy setting) - aborting start')
          void trackRecordingFailed('microphone_permission_denied_win')
          openMicrophonePreferences()
          return {
            success: false,
            error: 'Microphone access is turned off for Raven. In Windows Settings -> Privacy & security -> Microphone, enable "Let desktop apps access your microphone", then try again.',
          }
        }
      }

      if (isProMode()) {
        // Check session limit before starting
        const sessionCheck = await this.checkAndStartProSession()
        if (!sessionCheck.allowed) {
          return {
            success: false,
            error: sessionCheck.error || 'Session limit reached',
            code: sessionCheck.code,
            sessionsUsed: sessionCheck.sessionsUsed,
            sessionLimit: sessionCheck.sessionLimit,
            resetAt: sessionCheck.resetAt,
          }
        }

        // Try Recall SDK first (handles both audio capture + transcription)
        const recallStarted = await this.tryStartRecallRecording()
        if (recallStarted) {
          this.usingRecall = true
          log.info('Pro recording: Recall SDK active (native capture skipped)')
        } else {
          // Fall back to native capture + AssemblyAI/Deepgram
          this.usingRecall = false
          const captureStarted = startCapture()
          if (!captureStarted) {
            log.error('Native audio capture failed to start')
            void trackRecordingFailed('native_capture_failed_to_start_pro')
            return { success: false, error: 'Audio capture failed to start' }
          }
          shouldStartProRetryLoop = true
        }

        // Start session time limit for FREE users
        if (sessionCheck.sessionMaxSeconds && sessionCheck.sessionMaxSeconds > 0) {
          this.startSessionTimer(sessionCheck.sessionMaxSeconds)
        }
      } else {
        const deepgramKey = getSetting('deepgramApiKey')
        if (deepgramKey) {
          this.transcriptionService.setApiKey(deepgramKey)
          this.transcriptionService.clearTranscript()
          this.activeProvider = this.transcriptionService
          const result = await this.transcriptionService.start()
          if (!result.success) {
            log.error('Transcription failed to start:', result.error)
          }
        } else {
          log.warn('No Deepgram API key - transcription disabled')
        }

        const captureStarted = startCapture()
        if (!captureStarted) {
          log.error('Native audio capture failed to start')
          void trackRecordingFailed('native_capture_failed_to_start')
          return { success: false, error: 'Audio capture failed to start' }
        }
      }

      this.isRecording = true
      this.chunkCount = 0
      this.recordingStartTime = Date.now()
      this.proSessionStarted = false
      this.broadcastRecordingState(true)
      // Start the silence watchdog for native-capture sessions. Skipped
      // for Recall sessions because audio doesn't flow through our
      // setProcessedAudioCallback on that path - the Recall SDK has its
      // own error events (setCaptureExitCallback above) that cover the
      // equivalent failure modes.
      if (!this.usingRecall) {
        this.startSilenceWatchdog()
      }
      log.info(
        'Recording started',
        deviceId ? `device: ${deviceId}` : '(default)'
      )

      if (!isProMode()) {
        // Free mode: session starts immediately (transcription is synchronous above)
        this.startSessionOnce()
      } else if (isProMode() && this.usingRecall && this.activeProvider) {
        // Recall implies transcription is already connected.
        this.broadcastTranscriptionConnectionState({
          phase: 'connected',
          provider: 'recall',
          retryCount: 0,
          maxRetries: 3,
          nextRetryAt: null,
        })
        this.startSessionOnce()
      } else if (isProMode()) {
        this.broadcastTranscriptionConnectionState({
          phase: 'connecting',
          provider: 'assemblyai',
          retryCount: 0,
          maxRetries: 3,
          nextRetryAt: null,
        })
      }

      if (shouldStartProRetryLoop) {
        // Start transcription asynchronously with retries. Recording can begin
        // immediately, but we delay session creation until transcription is connected.
        this.startProTranscriptionWithRetries().catch((err) => {
          log.error('Pro transcription retry loop crashed:', err)
        })
      }

      return { success: true }

      } finally {
        this.isStarting = false
      }
    })

    ipcMain.handle('audio:stop-recording', async () => {
      return await this.stopRecordingInternal({ reason: 'USER_STOP' })
    })

    ipcMain.handle('audio:get-state', async () => {
      return {
        isRecording: this.isRecording,
        duration: this.recordingStartTime ? Date.now() - this.recordingStartTime : 0
      }
    })

    ipcMain.handle('audio:get-transcript', async () => {
      const provider = this.activeProvider || this.transcriptionService
      return provider.getFullTranscriptWithInterims()
    })

    ipcMain.handle('audio:clear-transcript', async () => {
      const provider = this.activeProvider || this.transcriptionService
      provider.clearTranscript()
      return { success: true }
    })

    ipcMain.handle('audio:get-transcript-entries', async () => {
      const provider = this.activeProvider || this.transcriptionService
      return provider.getTranscriptEntries()
    })

    ipcMain.handle('audio:get-transcript-by-source', async (_event, source: 'mic' | 'system' | 'all') => {
      const provider = this.activeProvider || this.transcriptionService
      return provider.getTranscriptBySource(source)
    })
  }

  private startSessionOnce(): void {
    if (this.proSessionStarted) return
    this.proSessionStarted = true
    sessionManager.startSession(null)
  }

  private broadcastTranscriptionConnectionState(payload: {
    phase: 'idle' | 'connecting' | 'retrying' | 'connected' | 'failed'
    provider?: 'recall' | 'assemblyai' | 'deepgram' | null
    retryCount?: number
    maxRetries?: number
    nextRetryAt?: number | null
    message?: string
    error?: string
  }): void {
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('transcription:connection-state', payload)
      }
    } catch { /* ignore */ }
    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('transcription:connection-state', payload)
      }
    } catch { /* ignore */ }
  }

  private clearTranscriptionRetryLoop(): void {
    if (this.transcriptionRetryTimer) {
      clearTimeout(this.transcriptionRetryTimer)
      this.transcriptionRetryTimer = null
    }
    if (this.transcriptionStartupAbort) {
      try { this.transcriptionStartupAbort.abort() } catch { /* ignore */ }
      this.transcriptionStartupAbort = null
    }
  }

  private async stopRecordingInternal(opts: { reason: 'USER_STOP' | 'TRANSCRIPTION_FAILED' | 'SESSION_TIME_LIMIT' | 'CAPTURE_DIED' }): Promise<{ success: boolean; duration: number }> {
    this.clearSessionTimer()
    this.clearTranscriptionRetryLoop()
    this.stopSilenceWatchdog()
    this.broadcastTranscriptionConnectionState({ phase: 'idle', provider: null, retryCount: 0, maxRetries: 3, nextRetryAt: null })

    if (!this.usingRecall) {
      stopCapture()
    }

    if (this.activeProvider) {
      await this.activeProvider.stop()
    }

    const session = sessionManager.endSession()
    if (session) {
      log.info('Session saved with', session.transcript.length, 'entries')
    }

    if (this.activeProvider) {
      this.activeProvider.clearTranscript()
    }
    this.activeProvider = null
    this.usingAssemblyAI = false
    this.usingRecall = false
    this.proSessionStarted = false

    this.isRecording = false
    const duration = this.recordingStartTime ? Date.now() - this.recordingStartTime : 0
    this.recordingStartTime = null
    this.broadcastRecordingState(false, session?.id || null)

    if (opts.reason === 'TRANSCRIPTION_FAILED' && isProMode()) {
      this.rollbackSessionCount().catch((err) =>
        log.warn('Failed to roll back session count after transcription failure:', err)
      )
      this.broadcastTranscriptionConnectionState({
        phase: 'failed',
        provider: null,
        retryCount: 3,
        maxRetries: 3,
        nextRetryAt: null,
        error: 'Couldn’t connect to transcription after multiple retries.',
      })
    }

    if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
      this.dashboardWindow.show()
      this.dashboardWindow.focus()
    }
    log.info(
      `Recording stopped (${opts.reason}). Chunks: ${this.chunkCount}, Duration: ${Math.round(duration / 1000)}s`
    )
    return { success: true, duration }
  }

  private async startProTranscriptionWithRetries(): Promise<void> {
    // Cancel any previous loop
    this.clearTranscriptionRetryLoop()
    this.transcriptionStartupAbort = new AbortController()
    const { signal } = this.transcriptionStartupAbort

    const CONNECT_TIMEOUT_MS = 5000
    const RETRY_EVERY_MS = 10_000
    const MAX_RETRIES = 3 // retries after initial attempt (total attempts = 4)

    const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
      let t: ReturnType<typeof setTimeout> | null = null
      try {
        return await Promise.race([
          p,
          new Promise<T>((_resolve, reject) => {
            t = setTimeout(() => reject(new Error('CONNECT_TIMEOUT')), ms)
          }),
        ])
      } finally {
        if (t) clearTimeout(t)
      }
    }

    const stopIfAborted = () => {
      if (signal.aborted || !this.isRecording) {
        throw new Error('ABORTED')
      }
    }

    const attemptChainOnce = async (): Promise<{ ok: boolean }> => {
      stopIfAborted()

      // 1) AssemblyAI
      try {
        this.broadcastTranscriptionConnectionState({
          phase: 'connecting',
          provider: 'assemblyai',
        })
        const { AssemblyAITranscriptionService } = await import(
          /* @vite-ignore */ '../pro/main/assemblyAITranscriptionService'
        )
        const aaiService = new AssemblyAITranscriptionService()
        aaiService.setWindows(this.dashboardWindow, this.overlayWindow)
        aaiService.setFallbackHandler(async () => {
          // Fallback during an active session is handled by the service.
          // Startup retries are coordinated by AudioManager.
          log.warn('AssemblyAI signaled fallback during active session')
        })

        const result = await withTimeout(aaiService.start(), CONNECT_TIMEOUT_MS)
        stopIfAborted()

        if (result?.success) {
          this.activeProvider = aaiService
          this.usingAssemblyAI = true
          log.info('Pro transcription: AssemblyAI connected')
          this.broadcastTranscriptionConnectionState({
            phase: 'connected',
            provider: 'assemblyai',
            retryCount: 0,
            maxRetries: MAX_RETRIES,
            nextRetryAt: null,
          })
          this.startSessionOnce()
          return { ok: true }
        }

        try { await aaiService.stop() } catch { /* ignore */ }
      } catch (err) {
        if (err instanceof Error && err.message === 'CONNECT_TIMEOUT') {
          log.warn('AssemblyAI connect timed out')
        } else if (err instanceof Error && err.message === 'ABORTED') {
          throw err
        } else {
          log.warn('AssemblyAI connect failed:', err)
        }
      }

      // 2) Deepgram fallback
      stopIfAborted()
      try {
        this.broadcastTranscriptionConnectionState({
          phase: 'connecting',
          provider: 'deepgram',
        })

        // Ensure any previous Deepgram attempts are cleaned up
        try { await this.transcriptionService.stop() } catch { /* ignore */ }

        // In pro mode, the Deepgram key comes from the backend. Ensure it's cached.
        let deepgramKey = getSetting('deepgramApiKey')
        if (!deepgramKey) {
          try {
            const { fetchAndCacheDeepgramKey } = await import(
              /* @vite-ignore */ '../pro/main/managedKeyService'
            )
            await fetchAndCacheDeepgramKey()
            deepgramKey = getSetting('deepgramApiKey')
          } catch {
            log.warn('Could not fetch managed Deepgram key')
          }
        }

        if (!deepgramKey) {
          log.warn('No Deepgram key available for fallback')
          return { ok: false }
        }

        this.transcriptionService.setApiKey(deepgramKey as string)
        this.transcriptionService.clearTranscript()
        const deepgramResult = await withTimeout(this.transcriptionService.start(), CONNECT_TIMEOUT_MS)
        stopIfAborted()

        if (deepgramResult?.success) {
          this.activeProvider = this.transcriptionService
          this.usingAssemblyAI = false
          log.info('Pro transcription: Deepgram fallback connected')
          this.broadcastTranscriptionConnectionState({
            phase: 'connected',
            provider: 'deepgram',
            retryCount: 0,
            maxRetries: MAX_RETRIES,
            nextRetryAt: null,
          })
          this.startSessionOnce()
          return { ok: true }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'CONNECT_TIMEOUT') {
          log.warn('Deepgram connect timed out')
        } else if (err instanceof Error && err.message === 'ABORTED') {
          throw err
        } else {
          log.warn('Deepgram connect failed:', err)
        }
      }

      this.activeProvider = null
      this.usingAssemblyAI = false
      return { ok: false }
    }

    let retries = 0
    const maxRetries = MAX_RETRIES

    while (!signal.aborted && this.isRecording) {
      const chain = await attemptChainOnce()
      if (chain.ok) return

      if (retries >= maxRetries) {
        log.error('All transcription providers failed after retries - auto-stopping recording')
        await this.stopRecordingInternal({ reason: 'TRANSCRIPTION_FAILED' })
        return
      }

      const nextRetryAt = Date.now() + RETRY_EVERY_MS
      this.broadcastTranscriptionConnectionState({
        phase: 'retrying',
        provider: null,
        retryCount: retries,
        maxRetries,
        nextRetryAt,
        message: 'Retrying transcription connection...',
      })

      await new Promise<void>((resolve) => {
        this.transcriptionRetryTimer = setTimeout(() => resolve(), RETRY_EVERY_MS)
      })
      this.transcriptionRetryTimer = null
      retries++
    }
  }

  private broadcastRecordingState(isRecording: boolean, endedSessionId: string | null = null): void {
    const payload = { isRecording, endedSessionId }
    updateTrayRecordingState(isRecording)

    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('audio:recording-state-changed', payload)
      }
    } catch (err) {
      log.error('Failed to send to dashboard:', err)
    }

    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('audio:recording-state-changed', payload)
      }
    } catch (err) {
      log.error('Failed to send to overlay:', err)
    }
  }

  getIsRecording(): boolean {
    return this.isRecording
  }

  private async checkAndStartProSession(): Promise<{
    allowed: boolean
    error?: string
    code?: string
    sessionMaxSeconds?: number
    sessionsUsed?: number
    sessionLimit?: number
    resetAt?: string
  }> {
    try {
      const { _apiRequest } = await import(
        /* @vite-ignore */ '../pro/main/authService'
      )
      const apiRequest = _apiRequest as <T>(path: string, options?: RequestInit) => Promise<T>

      const result = await apiRequest<Record<string, unknown>>(
        '/api/proxy/start-session',
        { method: 'POST' }
      )

      return {
        allowed: result.allowed as boolean ?? true,
        error: result.error as string | undefined,
        code: result.code as string | undefined,
        sessionMaxSeconds: result.sessionMaxSeconds as number | undefined,
        sessionsUsed: result.sessionsUsed as number | undefined,
        sessionLimit: result.sessionLimit as number | undefined,
        resetAt: result.resetAt as string | undefined,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Session check failed'
      const lower = message.toLowerCase()
      const isSessionLimit = lower.includes('session limit')
        || lower.includes('daily session')
      if (isSessionLimit) {
        return { allowed: false, error: message, code: 'SESSION_LIMIT' }
      }
      // Auth-class failures must NOT fall into the "backend unreachable"
      // grace path - they're a different failure mode. The backend IS
      // reachable; we just don't have a valid token. Granting grace
      // here lets a logged-out user start a recording that can't
      // possibly transcribe (caught in staging: Recall/AssemblyAI/
      // Deepgram all return 401 with no token, and the audio pipeline
      // runs for 38s before auto-stopping on provider exhaustion -
      // user sees a "Listening..." indicator capturing silence).
      // Deny + surface a clear re-auth code so the UI can redirect to
      // login.
      const isAuthError = lower.includes('missing authorization token')
        || lower.includes('session expired')
        || lower.includes('unauthorized')
      if (isAuthError) {
        log.warn('Session check blocked - auth required:', message)
        return { allowed: false, error: 'Please sign in to start a recording.', code: 'AUTH_REQUIRED' }
      }
      // True network / backend outage - keep the grace path so a flaky
      // connection doesn't lock the user out mid-meeting.
      log.warn('Session check failed (backend may be unreachable) - allowing grace session:', message)
      return { allowed: true, sessionMaxSeconds: 120, code: 'BACKEND_UNAVAILABLE' }
    }
  }

  private startSessionTimer(maxSeconds: number): void {
    this.clearSessionTimer()
    log.info(`Free-tier session timer started: ${maxSeconds}s`)

    this.sessionTimer = setTimeout(() => {
      if (!this.isRecording) return
      log.info('Free-tier session time limit reached - auto-stopping')

      const payload = { type: 'SESSION_TIME_LIMIT' }
      try {
        if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
          this.overlayWindow.webContents.send('audio:session-limit', payload)
        }
      } catch { /* ignore */ }
      try {
        if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
          this.dashboardWindow.webContents.send('audio:session-limit', payload)
        }
      } catch { /* ignore */ }

      this.stopRecordingInternal({ reason: 'SESSION_TIME_LIMIT' })
        .catch((err) => log.error('Session auto-stop failed:', err))
    }, maxSeconds * 1000)
  }

  private clearSessionTimer(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }
  }

  private async tryStartRecallRecording(): Promise<boolean> {
    try {
      const { isRecallSdkReady, getRecallService } = await import(
        /* @vite-ignore */ '../pro/main/recallService'
      )

      if (!isRecallSdkReady()) {
        log.info('Recall SDK not ready - using native capture')
        return false
      }

      const recallService = getRecallService()
      recallService.setWindows(this.dashboardWindow, this.overlayWindow)

      // If a meeting is already detected (Zoom/Teams/Meet), use its windowId
      // for meeting-specific capture. Otherwise fall back to adhoc desktop audio.
      const meetings = recallService.getDetectedMeetings()
      let result
      if (meetings.length > 0) {
        const meeting = meetings[meetings.length - 1]
        log.info(`Detected meeting: ${meeting.platform || 'unknown'} - using meeting capture`)
        result = await recallService.start(meeting.windowId)
      } else {
        result = await recallService.start()
      }

      if (result.success) {
        this.activeProvider = recallService
        log.info('Recall SDK recording started')
        return true
      }

      log.warn('Recall recording failed to start:', result.error)
      return false
    } catch (err) {
      log.warn('Failed to load Recall service:', err)
      return false
    }
  }

  private async startDeepgramFallback(): Promise<void> {
    let deepgramKey = getSetting('deepgramApiKey')

    // In pro mode, the Deepgram key comes from the backend. Ensure it's cached.
    if (!deepgramKey && isProMode()) {
      try {
        const { fetchAndCacheDeepgramKey } = await import(
          /* @vite-ignore */ '../pro/main/managedKeyService'
        )
        await fetchAndCacheDeepgramKey()
        deepgramKey = getSetting('deepgramApiKey')
      } catch {
        log.warn('Could not fetch managed Deepgram key')
      }
    }

    if (!deepgramKey) {
      log.error('No Deepgram key available for fallback - transcription disabled')
      return
    }

    this.transcriptionService.setApiKey(deepgramKey as string)
    this.transcriptionService.clearTranscript()
    this.activeProvider = this.transcriptionService
    const result = await this.transcriptionService.start()
    if (!result.success) {
      log.error('Deepgram fallback also failed:', result.error)
      this.activeProvider = null
    } else {
      log.info('Deepgram fallback active')
    }
  }

  private async rollbackSessionCount(): Promise<void> {
    try {
      const { _apiRequest } = await import(
        /* @vite-ignore */ '../pro/main/authService'
      )
      const apiRequest = _apiRequest as <T>(path: string, options?: RequestInit) => Promise<T>
      await apiRequest('/api/proxy/rollback-session', { method: 'POST' })
      log.info('Session count rolled back after transcription failure')
    } catch (err) {
      log.warn('Session rollback request failed:', err)
    }
  }

  /**
   * Push a user-visible error notification to the overlay + dashboard.
   * Uses the same 'overlay:notification' channel the preload whitelist
   * permits (see src/preload/index.ts:364-374) and matches
   * OverlayNotification.NotificationData's shape. Before the fix this
   * sent to a bare 'notification' channel with a { message } payload -
   * preload rejected the channel and the overlay's listener would have
   * received nothing, so every "error notification" produced by this
   * method was silently dropped.
   */
  broadcastError(title: string, body: string): void {
    this.broadcastNotification({ title, body, type: 'error', autoDismissMs: 8000 })
  }

  /**
   * Non-fatal user-visible warning (yellow pill instead of red). Same
   * channel + shape as broadcastError; kept separate so the call-site
   * can read clearly whether a given condition is "something is broken,
   * act now" or "heads-up, you may want to act".
   */
  broadcastWarning(title: string, body: string, autoDismissMs = 15000): void {
    this.broadcastNotification({ title, body, type: 'warning', autoDismissMs })
  }

  private broadcastNotification(payload: {
    title: string
    body: string
    type: 'error' | 'warning' | 'info'
    autoDismissMs: number
  }): void {
    const withId = { id: `sys-${Date.now()}`, ...payload }
    try {
      if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
        this.overlayWindow.webContents.send('overlay:notification', withId)
      }
    } catch { /* window torn down - ignore */ }
    try {
      if (this.dashboardWindow && !this.dashboardWindow.isDestroyed()) {
        this.dashboardWindow.webContents.send('overlay:notification', withId)
      }
    } catch { /* window torn down - ignore */ }
  }

  /**
   * Silence watchdog: once per minute while recording, check whether any
   * AEC-processed audio chunk has arrived in the last
   * AUDIO_SILENCE_WARN_THRESHOLD_MS. If not, broadcast a warning once
   * per silence period and leave it at that - the lastAudioChunkAt stamp
   * resets as soon as audio resumes, which also resets silenceWarningSent,
   * so a subsequent silence period can trip another warning.
   *
   * Scoped to native capture because Recall sessions don't flow through
   * setProcessedAudioCallback - the SDK's own error events cover that
   * path. See the usingRecall check at the watchdog start site.
   */
  private startSilenceWatchdog(): void {
    this.stopSilenceWatchdog() // defensive: don't leak intervals on restart
    this.lastAudioChunkAt = Date.now() // grace period - don't warn immediately
    this.silenceWarningSent = false
    this.silenceCheckTimer = setInterval(() => {
      if (!this.isRecording || this.silenceWarningSent) return
      if (this.lastAudioChunkAt === null) return
      const elapsed = Date.now() - this.lastAudioChunkAt
      if (elapsed < AUDIO_SILENCE_WARN_THRESHOLD_MS) return

      this.silenceWarningSent = true
      const minutes = Math.round(elapsed / 60_000)
      log.warn(`Audio silence watchdog tripped - no chunks for ~${minutes} min`)
      this.broadcastWarning(
        'Audio has gone quiet',
        `No audio has reached Raven in about ${minutes} minutes. If this is unexpected, try stopping and restarting the recording.`,
      )
    }, AUDIO_SILENCE_CHECK_INTERVAL_MS)
  }

  private stopSilenceWatchdog(): void {
    if (this.silenceCheckTimer) {
      clearInterval(this.silenceCheckTimer)
      this.silenceCheckTimer = null
    }
    this.lastAudioChunkAt = null
    this.silenceWarningSent = false
  }

  async shutdown(): Promise<void> {
    if (!this.isRecording) return

    log.info('Shutdown: stopping active recording...')
    this.clearSessionTimer()
    this.clearTranscriptionRetryLoop()

    if (!this.usingRecall) {
      stopCapture()
    }

    if (this.activeProvider) {
      await this.activeProvider.stop()
      this.activeProvider.clearTranscript()
    }

    const session = sessionManager.endSession()
    if (session) {
      log.info('Shutdown: session saved with', session.transcript.length, 'entries')
    }

    this.activeProvider = null
    this.usingAssemblyAI = false
    this.usingRecall = false
    this.isRecording = false
    this.recordingStartTime = null
  }
}

/**
 * Fire-and-forget helper for the recording_failed product
 * event. Dynamic-import keeps audioManager test mocks free of a
 * hard dependency on clientEvents; failure is silent (the
 * recording flow has its own user-facing error path).
 */
async function trackRecordingFailed(reason: string): Promise<void> {
  try {
    const { trackEvent } = await import('./services/clientEvents')
    trackEvent('recording_failed', { metadata: { reason } })
  } catch {
    /* OSS or module unavailable */
  }
}
