/**
 * SessionManager - Manages active session lifecycle
 * Coordinates between recording state and database persistence
 */

import { v4 as uuidv4 } from 'uuid';
import { databaseService, type Session, type TranscriptEntry, type AIResponse } from './database';
import { parseSessionSegments, type SessionSegment } from '../../shared/sessionSegments';
import { BrowserWindow } from 'electron';
import { generateSessionTitle } from '../claudeService';
import { generateSessionSummary } from './summaryService';
import { analyzeSession } from './insightsService';
import { indexSession } from './sessionIndexService';
import { normalizeActionItemsForStorage } from '../../shared/actionItems';
import { getSetting } from '../store';
import { createLogger } from '../logger';
import {
  NOTES_RETRY_LIMIT,
  NOTES_RETRY_SCAN,
  SESSION_AUTOSAVE_INTERVAL_MS,
  SUMMARY_MIN_TRANSCRIPT_LENGTH,
} from '../constants';
import {
  isPlaceholderSessionTitle,
  PLACEHOLDER_SESSION_TITLE,
} from '../../shared/sessionDisplay';

const log = createLogger('SessionManager');

interface SyncableSession {
  id: string
  title?: string
  summary?: string
  insightsJson?: string
  transcriptJson?: string
  aiResponsesJson?: string
  modeId?: string
  durationSeconds?: number
  startedAt: string
  endedAt?: string
  clientUpdatedAt?: string
}

type QueueFn = (session: SyncableSession) => void

/**
 * Everything the Assist model needs to pick a resumed session back up.
 * Handed to the restorer registered by ClaudeService (which owns the
 * conversation state) so this module never has to import it.
 */
export interface AssistResumeContext {
  sessionId: string
  title: string
  /** Stored SessionMemory JSON from the earlier sitting, if Assist was used. */
  assistMemoryJson: string | null
  /** Post-call notes from the earlier sitting; the fallback memory source. */
  summary: string | null
  actionItemsJson: string | null
  /** When the session was first recorded and when this sitting began. */
  firstStartedAt: number
  resumedAt: number
}

/**
 * Fired on every session start. `null` means a fresh session: drop the
 * current Assist thread so nothing from the previous meeting can be
 * persisted onto (or answered from) this one. A context means resume.
 */
type AssistSessionHook = (ctx: AssistResumeContext | null) => void

/** Reasons resumeSession can refuse; surfaced to the user by audioManager. */
export type ResumeFailure = 'not_found' | 'incognito'

class SessionManager {
  private activeSession: Session | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private dashboardWindow: BrowserWindow | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private isIncognito = false;
  private _queueForSync: QueueFn | null = null;
  private notesJobs = new Map<string, Promise<boolean>>();
  private assistSessionHook: AssistSessionHook | null = null;

  /**
   * Resume bookkeeping. For a session recorded in one sitting these are
   * `0`, `startedAt`, `[]`, `false`, which makes every duration formula
   * below collapse to the original `now - startedAt`.
   */
  private priorDurationSeconds = 0;
  private segmentStartedAt = 0;
  private segments: SessionSegment[] = [];
  private resumed = false;

  /**
   * Called by proLoader once syncService is loaded - eliminates
   * the fragile dynamic import that was silently failing.
   */
  setSyncFunction(fn: QueueFn): void {
    this._queueForSync = fn;
    log.info('Cloud sync function injected');
  }

  /**
   * Registered by ClaudeService so every session start reaches the Assist
   * thread: reset it for a fresh session, restore earlier memory for a
   * resumed one. Kept as an injected callback (same pattern as
   * setSyncFunction) because ClaudeService imports this module.
   */
  setAssistSessionHook(fn: AssistSessionHook | null): void {
    this.assistSessionHook = fn;
  }

  private notifyAssist(ctx: AssistResumeContext | null): void {
    try {
      this.assistSessionHook?.(ctx);
    } catch (err) {
      log.error('Assist session hook failed (continuing without it):', err);
    }
  }

