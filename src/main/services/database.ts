/**
 * Database Service - SQLite persistence for sessions
 * Uses better-sqlite3 for synchronous, reliable local storage
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';
import { up as migration005 } from './migrations/005_add_session_messages';
import { createLogger } from '../logger';

const log = createLogger('Database');

// Types
export interface TranscriptEntry {
  id: string;
  source: 'mic' | 'system';
  text: string;
  timestamp: number;
  isFinal: boolean;
  speakerName?: string | null;
}

export interface AIResponse {
  id: string;
  action: string;
  userMessage: string;
  response: string;
  timestamp: number;
}

export interface Mode {
  id: string;
  name: string;
  systemPrompt: string;
  icon: string;
  color: string;
  isDefault: boolean;
  isBuiltin: boolean;
  notesTemplate: NotesSection[] | null;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
}

export interface Session {
  id: string;
  title: string;
  transcript: TranscriptEntry[];
  aiResponses: AIResponse[];
  summary: string | null;
  insightsJson: string | null;
  actionItemsJson: string | null;
  followUpEmail: string | null;
  modeId: string | null;
  durationSeconds: number;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
  syncedAt: number | null;
}

export interface SessionRow {
  id: string;
  title: string;
  transcript_json: string;
  ai_responses_json: string;
  summary: string | null;
  insights_json: string | null;
  action_items_json: string | null;
  follow_up_email: string | null;
  mode_id: string | null;
  duration_seconds: number;
  started_at: number;
  ended_at: number | null;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ModeRow {
  id: string;
  name: string;
  system_prompt: string;
  icon: string;
  color: string;
  is_default: number;
  is_builtin: number;
  notes_template_json: string | null;
  created_at: number;
  updated_at: number;
  synced_at: number | null;
}

export interface NotesSection {
  id: string;
  title: string;
  instructions: string;
}

const LATEST_VERSION = 8;

class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string;
  private dbDir: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.dbDir = path.join(userDataPath, 'data');

    if (!fs.existsSync(this.dbDir)) {
      fs.mkdirSync(this.dbDir, { recursive: true });
    }

    this.dbPath = path.join(this.dbDir, 'raven.db');
  }

  /**
   * Initialize database and run migrations
   */
  initialize(): void {
    if (this.db) return;

    log.info('Initializing at:', this.dbPath);

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    // SQLite defaults `foreign_keys = OFF`, which means every `ON DELETE
    // CASCADE` in migrate() is silently a no-op and orphan rows accumulate
    // (e.g. mode_context_files surviving a deleteMode call). Turn it on
    // per-connection before any queries run. Must be set on every
    // connection - switchToAccountDatabase / switchToDefaultDatabase also
    // repeat this pragma below.
    this.db.pragma('foreign_keys = ON');
    this.migrate();

    log.info('Initialized successfully');
  }

  /**
   * Switch to a per-account database. Closes the current connection,
   * opens the account-specific DB, and runs migrations on it.
   * Returns true if the switch resulted in a different database.
   */
  switchToAccountDatabase(backendUrl: string, userId: string): boolean {
    const hash = this.hashAccount(backendUrl, userId);
    const newPath = path.join(this.dbDir, `raven-${hash}.db`);

    if (newPath === this.dbPath && this.db) return false;

    const isNewDb = !fs.existsSync(newPath);
    this.close();
    this.dbPath = newPath;
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON'); // see initialize() comment
    this.migrate();

    if (isNewDb) {
      log.info('Created new account database - seeding defaults');
      this._onNewAccountDb?.();
    }

    log.info('Switched to account database:', newPath);
    return true;
  }

  private _onNewAccountDb: (() => void) | null = null;

  /**
   * Register a callback that runs when a brand-new account database is created.
   * Used to seed built-in modes and other defaults.
   */
  onNewAccountDatabase(callback: () => void): void {
    this._onNewAccountDb = callback;
  }

  /**
   * Switch back to the default shared database (for logout / unauthenticated state).
   */
  switchToDefaultDatabase(): boolean {
    const defaultPath = path.join(this.dbDir, 'raven.db');

    if (defaultPath === this.dbPath && this.db) return false;

    this.close();
    this.dbPath = defaultPath;
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON'); // see initialize() comment
    this.migrate();

    log.info('Switched to default database');
    return true;
  }

  private hashAccount(backendUrl: string, userId: string): string {
    return createHash('sha256').update(`${backendUrl}::${userId}`).digest('hex').slice(0, 12);
  }

  /**
   * Run database migrations
   */
  private migrate(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      )
    `);

    const migrations: Array<{ name: string; sql?: string; run?: (db: Database.Database) => void }> = [
      {
        name: '001_create_sessions',
        sql: `
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'Untitled Session',
            transcript_json TEXT NOT NULL DEFAULT '[]',
            ai_responses_json TEXT NOT NULL DEFAULT '[]',
            mode_id TEXT,
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            created_at INTEGER NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC);
          CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
        `,
      },
      {
        name: '002_create_modes',
        sql: `
          CREATE TABLE IF NOT EXISTS modes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            system_prompt TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT '🎯',
            color TEXT NOT NULL DEFAULT '#6366f1',
            is_default INTEGER NOT NULL DEFAULT 0,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            quick_actions_json TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_modes_is_default ON modes(is_default);
          CREATE INDEX IF NOT EXISTS idx_modes_is_builtin ON modes(is_builtin);
        `,
      },
      {
        name: '003_add_notes_template',
        sql: `
          ALTER TABLE modes ADD COLUMN notes_template_json TEXT DEFAULT NULL;
        `,
      },
      {
        name: '004_add_session_summary',
        sql: `
          ALTER TABLE sessions ADD COLUMN summary TEXT DEFAULT NULL;
        `,
      },
      {
        name: '005_add_session_messages',
        run: migration005,
      },
      {
        name: '006_add_context_chunks',
        sql: `
          CREATE TABLE IF NOT EXISTS mode_context_files (
            id TEXT PRIMARY KEY,
            mode_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            file_type TEXT NOT NULL DEFAULT 'text/plain',
            chunk_count INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (mode_id) REFERENCES modes(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_context_files_mode ON mode_context_files(mode_id);

          CREATE TABLE IF NOT EXISTS mode_context_chunks (
            id TEXT PRIMARY KEY,
            mode_id TEXT NOT NULL,
            file_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (mode_id) REFERENCES modes(id) ON DELETE CASCADE,
            FOREIGN KEY (file_id) REFERENCES mode_context_files(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_context_chunks_mode ON mode_context_chunks(mode_id);
          CREATE INDEX IF NOT EXISTS idx_context_chunks_file ON mode_context_chunks(file_id);
        `,
      },
      {
        name: '007_add_session_insights',
        sql: `
          ALTER TABLE sessions ADD COLUMN insights_json TEXT DEFAULT NULL;
        `,
      },
      {
        name: '008_add_session_updated_at',
        run: (db: Database.Database) => {
          db.exec(`ALTER TABLE sessions ADD COLUMN updated_at INTEGER;`)
          db.exec(`UPDATE sessions SET updated_at = COALESCE(ended_at, started_at, created_at);`)
          db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC);`)
        },
      },
      {
        name: '009_add_session_messages_created_at_index',
        sql: `
          CREATE INDEX IF NOT EXISTS idx_session_messages_session_created ON session_messages(session_id, created_at ASC);
        `,
      },
      {
        // Tombstones: a mode ID marked here is the local signal "the user
        // deleted this - do NOT resurrect it from the server on pull".
        // The server-confirmed timestamp lets the sync cycle retry the
        // server-side DELETE until it succeeds, and lets us purge old
        // tombstones once we know the server also has no copy.
        // Without this, a sync pull after a failed delete-push (offline,
        // HMR interruption, 5xx) silently recreates the mode locally.
        name: '010_add_mode_tombstones',
        sql: `
          CREATE TABLE IF NOT EXISTS mode_tombstones (
            id TEXT PRIMARY KEY,
            deleted_at INTEGER NOT NULL,
            server_confirmed_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS idx_mode_tombstones_unconfirmed
            ON mode_tombstones(server_confirmed_at)
            WHERE server_confirmed_at IS NULL;
        `,
      },
      {
        // Sessions get the same tombstone treatment as modes. User-visible
        // data ("my recordings") - the cost of a zombie here is higher
        // than for modes because users typically have far more sessions
        // and each one might contain sensitive content they explicitly
        // wanted gone.
        name: '011_add_session_tombstones',
        sql: `
          CREATE TABLE IF NOT EXISTS session_tombstones (
            id TEXT PRIMARY KEY,
            deleted_at INTEGER NOT NULL,
            server_confirmed_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS idx_session_tombstones_unconfirmed
            ON session_tombstones(server_confirmed_at)
            WHERE server_confirmed_at IS NULL;
        `,
      },
      {
        // Context files (RAG uploads, per-mode) have the same zombie
        // bug as modes and sessions. Different shape: the backend
        // DELETE URL is /api/modes/:modeId/context/:fileId - we need
        // to remember BOTH ids to retry the delete after boot. File
        // ids are globally-unique UUIDs so id alone is the primary
        // key; mode_id is carried as a required column for the retry.
        name: '012_add_context_file_tombstones',
        sql: `
          CREATE TABLE IF NOT EXISTS context_file_tombstones (
            id TEXT PRIMARY KEY,
            mode_id TEXT NOT NULL,
            deleted_at INTEGER NOT NULL,
            server_confirmed_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS idx_context_file_tombstones_unconfirmed
            ON context_file_tombstones(server_confirmed_at)
            WHERE server_confirmed_at IS NULL;
        `,
      },
      {
        // synced_at tracks the last time we observed local and server
        // to be in a reconciled state (either server accepted our push,
        // or skipped it because server had an equal/newer copy). The
        // retroactive-push flow used to rely on a pulled remote list
        // to decide what was unsynced, but that pull is filtered by
        // `since=lastSync` - so rows modified before the last sync
        // always looked "missing" and got re-queued, only to be
        // rejected by the backend on every launch. With synced_at,
        // the client can make that decision locally: queue rows where
        // synced_at IS NULL OR updated_at > synced_at. Same for modes.
        name: '013_add_synced_at',
        sql: `
          ALTER TABLE sessions ADD COLUMN synced_at INTEGER;
          ALTER TABLE modes ADD COLUMN synced_at INTEGER;
          CREATE INDEX IF NOT EXISTS idx_sessions_synced_at ON sessions(synced_at);
          CREATE INDEX IF NOT EXISTS idx_modes_synced_at ON modes(synced_at);
        `,
      },
      {
        // Seed synced_at for rows that existed before the column was
        // added. Without this, the first boot after migration 013 would
        // treat every pre-existing row as "never synced" and queue them
        // all for re-upload - the backend correctly rejects them as
        // stale, but we pay the bandwidth and (before this commit) the
        // user saw a wave of "N items had newer updates on another
        // device" toasts for what are in fact fully reconciled rows.
        //
        // Assumption: if a row was on disk before synced_at existed,
        // treat it as reconciled with the server. For 99% of users this
        // holds - local rows only come from recording while signed in,
        // and that path pushes immediately. The residual risk (a row
        // that was truly never synced) self-heals: any local edit bumps
        // updated_at past synced_at and the normal sync path picks it
        // up on the next cycle.
        //
        // Kept as a separate migration from 013 so users who already
        // ran 013 (without this backfill) still get the seed applied
        // on their next launch - 013 is idempotent-by-name and wouldn't
        // re-run for them.
        name: '014_backfill_synced_at',
        sql: `
          UPDATE sessions SET synced_at = COALESCE(updated_at, ended_at, started_at, created_at) WHERE synced_at IS NULL;
          UPDATE modes SET synced_at = COALESCE(updated_at, created_at) WHERE synced_at IS NULL;
        `,
      },
      {
        // Structured action items extracted from the transcript, stored as a
        // JSON array of {task, assignee, deadline}. Separate column from
        // insights_json because the Insights tab rewrites insights_json wholesale
        // (sentiment/topics/keyPhrases) and would clobber action items.
        name: '015_add_session_action_items',
        sql: `
          ALTER TABLE sessions ADD COLUMN action_items_json TEXT DEFAULT NULL;
        `,
      },
      {
        // Per-session transcript chunks + embeddings for "ask my meetings"
        // (local Q&A across session history). Separate table from
        // mode_context_chunks, which is hard-keyed to modes(id). ON DELETE
        // CASCADE removes a session's chunks when the session is deleted
        // (foreign_keys pragma is ON).
        name: '016_add_session_chunks',
        sql: `
          CREATE TABLE IF NOT EXISTS session_context_chunks (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          );
          CREATE INDEX IF NOT EXISTS idx_session_chunks_session ON session_context_chunks(session_id);
        `,
      },
      {
        // Persist the generated follow-up email so it survives navigation
        // (it costs a model call to produce — don't throw that away).
        name: '017_add_session_followup_email',
        sql: `
          ALTER TABLE sessions ADD COLUMN follow_up_email TEXT DEFAULT NULL;
        `,
      },
    ];

    // Capture `this.db` to a local after the !null guard above so the
    // non-null narrowing survives into the transaction callback below.
    // TypeScript cannot prove `this.db` is still non-null inside a deferred
    // closure on a mutable `this.db` field.
    const db = this.db;
    const applied = (db.prepare('SELECT name FROM migrations').all() as Array<{ name: string }>)
      .map((row) => row.name);

    for (const migration of migrations) {
      if (!applied.includes(migration.name)) {
        log.info('Running migration:', migration.name);
        const runMigration = db.transaction(() => {
          if (migration.sql) {
            db.exec(migration.sql);
          } else if (migration.run) {
            migration.run(db);
          }
          db.prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)')
            .run(migration.name, Date.now());
        });
        runMigration();
      }
    }

    log.debug('Migrations up to v' + LATEST_VERSION);
  }

  /**
   * Create a new session
   */
  createSession(session: Omit<Session, 'createdAt' | 'updatedAt' | 'syncedAt'>): Session {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const fullSession: Session = { ...session, summary: session.summary ?? null, insightsJson: session.insightsJson ?? null, actionItemsJson: session.actionItemsJson ?? null, followUpEmail: session.followUpEmail ?? null, createdAt: now, updatedAt: now, syncedAt: null };

    this.db
      .prepare(
        `INSERT INTO sessions (id, title, transcript_json, ai_responses_json, summary, insights_json, mode_id, duration_seconds, started_at, ended_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullSession.id,
        fullSession.title,
        JSON.stringify(fullSession.transcript),
        JSON.stringify(fullSession.aiResponses),
        fullSession.summary,
        fullSession.insightsJson,
        fullSession.modeId,
        fullSession.durationSeconds,
        fullSession.startedAt,
        fullSession.endedAt,
        fullSession.createdAt,
        fullSession.updatedAt,
      );

    log.debug('Created session:', fullSession.id);
    return fullSession;
  }

  /**
   * Update an existing session
   */
  updateSession(id: string, updates: Partial<Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>>): void {
    if (!this.db) throw new Error('Database not initialized');

    const setClauses: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [Date.now()];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title);
    }
    if (updates.transcript !== undefined) {
      setClauses.push('transcript_json = ?');
      values.push(JSON.stringify(updates.transcript));
    }
    if (updates.aiResponses !== undefined) {
      setClauses.push('ai_responses_json = ?');
      values.push(JSON.stringify(updates.aiResponses));
    }
    if (updates.summary !== undefined) {
      setClauses.push('summary = ?');
      values.push(updates.summary);
    }
    if (updates.insightsJson !== undefined) {
      setClauses.push('insights_json = ?');
      values.push(updates.insightsJson);
    }
    if (updates.actionItemsJson !== undefined) {
      setClauses.push('action_items_json = ?');
      values.push(updates.actionItemsJson);
    }
    if (updates.followUpEmail !== undefined) {
      setClauses.push('follow_up_email = ?');
      values.push(updates.followUpEmail);
    }
    if (updates.modeId !== undefined) {
      setClauses.push('mode_id = ?');
      values.push(updates.modeId);
    }
    if (updates.durationSeconds !== undefined) {
      setClauses.push('duration_seconds = ?');
      values.push(updates.durationSeconds);
    }
    if (updates.endedAt !== undefined) {
      setClauses.push('ended_at = ?');
      values.push(updates.endedAt);
    }

    if (setClauses.length === 0) return;

    values.push(id);
    this.db
      .prepare(`UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...values);

    log.debug('Updated session:', id);
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): Session | null {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ?')
      .get(id) as SessionRow | undefined;

    if (!row) return null;

    return this.rowToSession(row);
  }

  /**
   * Get all sessions, ordered by started_at descending
   */
  getAllSessions(): Session[] {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY started_at DESC')
      .all() as SessionRow[];

    return rows.map((row) => this.rowToSession(row));
  }

  getAllSessionSummaries(limit = 100, offset = 0): Array<{
    id: string; title: string; summary: string | null; modeId: string | null;
    durationSeconds: number; startedAt: number; endedAt: number | null; createdAt: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare(
        `SELECT id, title, summary, mode_id, duration_seconds, started_at, ended_at, created_at
         FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as Array<{
        id: string; title: string; summary: string | null; mode_id: string | null;
        duration_seconds: number; started_at: number; ended_at: number | null; created_at: number;
      }>;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      modeId: r.mode_id,
      durationSeconds: r.duration_seconds,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      createdAt: r.created_at,
    }));
  }

  /**
   * Get sessions within a date range
   */
  getSessionsByDateRange(startTimestamp: number, endTimestamp: number): Session[] {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare(
        'SELECT * FROM sessions WHERE started_at >= ? AND started_at < ? ORDER BY started_at DESC'
      )
      .all(startTimestamp, endTimestamp) as SessionRow[];

    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Search sessions by title or transcript content
   */
  searchSessions(query: string): Session[] {
    if (!this.db) throw new Error('Database not initialized');

    const escaped = query.replace(/[%_\\]/g, '\\$&');
    const searchPattern = `%${escaped}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions 
         WHERE title LIKE ? ESCAPE '\\' 
            OR summary LIKE ? ESCAPE '\\'
            OR transcript_json LIKE ? ESCAPE '\\' 
         ORDER BY started_at DESC`
      )
      .all(searchPattern, searchPattern, searchPattern) as SessionRow[];

    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Delete a session. See deleteMode() for the full rationale behind
   * the tombstone pattern - same bug class applies here, and session
   * data carries higher user-visible risk than mode data (many users
   * have hundreds of recordings; a zombie'd session is a privacy
   * regression if the user explicitly wanted it gone).
   *
   * Tombstone + delete run in one transaction so partial state is
   * impossible.
   */
  deleteSession(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const db = this.db;
    const changes = db.transaction(() => {
      db.prepare(
        `INSERT OR REPLACE INTO session_tombstones (id, deleted_at, server_confirmed_at)
         VALUES (?, ?, NULL)`
      ).run(id, Date.now());
      // Explicit chunk cleanup. ON DELETE CASCADE handles this when
      // foreign_keys=ON (it is), but repeating the delete is cheap and makes
      // the cleanup obvious + robust to pragma regressions. Mirrors the
      // context-file cleanup in deleteMode.
      db.prepare('DELETE FROM session_context_chunks WHERE session_id = ?').run(id);
      const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
      return result.changes;
    })();

    log.debug('Deleted session:', id, 'changes:', changes, '+ tombstone');
    return changes > 0;
  }

  /** See hasModeTombstone. Same contract, for sessions. */
  hasSessionTombstone(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db
      .prepare('SELECT 1 FROM session_tombstones WHERE id = ?')
      .get(id) as { 1: number } | undefined;
    return row !== undefined;
  }

  /** See getUnconfirmedModeTombstones. Same contract, for sessions. */
  getUnconfirmedSessionTombstones(): string[] {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db
      .prepare(
        `SELECT id FROM session_tombstones
         WHERE server_confirmed_at IS NULL
         ORDER BY deleted_at ASC`
      )
      .all() as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /** See confirmModeTombstone. Same contract, for sessions. */
  confirmSessionTombstone(id: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db
      .prepare('UPDATE session_tombstones SET server_confirmed_at = ? WHERE id = ?')
      .run(Date.now(), id);
  }

  /** See purgeOldModeTombstones. Same cadence + cutoffs, for sessions. */
  purgeOldSessionTombstones(): number {
    if (!this.db) throw new Error('Database not initialized');
    const now = Date.now();
    const confirmedCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const staleCutoff = now - 180 * 24 * 60 * 60 * 1000;
    const result = this.db
      .prepare(
        `DELETE FROM session_tombstones
         WHERE (server_confirmed_at IS NOT NULL AND server_confirmed_at < ?)
            OR (server_confirmed_at IS NULL AND deleted_at < ?)`
      )
      .run(confirmedCutoff, staleCutoff);
    return result.changes;
  }

  clearAllSessions(): void {
    if (!this.db) throw new Error('Database not initialized');
    const result = this.db.prepare('DELETE FROM sessions').run();
    this.db.prepare('DELETE FROM session_messages').run();
    log.info('Cleared all local sessions:', result.changes, 'sessions deleted');
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM sessions')
      .get() as { count: number };

    return row.count;
  }

  /**
   * Get the most recent in-progress session (for crash recovery)
   */
  getInProgressSession(): Session | null {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db
      .prepare('SELECT * FROM sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
      .get() as SessionRow | undefined;

    if (!row) return null;

    return this.rowToSession(row);
  }

  /**
   * Add a message to a session
   */
  addSessionMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): SessionMessage {
    if (!this.db) throw new Error('Database not initialized');

    const id = globalThis.crypto.randomUUID();
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO session_messages (id, session_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, sessionId, role, content, createdAt);

    return { id, sessionId, role, content, createdAt };
  }

  addSessionMessageWithId(
    id: string,
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    createdAt: string
  ): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db
      .prepare(
        `INSERT OR IGNORE INTO session_messages (id, session_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, sessionId, role, content, createdAt);
  }

  /**
   * Get all messages for a session
   */
  getSessionMessages(sessionId: string): SessionMessage[] {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare(
        `SELECT id, session_id as sessionId, role, content, created_at as createdAt
         FROM session_messages
         WHERE session_id = ?
         ORDER BY created_at ASC`
      )
      .all(sessionId) as SessionMessage[];

    return rows;
  }

  /**
   * Stamp synced_at on the given sessions. Called after a successful
   * push batch (any 2xx response) for both newly-accepted rows and
   * stale-skipped rows - in both cases the server has our row in a
   * state we don't need to push again. On next launch, the retroactive
   * push compares updated_at > synced_at to decide what to re-queue,
   * so rows that haven't been edited locally since this stamp will be
   * skipped instead of needlessly re-uploaded + rejected.
   */
  markSessionsSynced(ids: string[], syncedAt: number = Date.now()): void {
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return;

    const db = this.db;
    // Chunk to stay under SQLite's default 999-parameter limit. 500 per
    // batch leaves plenty of headroom even if the column count grows.
    // Each chunk gets its own transaction-wrapped closure so the batch
    // ids are captured via closure (avoids relying on better-sqlite3's
    // argument-forwarding semantics for its transaction wrapper).
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const idBatch = ids.slice(i, i + CHUNK);
      const placeholders = idBatch.map(() => '?').join(',');
      const runBatch = db.transaction(() => {
        db.prepare(`UPDATE sessions SET synced_at = ? WHERE id IN (${placeholders})`)
          .run(syncedAt, ...idBatch);
      });
      runBatch();
    }
  }

  /**
   * Convert database row to Session object
   */
  private rowToSession(row: SessionRow): Session {
    // Parsed JSON is `unknown`; we accept whatever was persisted and let
    // downstream consumers validate shape. Casting to the concrete arrays
    // here matches existing runtime behavior - the catches above ensure a
    // malformed row falls back to an empty array of the declared type.
    let transcript: TranscriptEntry[] = []
    let aiResponses: AIResponse[] = []
    try { transcript = JSON.parse(row.transcript_json) as TranscriptEntry[] } catch (err) { log.warn('Corrupted transcript JSON for session', row.id, err) }
    try { aiResponses = JSON.parse(row.ai_responses_json) as AIResponse[] } catch (err) { log.warn('Corrupted aiResponses JSON for session', row.id, err) }

    return {
      id: row.id,
      title: row.title,
      transcript,
      aiResponses,
      summary: row.summary || null,
      insightsJson: row.insights_json || null,
      actionItemsJson: row.action_items_json || null,
      followUpEmail: row.follow_up_email || null,
      modeId: row.mode_id,
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
      syncedAt: row.synced_at ?? null,
    };
  }

  // ==================== MODE METHODS ====================

  /**
   * Create a new mode
   */
  createMode(mode: Omit<Mode, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>): Mode {
    if (!this.db) throw new Error('Database not initialized');

    const id = globalThis.crypto.randomUUID();
    const now = Date.now();
    const fullMode: Mode = {
      ...mode,
      id,
      createdAt: now,
      updatedAt: now,
      syncedAt: null,
    };

    this.db
      .prepare(
        `INSERT INTO modes (id, name, system_prompt, icon, color, is_default, is_builtin, notes_template_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullMode.id,
        fullMode.name,
        fullMode.systemPrompt,
        fullMode.icon,
        fullMode.color,
        fullMode.isDefault ? 1 : 0,
        fullMode.isBuiltin ? 1 : 0,
        fullMode.notesTemplate ? JSON.stringify(fullMode.notesTemplate) : null,
        fullMode.createdAt,
        fullMode.updatedAt
      );

    log.debug('Created mode:', fullMode.id, fullMode.name);
    return fullMode;
  }

  createModeWithId(id: string, mode: Omit<Mode, 'id' | 'createdAt' | 'updatedAt' | 'syncedAt'>): Mode {
    if (!this.db) throw new Error('Database not initialized');

    const now = Date.now();
    const fullMode: Mode = { ...mode, id, createdAt: now, updatedAt: now, syncedAt: null };

    this.db
      .prepare(
        `INSERT OR IGNORE INTO modes (id, name, system_prompt, icon, color, is_default, is_builtin, notes_template_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullMode.id,
        fullMode.name,
        fullMode.systemPrompt,
        fullMode.icon,
        fullMode.color,
        fullMode.isDefault ? 1 : 0,
        fullMode.isBuiltin ? 1 : 0,
        fullMode.notesTemplate ? JSON.stringify(fullMode.notesTemplate) : null,
        fullMode.createdAt,
        fullMode.updatedAt
      );

    log.debug('Created mode with ID:', fullMode.id, fullMode.name);
    return fullMode;
  }

  /**
   * Get all modes
   */
  getAllModes(): Mode[] {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db
      .prepare('SELECT * FROM modes ORDER BY is_builtin DESC, name ASC')
      .all() as ModeRow[];

    return rows.map((row) => this.rowToMode(row));
  }

  /**
   * Get a mode by ID
   */
  getMode(id: string): Mode | null {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db
      .prepare('SELECT * FROM modes WHERE id = ?')
      .get(id) as ModeRow | undefined;

    return row ? this.rowToMode(row) : null;
  }

  /**
   * Get the active (default) mode
   */
  getActiveMode(): Mode | null {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db
      .prepare('SELECT * FROM modes WHERE is_default = 1 LIMIT 1')
      .get() as ModeRow | undefined;

    return row ? this.rowToMode(row) : null;
  }

  /**
   * Set a mode as active (default)
   */
  setActiveMode(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare('UPDATE modes SET is_default = 0').run();

    const result = this.db
      .prepare('UPDATE modes SET is_default = 1, updated_at = ? WHERE id = ?')
      .run(Date.now(), id);

    log.debug('Set active mode:', id);
    return result.changes > 0;
  }

  /**
   * Update a mode
   */
  updateMode(id: string, updates: Partial<Omit<Mode, 'id' | 'isBuiltin' | 'createdAt' | 'syncedAt'>>): Mode | null {
    if (!this.db) throw new Error('Database not initialized');

    const setClauses: string[] = ['updated_at = ?'];
    const values: (string | number | null)[] = [Date.now()];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.systemPrompt !== undefined) {
      setClauses.push('system_prompt = ?');
      values.push(updates.systemPrompt);
    }
    if (updates.icon !== undefined) {
      setClauses.push('icon = ?');
      values.push(updates.icon);
    }
    if (updates.color !== undefined) {
      setClauses.push('color = ?');
      values.push(updates.color);
    }
    if (updates.isDefault !== undefined) {
      if (updates.isDefault) {
        this.db.prepare('UPDATE modes SET is_default = 0').run();
      }
      setClauses.push('is_default = ?');
      values.push(updates.isDefault ? 1 : 0);
    }
    if (updates.notesTemplate !== undefined) {
      setClauses.push('notes_template_json = ?');
      values.push(updates.notesTemplate ? JSON.stringify(updates.notesTemplate) : null);
    }

    values.push(id);
    this.db
      .prepare(`UPDATE modes SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...values);

    log.debug('Updated mode:', id);
    return this.getMode(id);
  }

  /**
   * Delete a mode (cannot delete active or builtin modes).
   *
   * Also writes a tombstone row so that pullAndMergeRemoteModes won't
   * resurrect the mode from the server on the next sync cycle if the
   * server-side DELETE hasn't landed yet (offline, interrupted, 5xx).
   * The tombstone is cleared once the sync cycle confirms the server
   * has no copy. Both writes happen in one transaction so we never
   * end up with a deleted row and no tombstone (which would reopen
   * the zombie window).
   */
  deleteMode(id: string): { success: boolean; error?: string } {
    if (!this.db) throw new Error('Database not initialized');

    const mode = this.getMode(id);
    if (!mode) {
      return { success: false, error: 'Mode not found' };
    }
    if (mode.isBuiltin) {
      return { success: false, error: 'Cannot delete a built-in mode' };
    }
    if (mode.isDefault) {
      return { success: false, error: 'Cannot delete the active mode' };
    }

    const db = this.db;
    const changes = db.transaction(() => {
      db.prepare(
        `INSERT OR REPLACE INTO mode_tombstones (id, deleted_at, server_confirmed_at)
         VALUES (?, ?, NULL)`
      ).run(id, Date.now());
      // Explicit context-file + chunk cleanup. The schema has
      // `ON DELETE CASCADE` which SHOULD handle this automatically, but
      // only when PRAGMA foreign_keys=ON is set on the connection. That
      // pragma is now always set in initialize() / switch*Database(), but
      // repeating the deletes here costs ~2 cheap queries and makes the
      // cleanup robust against any future code path that forgets the
      // pragma. Cascade-on-server is handled by the Prisma
      // `onDelete: Cascade` on ModeContextFile - when the mode itself is
      // deleted on the backend (via the tombstone retry loop), the
      // server wipes those rows too. So we skip tombstone-writes for
      // these local deletions intentionally.
      db.prepare('DELETE FROM mode_context_chunks WHERE mode_id = ?').run(id);
      db.prepare('DELETE FROM mode_context_files WHERE mode_id = ?').run(id);
      const result = db
        .prepare('DELETE FROM modes WHERE id = ? AND is_builtin = 0')
        .run(id);
      return result.changes;
    })();

    log.debug('Deleted mode:', id, 'changes:', changes, '+ tombstone + context');
    return { success: changes > 0 };
  }

  /**
   * True if the mode id has a local tombstone (locally deleted, possibly
   * not yet confirmed on the server). Used by the sync pull to avoid
   * resurrecting zombies.
   */
  hasModeTombstone(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db
      .prepare('SELECT 1 FROM mode_tombstones WHERE id = ?')
      .get(id) as { 1: number } | undefined;
    return row !== undefined;
  }

  /**
   * Returns mode ids whose server-side DELETE has not yet been confirmed.
   * The sync cycle iterates these and retries DELETE /api/modes/:id until
   * the server responds 200 or 404 (both are "server has no copy").
   */
  getUnconfirmedModeTombstones(): string[] {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db
      .prepare(
        `SELECT id FROM mode_tombstones
         WHERE server_confirmed_at IS NULL
         ORDER BY deleted_at ASC`
      )
      .all() as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  /**
   * Mark a tombstone as confirmed on the server so the sync cycle stops
   * retrying. The row stays around (acts as a fence against late pulls
   * that might still see the mode mid-propagation) and is purged later
   * by purgeOldModeTombstones().
   */
  confirmModeTombstone(id: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db
      .prepare('UPDATE mode_tombstones SET server_confirmed_at = ? WHERE id = ?')
      .run(Date.now(), id);
  }

  /**
   * Remove tombstones that are either confirmed and older than 30 days
   * (no longer needed - server has been consistent for a month) OR
   * unconfirmed and older than 180 days (safety cap - we gave up retrying).
   * Returns the number of rows purged. Called periodically, not on every
   * operation.
   */
  purgeOldModeTombstones(): number {
    if (!this.db) throw new Error('Database not initialized');
    const now = Date.now();
    const confirmedCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const staleCutoff = now - 180 * 24 * 60 * 60 * 1000;
    const result = this.db
      .prepare(
        `DELETE FROM mode_tombstones
         WHERE (server_confirmed_at IS NOT NULL AND server_confirmed_at < ?)
            OR (server_confirmed_at IS NULL AND deleted_at < ?)`
      )
      .run(confirmedCutoff, staleCutoff);
    return result.changes;
  }

  /**
   * Duplicate a mode
   */
  duplicateMode(id: string, newName: string): Mode | null {
    if (!this.db) throw new Error('Database not initialized');

    const original = this.getMode(id);
    if (!original) return null;

    return this.createMode({
      name: newName,
      systemPrompt: original.systemPrompt,
      icon: original.icon,
      color: original.color,
      isDefault: false,
      isBuiltin: false,
      notesTemplate: original.notesTemplate,
    });
  }

  /**
   * Get mode count
   */
  getModeCount(): number {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM modes')
      .get() as { count: number };

    return row.count;
  }

  /**
   * Stamp synced_at on the given modes. Same semantic as
   * markSessionsSynced - called after any 2xx response from the mode
   * sync endpoint (synced + stale-skipped both count as reconciled).
   */
  markModesSynced(ids: string[], syncedAt: number = Date.now()): void {
    if (!this.db) throw new Error('Database not initialized');
    if (ids.length === 0) return;

    const db = this.db;
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const idBatch = ids.slice(i, i + CHUNK);
      const placeholders = idBatch.map(() => '?').join(',');
      const runBatch = db.transaction(() => {
        db.prepare(`UPDATE modes SET synced_at = ? WHERE id IN (${placeholders})`)
          .run(syncedAt, ...idBatch);
      });
      runBatch();
    }
  }

  /**
   * Convert database row to Mode object
   */
  private rowToMode(row: ModeRow): Mode {
    return {
      id: row.id,
      name: row.name,
      systemPrompt: row.system_prompt,
      icon: row.icon,
      color: row.color,
      isDefault: row.is_default === 1,
      isBuiltin: row.is_builtin === 1,
      notesTemplate: row.notes_template_json ? (() => { try { return JSON.parse(row.notes_template_json) } catch (err) { log.warn('Corrupted notesTemplate JSON for mode', row.id, err); return null } })() : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncedAt: row.synced_at ?? null,
    };
  }

  // ==================== CONTEXT FILE / RAG METHODS ====================

  insertContextFile(params: {
    id: string;
    modeId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    chunkCount: number;
  }): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(
      `INSERT INTO mode_context_files (id, mode_id, file_name, file_size, file_type, chunk_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(params.id, params.modeId, params.fileName, params.fileSize, params.fileType, params.chunkCount, Date.now());
  }

  insertContextChunk(params: {
    id: string;
    modeId: string;
    fileId: string;
    fileName: string;
    chunkIndex: number;
    chunkText: string;
    embeddingJson: string;
  }): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(
      `INSERT INTO mode_context_chunks (id, mode_id, file_id, file_name, chunk_index, chunk_text, embedding_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(params.id, params.modeId, params.fileId, params.fileName, params.chunkIndex, params.chunkText, params.embeddingJson, Date.now());
  }

  // ==================== SESSION CHUNKS (ask-my-meetings) ====================

  insertSessionChunk(params: {
    id: string;
    sessionId: string;
    chunkIndex: number;
    chunkText: string;
    embeddingJson: string;
  }): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare(
      `INSERT INTO session_context_chunks (id, session_id, chunk_index, chunk_text, embedding_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(params.id, params.sessionId, params.chunkIndex, params.chunkText, params.embeddingJson, Date.now());
  }

  deleteSessionChunks(sessionId: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM session_context_chunks WHERE session_id = ?').run(sessionId);
  }

  /** Distinct session ids that already have chunks — used to skip re-indexing. */
  getIndexedSessionIds(): Set<string> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db
      .prepare('SELECT DISTINCT session_id FROM session_context_chunks')
      .all() as Array<{ session_id: string }>;
    return new Set(rows.map((r) => r.session_id));
  }

  /** All session chunks across every session — used to build the QA index. */
  getAllSessionChunks(): Array<{ sessionId: string; chunkText: string; embeddingJson: string }> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db
      .prepare('SELECT session_id, chunk_text, embedding_json FROM session_context_chunks')
      .all() as Array<{ session_id: string; chunk_text: string; embedding_json: string }>;
    return rows.map((r) => ({
      sessionId: r.session_id,
      chunkText: r.chunk_text,
      embeddingJson: r.embedding_json,
    }));
  }

  /** Lightweight session metadata (no transcript load) for citations. */
  getSessionMeta(id: string): { id: string; title: string; startedAt: number } | null {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db
      .prepare('SELECT id, title, started_at FROM sessions WHERE id = ?')
      .get(id) as { id: string; title: string; started_at: number } | undefined;
    if (!row) return null;
    return { id: row.id, title: row.title, startedAt: row.started_at };
  }

  getContextFiles(modeId: string): Array<{
    id: string;
    modeId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    chunkCount: number;
    createdAt: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db.prepare(
      'SELECT * FROM mode_context_files WHERE mode_id = ? ORDER BY created_at DESC'
    ).all(modeId) as Array<{
      id: string;
      mode_id: string;
      file_name: string;
      file_size: number;
      file_type: string;
      chunk_count: number;
      created_at: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      modeId: r.mode_id,
      fileName: r.file_name,
      fileSize: r.file_size,
      fileType: r.file_type,
      chunkCount: r.chunk_count,
      createdAt: r.created_at,
    }));
  }

  getContextChunks(modeId: string): Array<{
    id: string;
    chunkIndex: number;
    chunkText: string;
    embeddingJson: string;
    fileName: string;
  }> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db.prepare(
      'SELECT id, chunk_index, chunk_text, embedding_json, file_name FROM mode_context_chunks WHERE mode_id = ? ORDER BY file_name, chunk_index'
    ).all(modeId) as Array<{
      id: string;
      chunk_index: number;
      chunk_text: string;
      embedding_json: string;
      file_name: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      chunkIndex: r.chunk_index,
      chunkText: r.chunk_text,
      embeddingJson: r.embedding_json,
      fileName: r.file_name,
    }));
  }

  getContextChunksForFile(fileId: string): Array<{
    id: string;
    chunkIndex: number;
    chunkText: string;
    embeddingJson: string;
    fileName: string;
  }> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db.prepare(
      'SELECT id, chunk_index, chunk_text, embedding_json, file_name FROM mode_context_chunks WHERE file_id = ? ORDER BY chunk_index'
    ).all(fileId) as Array<{
      id: string;
      chunk_index: number;
      chunk_text: string;
      embedding_json: string;
      file_name: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      chunkIndex: r.chunk_index,
      chunkText: r.chunk_text,
      embeddingJson: r.embedding_json,
      fileName: r.file_name,
    }));
  }

  /**
   * Delete a context file + its chunks. Writes a tombstone so a pull
   * against the server (which happens during every sync cycle via
   * syncAllContextFiles → pullContextFromCloud) won't resurrect the
   * file locally if the server-side DELETE hasn't landed yet. See
   * deleteMode() for the full rationale.
   *
   * The tombstone carries mode_id alongside file id because the
   * backend DELETE url is /api/modes/:modeId/context/:fileId and
   * the sync cycle needs both to retry. We look mode_id up from
   * mode_context_files before deletion so callers don't need to
   * pass it (preserving the single-arg signature used across the
   * codebase).
   */
  deleteContextFile(fileId: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const db = this.db;
    const modeRow = db
      .prepare('SELECT mode_id FROM mode_context_files WHERE id = ?')
      .get(fileId) as { mode_id: string } | undefined;

    const changes = db.transaction(() => {
      if (modeRow) {
        db.prepare(
          `INSERT OR REPLACE INTO context_file_tombstones (id, mode_id, deleted_at, server_confirmed_at)
           VALUES (?, ?, ?, NULL)`
        ).run(fileId, modeRow.mode_id, Date.now());
      }
      db.prepare('DELETE FROM mode_context_chunks WHERE file_id = ?').run(fileId);
      const result = db.prepare('DELETE FROM mode_context_files WHERE id = ?').run(fileId);
      return result.changes;
    })();

    return changes > 0;
  }

  /**
   * Local-only delete (no tombstone). Used ONLY by sync-convergence
   * paths where the deletion intent belongs to another device, not
   * the user here. Writing a tombstone in those paths would cause
   * the sync cycle to propagate the deletion back up to the server
   * - which is correct if the other device intentionally deleted,
   * but wrong if the "remote is missing this file" state is actually
   * a transient push-vs-pull race in syncAllContextFiles. Safer
   * default: mirror without amplifying.
   *
   * User-initiated deletes (UI, IPC) MUST keep going through
   * deleteContextFile() so the tombstone flows.
   */
  deleteContextFileLocalOnly(fileId: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM mode_context_chunks WHERE file_id = ?').run(fileId);
    const result = this.db.prepare('DELETE FROM mode_context_files WHERE id = ?').run(fileId);
    return result.changes > 0;
  }

  deleteAllContextForMode(modeId: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.prepare('DELETE FROM mode_context_chunks WHERE mode_id = ?').run(modeId);
    this.db.prepare('DELETE FROM mode_context_files WHERE mode_id = ?').run(modeId);
  }

  /** See hasModeTombstone. Same contract, for context files. */
  hasContextFileTombstone(fileId: string): boolean {
    if (!this.db) throw new Error('Database not initialized');
    const row = this.db
      .prepare('SELECT 1 FROM context_file_tombstones WHERE id = ?')
      .get(fileId) as { 1: number } | undefined;
    return row !== undefined;
  }

  /**
   * Returns the unconfirmed context-file tombstones as (modeId, fileId)
   * pairs - the sync cycle needs both to hit the backend DELETE url.
   * Oldest first.
   */
  getUnconfirmedContextFileTombstones(): Array<{ fileId: string; modeId: string }> {
    if (!this.db) throw new Error('Database not initialized');
    const rows = this.db
      .prepare(
        `SELECT id, mode_id FROM context_file_tombstones
         WHERE server_confirmed_at IS NULL
         ORDER BY deleted_at ASC`
      )
      .all() as Array<{ id: string; mode_id: string }>;
    return rows.map((r) => ({ fileId: r.id, modeId: r.mode_id }));
  }

  /** See confirmModeTombstone. Same contract, for context files. */
  confirmContextFileTombstone(fileId: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db
      .prepare('UPDATE context_file_tombstones SET server_confirmed_at = ? WHERE id = ?')
      .run(Date.now(), fileId);
  }

  /** See purgeOldModeTombstones. Same cadence + cutoffs, for context files. */
  purgeOldContextFileTombstones(): number {
    if (!this.db) throw new Error('Database not initialized');
    const now = Date.now();
    const confirmedCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const staleCutoff = now - 180 * 24 * 60 * 60 * 1000;
    const result = this.db
      .prepare(
        `DELETE FROM context_file_tombstones
         WHERE (server_confirmed_at IS NOT NULL AND server_confirmed_at < ?)
            OR (server_confirmed_at IS NULL AND deleted_at < ?)`
      )
      .run(confirmedCutoff, staleCutoff);
    return result.changes;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      log.info('Closed');
    }
  }
}

// Singleton instance
export const databaseService = new DatabaseService();
