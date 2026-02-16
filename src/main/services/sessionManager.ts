/**
 * SessionManager - Manages active session lifecycle
 * Coordinates between recording state and database persistence
 */

import { v4 as uuidv4 } from 'uuid';
import Store from 'electron-store';
import { databaseService, type Session, type TranscriptEntry, type AIResponse } from './database';
import { BrowserWindow } from 'electron';
import { generateSessionTitle } from '../claudeService';
import { generateSessionSummary } from './summaryService';

class SessionManager {
  private activeSession: Session | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private dashboardWindow: BrowserWindow | null = null;
  private overlayWindow: BrowserWindow | null = null;

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
      console.log('[SessionManager] Warning: Starting new session while one is active');
      this.endSession();
    }

    const resolvedModeId = modeId ?? databaseService.getActiveMode()?.id ?? null;
    const session: Session = {
      id: uuidv4(),
      title: 'Untitled Session',
      transcript: [],
      aiResponses: [],
      summary: null,
      modeId: resolvedModeId,
      durationSeconds: 0,
      startedAt: Date.now(),
      endedAt: null,
      createdAt: Date.now(),
    };

    this.activeSession = databaseService.createSession(session);

    this.startAutoSave();

    console.log('[SessionManager] Session started:', this.activeSession.id);
    this.broadcastSessionUpdate();

    return this.activeSession;
  }

  /**
   * Add a transcript entry to the active session
   */
  addTranscriptEntry(entry: TranscriptEntry): void {
    if (!this.activeSession) {
      console.log('[SessionManager] Warning: No active session for transcript entry');
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
      console.log('[SessionManager] Warning: No active session for AI response');
      return;
    }

    this.activeSession.aiResponses.push(response);
  }

  /**
   * Add a chat message to the active session
   */
  addSessionMessage(role: 'user' | 'assistant', content: string): void {
    if (!this.activeSession) {
      console.log('[SessionManager] Warning: No active session for message');
      return;
    }

    databaseService.addSessionMessage(this.activeSession.id, role, content);
  }

  /**
   * End the active session
   */
  endSession(): Session | null {
    if (!this.activeSession) {
      console.log('[SessionManager] Warning: No active session to end');
      return null;
    }

    this.stopAutoSave();

    const endedAt = Date.now();
    const durationSeconds = Math.floor((endedAt - this.activeSession.startedAt) / 1000);

    const finalTranscript = this.activeSession.transcript.filter((e) => e.isFinal);

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
    const transcriptText = finalTranscript
      .map((e) => `${e.source === 'mic' ? 'You' : 'Them'}: ${e.text}`)
      .join('\n');
    console.log('[SessionManager] Session ended:', sessionId, 'duration:', durationSeconds, 's');

    this.activeSession = null;
    this.broadcastSessionUpdate();
    this.dashboardWindow?.webContents.send('sessions:list-updated');

    // Generate title + summary asynchronously (don't block the stop flow)
    const store = new Store();
    const anthropicApiKey = store.get('anthropicApiKey') as string;
    if (anthropicApiKey) {
      generateSessionSummary(transcriptText, modeId, anthropicApiKey)
        .then((result) => {
          databaseService.updateSession(sessionId, {
            title: result.title || endedSession.title,
            summary: result.summary,
          });
          this.dashboardWindow?.webContents.send('sessions:list-updated');
        })
        .catch((err) => {
          console.error('[SessionManager] Async summary generation failed:', err);
        });
    } else {
      console.warn('[SessionManager] No Anthropic API key — summary disabled');
    }

    return endedSession;
  }

  /**
   * Generate a title for the session using Claude
   */
  async generateTitle(sessionId: string): Promise<string> {
    const session = databaseService.getSession(sessionId);
    if (!session) {
      console.log('[SessionManager] Cannot generate title: session not found');
      return 'Untitled Session';
    }

    const transcriptText = session.transcript
      .filter((e) => e.isFinal)
      .map((e) => `${e.source === 'mic' ? 'You' : 'Them'}: ${e.text}`)
      .join('\n');

    if (!transcriptText.trim()) {
      return session.title || 'Untitled Session';
    }

    try {
      const store = new Store();
      const anthropicApiKey = store.get('anthropicApiKey') as string;

      if (!anthropicApiKey) {
        throw new Error('No Anthropic API key');
      }

      const title = await generateSessionTitle(anthropicApiKey, transcriptText);

      databaseService.updateSession(sessionId, { title });
      console.log('[SessionManager] Generated title:', title);

      this.dashboardWindow?.webContents.send('sessions:list-updated');

      return title;
    } catch (error) {
      console.error('[SessionManager] Failed to generate title:', error);
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
    if (!this.activeSession) return;

    const durationSeconds = Math.floor((Date.now() - this.activeSession.startedAt) / 1000);

    databaseService.updateSession(this.activeSession.id, {
      transcript: this.activeSession.transcript.filter((e) => e.isFinal),
      aiResponses: this.activeSession.aiResponses,
      durationSeconds,
    });

    console.log('[SessionManager] Auto-saved session:', this.activeSession.id);
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    this.stopAutoSave();
    this.autoSaveInterval = setInterval(() => {
      this.saveSession();
    }, 60000);
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
   * Recover in-progress session on app restart (crash recovery)
   */
  recoverSession(): Session | null {
    const inProgress = databaseService.getInProgressSession();
    if (inProgress) {
      console.log('[SessionManager] Found in-progress session:', inProgress.id);
      const durationSeconds = Math.floor((Date.now() - inProgress.startedAt) / 1000);
      databaseService.updateSession(inProgress.id, {
        endedAt: Date.now(),
        durationSeconds,
        title: inProgress.title === 'Untitled Session' ? 'Recovered Session' : inProgress.title,
      });
      console.log('[SessionManager] Recovered and closed crashed session');
      return inProgress;
    }
    return null;
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