  /**
   * Persist the Assist model's session memory against the active session.
   * ClaudeService calls this after every turn / memory refresh; no-op for
   * incognito or when nothing is recording.
   */
  saveAssistMemory(memoryJson: string | null): void {
    if (!this.activeSession || this.isIncognito) return;
    this.activeSession.assistMemoryJson = memoryJson;
    databaseService.updateSession(this.activeSession.id, { assistMemoryJson: memoryJson });
  }

  /**
   * Set window references for IPC broadcasts
   */
  setWindows(dashboard: BrowserWindow | null, overlay: BrowserWindow | null): void {
    this.dashboardWindow = dashboard;
    this.overlayWindow = overlay;
  }

  /**
   * Start a new session when recording begins
   */
  startSession(modeId: string | null = null): Session {
    if (this.activeSession) {
      log.warn('Starting new session while one is active');
      this.endSession();
    }

    this.isIncognito = getSetting('incognitoMode') === true;

    const resolvedModeId = modeId ?? databaseService.getActiveMode()?.id ?? null;
    const now = Date.now();
    this.resetResumeState(now);
    const session: Session = {
      id: uuidv4(),
      title: this.isIncognito ? 'Incognito Session' : PLACEHOLDER_SESSION_TITLE,
      transcript: [],
      aiResponses: [],
      summary: null,
      insightsJson: null,
      actionItemsJson: null,
      followUpEmail: null,
      segmentsJson: null,
      assistMemoryJson: null,
      modeId: resolvedModeId,
      durationSeconds: 0,
      startedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
    };

    if (this.isIncognito) {
      this.activeSession = session;
      log.info('Incognito session started (not persisted):', session.id);
    } else {
      this.activeSession = databaseService.createSession(session);
      this.startAutoSave();
      log.info('Session started:', this.activeSession.id);
    }

    // Fresh session: the Assist thread must not carry the previous
    // meeting over, whichever Start path got us here.
    this.notifyAssist(null);

    this.broadcastSessionUpdate();

    // Server-attributed product event. Dynamic-import keeps this
    // free of a hard dependency on the clientEvents module (so
    // sessionManager.test.ts doesn't have to mock it).
    void (async () => {
      try {
        const { trackEvent } = await import('./clientEvents');
        trackEvent('recording_started', {
          sessionId: this.activeSession!.id,
          metadata: {
            incognito: this.isIncognito,
            modeId: resolvedModeId,
          },
        });
      } catch { /* OSS or module unavailable */ }
    })();

    return this.activeSession;
  }

  /**
   * Reopen a saved session so recording continues into it. The transcript,
   * AI responses, notes and id all carry over; a new segment is appended so
   * duration excludes the gap between sittings. Returns the reopened
   * session (caller seeds the STT provider from `transcript`) or a failure
   * reason.
   */
  resumeSession(sessionId: string): { session: Session } | { error: ResumeFailure } {
    const blocker = this.canResume(sessionId);
    if (blocker) {
      log.warn('Cannot resume session', sessionId, blocker);
      return { error: blocker };
    }
    const stored = databaseService.getSession(sessionId)!;

    if (this.activeSession) {
      log.warn('Resuming a session while one is active');
      this.endSession();
    }

    this.isIncognito = false;
    const now = Date.now();

    // Reconstruct the first sitting for sessions recorded before segments
    // existed, so the divider and duration math have a complete history.
    const priorSegments = parseSessionSegments(stored.segmentsJson);
    const history: SessionSegment[] = priorSegments.length > 0
      ? priorSegments.map((s) => ({ ...s, endedAt: s.endedAt ?? stored.endedAt ?? s.startedAt }))
      : [{
          startedAt: stored.startedAt,
          endedAt: stored.endedAt ?? stored.startedAt + stored.durationSeconds * 1000,
        }];

    this.priorDurationSeconds = Math.max(0, stored.durationSeconds || 0);
    this.segmentStartedAt = now;
    this.segments = [...history, { startedAt: now, endedAt: null }];
    this.resumed = true;
    const segmentsJson = JSON.stringify(this.segments);

    // Insights and the follow-up email described only the earlier sitting;
    // clear them so the dashboard offers to regenerate over the whole
    // session. Summary/action items are regenerated automatically at end.
    databaseService.updateSession(sessionId, {
      endedAt: null,
      segmentsJson,
      insightsJson: null,
      followUpEmail: null,
    });

    this.activeSession = {
      ...stored,
      transcript: stored.transcript.filter((e) => e.isFinal),
      endedAt: null,
      segmentsJson,
      insightsJson: null,
      followUpEmail: null,
    };
    this.startAutoSave();
    log.info(
      'Session resumed:',
      sessionId,
      `sitting #${this.segments.length}, prior ${this.priorDurationSeconds}s,`,
      this.activeSession.transcript.length,
      'entries carried over',
    );

    this.broadcastSessionUpdate();
    this.sendDashboard('sessions:list-updated');

    this.notifyAssist({
      sessionId,
      title: stored.title,
      assistMemoryJson: stored.assistMemoryJson,
      summary: stored.summary,
      actionItemsJson: stored.actionItemsJson,
      firstStartedAt: stored.startedAt,
      resumedAt: now,
    });

    void (async () => {
      try {
        const { trackEvent } = await import('./clientEvents');
        trackEvent('recording_started', {
          sessionId,
          metadata: { incognito: false, modeId: stored.modeId, resumed: true },
        });
      } catch { /* OSS or module unavailable */ }
    })();

    return { session: this.activeSession };
  }

