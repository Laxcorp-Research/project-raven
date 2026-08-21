/**
 * SessionManager - Manages active session lifecycle
 * Coordinates between recording state and database persistence
 */

import { v4 as uuidv4 } from 'uuid';
import { databaseService, type Session, type TranscriptEntry, type AIResponse } from './database';
import { BrowserWindow } from 'electron';
import { generateSessionTitle } from '../claudeService';
import { generateSessionSummary } from './summaryService';
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

class SessionManager {
  private activeSession: Session | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private dashboardWindow: BrowserWindow | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private isIncognito = false;
  private _queueForSync: QueueFn | null = null;
  private notesJobs = new Map<string, Promise<boolean>>();

  /**
   * Called by proLoader once syncService is loaded - eliminates
   * the fragile dynamic import that was silently failing.
   */
  setSyncFunction(fn: QueueFn): void {
    this._queueForSync = fn;
    log.info('Cloud sync function injected');
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
    const session: Session = {
      id: uuidv4(),
      title: this.isIncognito ? 'Incognito Session' : PLACEHOLDER_SESSION_TITLE,
      transcript: [],
      aiResponses: [],
      summary: null,
      insightsJson: null,
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
    const durationSeconds = Math.floor((endedAt - this.activeSession.startedAt) / 1000);
    const finalTranscript = this.activeSession.transcript.filter((e) => e.isFinal);

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
    });

    const endedSession = {
      ...this.activeSession,
      transcript: finalTranscript,
      durationSeconds,
      endedAt,
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
    });

    return endedSession;
  }

  /**
   * Generate title + summary for a session. Dedupes in-flight work so
   * session-end, boot retry, and the regenerate IPC share one job.
   */
  generateAndStoreNotes(
    sessionId: string,
    preloaded?: { transcriptText: string; modeId: string | null; fallbackTitle: string },
  ): Promise<boolean> {
    const existing = this.notesJobs.get(sessionId);
    if (existing) return existing;

    const job = this.runNotesGeneration(sessionId, preloaded).finally(() => {
      this.notesJobs.delete(sessionId);
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
    preloaded?: { transcriptText: string; modeId: string | null; fallbackTitle: string },
  ): Promise<boolean> {
    this.sendDashboard('sessions:summary-pending', sessionId);
    try {
      let transcriptText = preloaded?.transcriptText;
      let modeId = preloaded?.modeId ?? null;
      let fallbackTitle = preloaded?.fallbackTitle ?? PLACEHOLDER_SESSION_TITLE;

      if (!transcriptText) {
        const session = databaseService.getSession(sessionId);
        if (!session?.transcript?.length) return false;
        transcriptText = this.formatTranscript(session.transcript);
        modeId = session.modeId;
        fallbackTitle = session.title;
      }

      if (!transcriptText.trim()) return false;

      const result = await generateSessionSummary(transcriptText, modeId);
      if (result.summary?.trim()) {
        databaseService.updateSession(sessionId, {
          title: result.title || fallbackTitle,
          summary: result.summary,
        });
        this.syncSessionToCloud(sessionId);
        return true;
      }

      if (result.title && !isPlaceholderSessionTitle(result.title)) {
        databaseService.updateSession(sessionId, { title: result.title });
      }
      this.syncSessionToCloud(sessionId);
      return false;
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

    const durationSeconds = Math.floor((Date.now() - this.activeSession.startedAt) / 1000);

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
      ? { id: this.activeSession.id, title: this.activeSession.title, startedAt: this.activeSession.startedAt }
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

      const rawSeconds = Math.floor((Date.now() - inProgress.startedAt) / 1000);
      const durationSeconds = Math.min(MAX_RECOVERED_DURATION_SECONDS, Math.max(0, rawSeconds));
      if (durationSeconds !== rawSeconds) {
        log.warn(
          `Recovered session ${inProgress.id} raw duration ${rawSeconds}s clamped to ${durationSeconds}s`,
        );
      }

      databaseService.updateSession(inProgress.id, {
        endedAt: Date.now(),
        durationSeconds,
        title: isPlaceholderSessionTitle(inProgress.title) ? 'Recovered Session' : inProgress.title,
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
