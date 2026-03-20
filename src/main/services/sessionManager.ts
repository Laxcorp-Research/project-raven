/**
 * SessionManager - Manages active session lifecycle
 * Coordinates between recording state and database persistence
 */

import { v4 as uuidv4 } from 'uuid';
import { databaseService, type Session, type TranscriptEntry, type AIResponse } from './database';
import { BrowserWindow } from 'electron';
import { generateSessionTitle } from '../claudeService';
import { generateSessionSummary } from './summaryService';
import { getSetting, isProMode } from '../store';
import { createLogger } from '../logger';
import { SESSION_AUTOSAVE_INTERVAL_MS } from '../constants';

const log = createLogger('SessionManager');

class SessionManager {
  private activeSession: Session | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private dashboardWindow: BrowserWindow | null = null;
  private overlayWindow: BrowserWindow | null = null;
  private isIncognito = false;

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
    const session: Session = {
      id: uuidv4(),
      title: this.isIncognito ? 'Incognito Session' : 'Untitled Session',
      transcript: [],
      aiResponses: [],
      summary: null,
      modeId: resolvedModeId,
      durationSeconds: 0,
      startedAt: Date.now(),
      endedAt: null,
      createdAt: Date.now(),
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

    this.activeSession = null;
    this.broadcastSessionUpdate();
    this.dashboardWindow?.webContents.send('sessions:list-updated');

    generateSessionSummary(transcriptText, modeId)
      .then((result) => {
        databaseService.updateSession(sessionId, {
          title: result.title || endedSession.title,
          summary: result.summary,
        });
        this.dashboardWindow?.webContents.send('sessions:list-updated');
        this.syncSessionToCloud(sessionId);
      })
      .catch((err) => {
        log.error('Async summary generation failed:', err);
        this.syncSessionToCloud(sessionId);
      });

    return endedSession;
  }

  /**
   * Generate a title for the session using Claude
   */
  async generateTitle(sessionId: string): Promise<string> {
    const session = databaseService.getSession(sessionId);
    if (!session) {
      log.warn('Cannot generate title: session not found');
      return 'Untitled Session';
    }

    const titleDisplayName = getSetting('displayName') || 'You';
    const transcriptText = session.transcript
      .filter((e) => e.isFinal)
      .map((e) => `${e.source === 'mic' ? titleDisplayName : 'Them'}: ${e.text}`)
      .join('\n');

    if (!transcriptText.trim()) {
      return session.title || 'Untitled Session';
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
   * Queue a completed session for cloud sync (pro mode only).
   * Reads the latest version from SQLite (which includes title/summary)
   * and converts to the format expected by the backend.
   */
  private syncSessionToCloud(sessionId: string): void {
    if (!isProMode()) return

    try {
      const session = databaseService.getSession(sessionId)
      if (!session) return

      import(/* @vite-ignore */ '../../pro/main/syncService')
        .then(({ queueSessionForSync }) => {
          queueSessionForSync({
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
          })
        })
        .catch((err) => log.warn('Cloud sync failed:', err))
    } catch (err) {
      log.warn('Pro sync module not available:', err)
    }
  }

  /**
   * Recover in-progress session on app restart (crash recovery)
   */
  recoverSession(): Session | null {
    const inProgress = databaseService.getInProgressSession();
    if (inProgress) {
      log.info('Found in-progress session:', inProgress.id);
      const durationSeconds = Math.floor((Date.now() - inProgress.startedAt) / 1000);
      databaseService.updateSession(inProgress.id, {
        endedAt: Date.now(),
        durationSeconds,
        title: inProgress.title === 'Untitled Session' ? 'Recovered Session' : inProgress.title,
      });
      log.info('Recovered and closed crashed session');
      return inProgress;
    }
    return null;
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