  /**
   * Why a session cannot be resumed right now, or null if it can. Checked
   * by audioManager before capture starts and again inside resumeSession.
   */
  canResume(sessionId: string): ResumeFailure | null {
    if (getSetting('incognitoMode') === true) return 'incognito';
    if (!databaseService.getSession(sessionId)) return 'not_found';
    return null;
  }

  /** Whether the active session was reopened from a saved one. */
  isResumedSession(): boolean {
    return this.activeSession !== null && this.resumed;
  }

  /**
   * What a live timer needs: when the current sitting began and how much
   * was recorded before it. `now - startedAt` is wrong for a resumed
   * session (it spans the gap between sittings).
   */
  getActiveTiming(): { recordingStartedAt: number; priorDurationSeconds: number } | null {
    if (!this.activeSession) return null;
    return { recordingStartedAt: this.segmentStartedAt, priorDurationSeconds: this.priorDurationSeconds };
  }

  private resetResumeState(startedAt: number): void {
    this.priorDurationSeconds = 0;
    this.segmentStartedAt = startedAt;
    this.segments = [];
    this.resumed = false;
  }

  /**
   * Seconds recorded so far: earlier sittings plus the current one. For a
   * never-resumed session this is exactly `now - startedAt`.
   */
  private elapsedSeconds(now: number): number {
    const current = Math.floor((now - this.segmentStartedAt) / 1000);
    return this.priorDurationSeconds + Math.max(0, current);
  }

  /** Close the live segment at `endedAt`; null when the session has none. */
  private closedSegmentsJson(endedAt: number): string | null {
    if (this.segments.length === 0) return null;
    const closed = this.segments.map((s) => (s.endedAt === null ? { ...s, endedAt } : s));
    return JSON.stringify(closed);
  }

  /**
   * Add a transcript entry to the active session
   */
  addTranscriptEntry(entry: TranscriptEntry): void {
    if (!this.activeSession) {
      log.warn('No active session for transcript entry');
      return;
    }

    if (entry.isFinal) {
      this.activeSession.transcript = this.activeSession.transcript.filter(
        (e) => e.id !== entry.id && (e.isFinal || e.source !== entry.source)
      );
      this.activeSession.transcript.push(entry);
    } else {
      const existingIndex = this.activeSession.transcript.findIndex(
        (e) => !e.isFinal && e.source === entry.source
      );
      if (existingIndex >= 0) {
        this.activeSession.transcript[existingIndex] = entry;
      } else {
        this.activeSession.transcript.push(entry);
      }
    }

    this.activeSession.transcript.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Add an AI response to the active session
   */
  addAIResponse(response: AIResponse): void {
    if (!this.activeSession) {
      log.warn('No active session for AI response');
      return;
    }

    this.activeSession.aiResponses.push(response);
  }

  /**
   * Add a chat message to the active session
   */
  addSessionMessage(role: 'user' | 'assistant', content: string): void {
    if (!this.activeSession) {
      log.warn('No active session for message');
      return;
    }

    if (!this.isIncognito) {
      databaseService.addSessionMessage(this.activeSession.id, role, content);
    }
  }

  /**
   * End the active session
   */
  endSession(): Session | null {
    if (!this.activeSession) {
      log.warn('No active session to end');
      return null;
    }

    this.stopAutoSave();

    const endedAt = Date.now();
    const durationSeconds = this.elapsedSeconds(endedAt);
    const finalTranscript = this.activeSession.transcript.filter((e) => e.isFinal);
    const wasResumed = this.resumed;
    const segmentsJson = this.closedSegmentsJson(endedAt);
    this.resetResumeState(endedAt);

    if (this.isIncognito) {
      const endedSession = {
        ...this.activeSession,
        transcript: finalTranscript,
        durationSeconds,
        endedAt,
      };
      log.info('Incognito session ended (discarded):', this.activeSession.id, 'duration:', durationSeconds, 's');
      this.activeSession = null;
      this.isIncognito = false;
      this.broadcastSessionUpdate();
      return endedSession;
    }

    databaseService.updateSession(this.activeSession.id, {
      transcript: finalTranscript,
      aiResponses: this.activeSession.aiResponses,
      durationSeconds,
      endedAt,
      ...(segmentsJson !== null ? { segmentsJson } : {}),
    });

    const endedSession = {
      ...this.activeSession,
      transcript: finalTranscript,
      durationSeconds,
      endedAt,
      segmentsJson: segmentsJson ?? this.activeSession.segmentsJson,
    };

    const sessionId = this.activeSession.id;
    const modeId = this.activeSession.modeId;
    const displayName = getSetting('displayName') || 'You';
    const transcriptText = finalTranscript
      .map((e) => `${e.source === 'mic' ? displayName : 'Them'}: ${e.text}`)
      .join('\n');
    log.info('Session ended:', sessionId, 'duration:', durationSeconds, 's');

    // Server-attributed product event. Mirrors the start path
    // above; same dynamic-import shape to keep tests free of
    // a hard dependency on clientEvents.
    void (async () => {
      try {
        const { trackEvent } = await import('./clientEvents');
        trackEvent('recording_ended', {
          sessionId,
          metadata: { durationSeconds, modeId },
        });
      } catch { /* OSS or module unavailable */ }
    })();

    this.activeSession = null;
    this.broadcastSessionUpdate();
    this.sendDashboard('sessions:list-updated');

    void this.generateAndStoreNotes(sessionId, {
      transcriptText,
      modeId,
      fallbackTitle: endedSession.title,
      // A resumed session already has a title the user has been living
      // with (and may have edited); regenerate the notes, not the name.
      preserveTitle: wasResumed && !isPlaceholderSessionTitle(endedSession.title),
      // If the earlier sitting's notes are still being written, run after
      // them so the two-sitting notes are what ends up stored.
      afterInFlight: wasResumed,
    });

    return endedSession;
  }

  /**
   * Generate title + summary for a session. Dedupes in-flight work so
   * session-end, boot retry, and the regenerate IPC share one job.
   * `afterInFlight` instead queues a fresh run behind the current job,
   * for callers whose input has changed since it started.
   */
  generateAndStoreNotes(
    sessionId: string,
    preloaded?: {
      transcriptText: string;
      modeId: string | null;
      fallbackTitle: string;
      preserveTitle?: boolean;
      afterInFlight?: boolean;
    },
  ): Promise<boolean> {
    const existing = this.notesJobs.get(sessionId);
    if (existing && !preloaded?.afterInFlight) return existing;

    const run = (): Promise<boolean> => this.runNotesGeneration(sessionId, preloaded);
    const job: Promise<boolean> = (existing ? existing.then(run, run) : run()).finally(() => {
      // Only clear our own entry; a chained successor may have replaced it.
      if (this.notesJobs.get(sessionId) === job) this.notesJobs.delete(sessionId);
    });
    this.notesJobs.set(sessionId, job);
    return job;
  }

  /**
   * On boot, retry notes for ended sessions that still have a transcript
   * but no summary. Session-end generation is fire-and-forget; quitting
   * or a thrown notes-slot error left those rows as Untitled forever.
   */
  async retryMissingNotes(): Promise<number> {
    let started = 0;
    const rows = databaseService.getAllSessionSummaries(NOTES_RETRY_SCAN);
    for (const row of rows) {
      if (started >= NOTES_RETRY_LIMIT) break;
      if (row.summary?.trim()) continue;
      if (!row.endedAt) continue;
      if ((row.durationSeconds ?? 0) <= 0) continue;

      const session = databaseService.getSession(row.id);
      if (!session?.transcript?.length) continue;

      const transcriptText = this.formatTranscript(session.transcript);
      if (transcriptText.trim().length < SUMMARY_MIN_TRANSCRIPT_LENGTH) continue;

      started += 1;
      await this.generateAndStoreNotes(row.id, {
        transcriptText,
        modeId: session.modeId,
        fallbackTitle: session.title,
      });
    }
    if (started > 0) {
      log.info(`Retried notes generation for ${started} session(s) missing a summary`);
    }
    return started;
  }

  private formatTranscript(transcript: TranscriptEntry[]): string {
    const displayName = getSetting('displayName') || 'You';
    return transcript
      .filter((e) => e.isFinal)
      .map((e) => `${e.source === 'mic' ? displayName : 'Them'}: ${e.text}`)
      .join('\n');
  }

  private sendDashboard(channel: string, ...args: unknown[]): void {
    this.dashboardWindow?.webContents?.send(channel, ...args);
  }

  private async runNotesGeneration(
    sessionId: string,
    preloaded?: { transcriptText: string; modeId: string | null; fallbackTitle: string; preserveTitle?: boolean },
  ): Promise<boolean> {
    this.sendDashboard('sessions:summary-pending', sessionId);
    try {
      let transcriptText = preloaded?.transcriptText;
      let modeId = preloaded?.modeId ?? null;
      let fallbackTitle = preloaded?.fallbackTitle ?? PLACEHOLDER_SESSION_TITLE;
      const preserveTitle = preloaded?.preserveTitle === true;

      if (!transcriptText) {
        const session = databaseService.getSession(sessionId);
        if (!session?.transcript?.length) return false;
        transcriptText = this.formatTranscript(session.transcript);
        modeId = session.modeId;
        fallbackTitle = session.title;
      }

      if (!transcriptText.trim()) return false;

      const result = await generateSessionSummary(transcriptText, modeId);

      let notesOk = false;
      if (result.summary?.trim()) {
        databaseService.updateSession(sessionId, {
          ...(preserveTitle ? {} : { title: result.title || fallbackTitle }),
          summary: result.summary,
        });
        notesOk = true;
      } else if (!preserveTitle && result.title && !isPlaceholderSessionTitle(result.title)) {
        databaseService.updateSession(sessionId, { title: result.title });
      }

      // Best-effort structured action items. Runs after the summary is stored
      // so it never delays the summary write, and its own try/catch means a
      // failure here never affects the summary result.
      await this.generateAndStoreActionItems(sessionId, transcriptText);

      // Fire-and-forget local transcript indexing for ask-my-meetings. Never
      // awaited or allowed to affect the notes result; embeddings are local.
      void indexSession(sessionId).catch((err) => {
        log.error('Session indexing failed (non-fatal):', err);
      });

      this.syncSessionToCloud(sessionId);
      return notesOk;
    } catch (err) {
      log.error('Async summary generation failed:', err);
      this.syncSessionToCloud(sessionId);
      return false;
    } finally {
      this.sendDashboard('sessions:summary-done', sessionId);
      this.sendDashboard('sessions:list-updated');
    }
  }

  /**
   * Extract structured action items ({task, assignee, deadline}) from the
   * transcript and persist them as JSON. Fully best-effort: any failure
   * (no API key, model error, unparseable output) is logged and swallowed so
   * the notes pipeline is never blocked. Reuses the notes-model action_items
   * prompt via analyzeSession, so it runs on the user's own cheap notes model.
   */
  private async generateAndStoreActionItems(
    sessionId: string,
    transcriptText: string,
  ): Promise<void> {
    try {
      const result = await analyzeSession({
        transcript: transcriptText,
        features: ['action_items'],
        sessionId,
      });
      if (result.error) {
        log.warn('Action item extraction skipped:', result.error);
        return;
      }
      const normalized = normalizeActionItemsForStorage(
        typeof result.actionItems === 'string' ? result.actionItems : null,
      );
      if (normalized) {
        databaseService.updateSession(sessionId, { actionItemsJson: normalized });
      }
    } catch (err) {
      log.error('Action item extraction failed (non-fatal):', err);
    }
  }

  /**
   * Generate a title for the session using Claude
   */
  async generateTitle(sessionId: string): Promise<string> {
    const session = databaseService.getSession(sessionId);
    if (!session) {
      log.warn('Cannot generate title: session not found');
      return PLACEHOLDER_SESSION_TITLE;
    }

    const titleDisplayName = getSetting('displayName') || 'You';
    const transcriptText = session.transcript
      .filter((e) => e.isFinal)
      .map((e) => `${e.source === 'mic' ? titleDisplayName : 'Them'}: ${e.text}`)
      .join('\n');

    if (!transcriptText.trim()) {
      return session.title || PLACEHOLDER_SESSION_TITLE;
    }

    try {
      const title = await generateSessionTitle(transcriptText);

      databaseService.updateSession(sessionId, { title });
      log.info('Generated title:', title);

      this.dashboardWindow?.webContents.send('sessions:list-updated');

      return title;
    } catch (error) {
      log.error('Failed to generate title:', error);
      const fallback = this.generateFallbackTitle(session.startedAt);
      databaseService.updateSession(sessionId, { title: fallback });
      return fallback;
    }
  }

  /**
   * Generate a fallback title based on timestamp
   */
  private generateFallbackTitle(timestamp: number): string {
    const date = new Date(timestamp);
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
    return `Session at ${timeStr}, ${dateStr}`;
  }

  /**
   * Get the active session
   */
  getActiveSession(): Session | null {
    return this.activeSession;
  }

  /**
   * Check if there's an active session
   */
  hasActiveSession(): boolean {
    return this.activeSession !== null;
  }

  /**
   * Auto-save current session to database
   */
  private saveSession(): void {
    if (!this.activeSession || this.isIncognito) return;

    const durationSeconds = this.elapsedSeconds(Date.now());

    databaseService.updateSession(this.activeSession.id, {
      transcript: this.activeSession.transcript.filter((e) => e.isFinal),
      aiResponses: this.activeSession.aiResponses,
      durationSeconds,
    });

    log.debug('Auto-saved session:', this.activeSession.id);
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    this.stopAutoSave();
    this.autoSaveInterval = setInterval(() => {
      this.saveSession();
    }, SESSION_AUTOSAVE_INTERVAL_MS);
  }

  /**
   * Stop auto-save interval
   */
  private stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * Broadcast session update to all windows
   */
  private broadcastSessionUpdate(): void {
    const sessionInfo = this.activeSession
      ? {
          id: this.activeSession.id,
          title: this.activeSession.title,
          startedAt: this.activeSession.startedAt,
          resumed: this.resumed,
          // For live timers; see getActiveTiming.
          recordingStartedAt: this.segmentStartedAt,
          priorDurationSeconds: this.priorDurationSeconds,
        }
      : null;

    this.dashboardWindow?.webContents.send('session:updated', sessionInfo);
    this.overlayWindow?.webContents.send('session:updated', sessionInfo);
  }

  /**
   * Queue a session for cloud sync. Called after endSession, after
   * insight generation, after summary edits - any local mutation.
   */
  syncSessionToCloud(sessionId: string): void {
    if (!this._queueForSync) return

    const session = databaseService.getSession(sessionId)
    if (!session) return

    log.info('Queuing session for cloud sync:', sessionId)
    this._queueForSync({
      id: session.id,
      title: session.title,
      summary: session.summary ?? undefined,
      insightsJson: session.insightsJson ?? undefined,
      transcriptJson: JSON.stringify(session.transcript),
      aiResponsesJson: JSON.stringify(session.aiResponses),
      modeId: session.modeId ?? undefined,
      durationSeconds: session.durationSeconds,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: session.endedAt ? new Date(session.endedAt).toISOString() : undefined,
      clientUpdatedAt: new Date(session.updatedAt).toISOString(),
    })
  }

  /**
   * Recover in-progress session(s) on app restart (crash recovery).
   *
   * Handles three edge cases that the single-session implementation missed:
   *
   * 1. Multiple orphaned sessions: in theory only one session can be
   *    "in progress" at a time, but a DB race (two app instances, a
   *    sync bug, manual SQL) could leave more than one with
   *    ended_at=NULL. We close ALL of them, not just the most recent.
   *
   * 2. Duration from clock skew: if the host clock went backwards
   *    since startedAt (NTP correction, VM resume), raw duration is
   *    negative. Clamped to 0.
   *
   * 3. Forgotten sessions: if a user started recording then force-
   *    quit the app without stopping and didn't reopen for days,
   *    raw duration is measured in DAYS. Cap at 8 hours - anything
   *    longer is obviously not a real meeting and poisons stats.
   */
  recoverSession(): Session | null {
    const MAX_RECOVERED_DURATION_SECONDS = 8 * 60 * 60;
    let firstRecovered: Session | null = null;
    let count = 0;

    // Loop via the single-fetch helper so we don't need a second
    // "get all" DB method for a path that's only meant to drain a
    // handful of rows on boot. Each iteration closes one session,
    // so the next getInProgressSession call returns the next oldest
    // or null.
    let inProgress = databaseService.getInProgressSession();
    while (inProgress) {
      count += 1;
      if (!firstRecovered) firstRecovered = inProgress;

      // A resumed session that died mid-sitting: `now - startedAt` spans
      // the gap between sittings (days, not minutes), so the 8h clamp would
      // store junk. Autosave kept duration_seconds current to within one
      // interval, so trust it and close the open segment at the last save.
      const segments = parseSessionSegments(inProgress.segmentsJson);
      const openSegment = segments.find((s) => s.endedAt === null);
      let durationSeconds: number;
      let segmentsJson: string | undefined;
      if (openSegment) {
        durationSeconds = Math.max(0, inProgress.durationSeconds || 0);
        const closedAt = Math.max(openSegment.startedAt, inProgress.updatedAt);
        segmentsJson = JSON.stringify(
          segments.map((s) => (s.endedAt === null ? { ...s, endedAt: closedAt } : s)),
        );
        log.info(`Recovered resumed session ${inProgress.id}; kept autosaved duration ${durationSeconds}s`);
      } else {
        const rawSeconds = Math.floor((Date.now() - inProgress.startedAt) / 1000);
        durationSeconds = Math.min(MAX_RECOVERED_DURATION_SECONDS, Math.max(0, rawSeconds));
        if (durationSeconds !== rawSeconds) {
          log.warn(
            `Recovered session ${inProgress.id} raw duration ${rawSeconds}s clamped to ${durationSeconds}s`,
          );
        }
      }

      databaseService.updateSession(inProgress.id, {
        endedAt: Date.now(),
        durationSeconds,
        title: isPlaceholderSessionTitle(inProgress.title) ? 'Recovered Session' : inProgress.title,
        ...(segmentsJson !== undefined ? { segmentsJson } : {}),
      });
      log.info(`Recovered and closed session ${inProgress.id}`);
      inProgress = databaseService.getInProgressSession();
    }

    if (count > 1) {
      log.warn(
        `Recovered ${count} orphaned in-progress sessions on this boot - usually means only one, check for a race or sync bug if this persists`,
      );
    }

    return firstRecovered;
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
