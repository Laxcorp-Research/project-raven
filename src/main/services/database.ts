/**
 * Database Service - SQLite persistence for sessions
 * Uses better-sqlite3 for synchronous, reliable local storage
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// Types
export interface TranscriptEntry {
  id: string;
  source: 'mic' | 'system';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface AIResponse {
  id: string;
  action: string;
  userMessage: string;
  response: string;
  timestamp: number;
}

export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
}

export interface Mode {
  id: string;
  name: string;
  systemPrompt: string;
  icon: string;
  color: string;
  isDefault: boolean;
  isBuiltin: boolean;
  quickActions: QuickAction[];
  notesTemplate: NotesSection[] | null;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  title: string;
  transcript: TranscriptEntry[];
  aiResponses: AIResponse[];
  summary: string | null;
  modeId: string | null;
  durationSeconds: number;
  startedAt: number;
  endedAt: number | null;
  createdAt: number;
}

export interface SessionRow {
  id: string;
  title: string;
  transcript_json: string;
  ai_responses_json: string;
  summary: string | null;
  mode_id: string | null;
  duration_seconds: number;
  started_at: number;
  ended_at: number | null;
  created_at: number;
}

export interface ModeRow {
  id: string;
  name: string;
  system_prompt: string;
  icon: string;
  color: string;
  is_default: number;
  is_builtin: number;
  quick_actions_json: string;
  notes_template_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface NotesSection {
  id: string;
  title: string;
  instructions: string;
}

const LATEST_VERSION = 4;

class DatabaseService {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'data');

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.dbPath = path.join(dbDir, 'raven.db');
  }

  /**
   * Initialize database and run migrations
   */
  initialize(): void {
    if (this.db) return;

    console.log('[Database] Initializing at:', this.dbPath);

    this.db = new Database(this.dbPath);

    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');

    // Run migrations
    this.migrate();

    console.log('[Database] Initialized successfully');
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

    const migrations = [
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
    ];

    const applied = this.db
      .prepare('SELECT name FROM migrations')
      .all()
      .map((row: any) => row.name);

    for (const migration of migrations) {
      if (!applied.includes(migration.name)) {
        console.log('[Database] Running migration:', migration.name);
        this.db.exec(migration.sql);
        this.db
          .prepare('INSERT INTO migrations (name, applied_at) VALUES (?, ?)')
          .run(migration.name, Date.now());
      }
    }

    console.log('[Database] Migrations up to v' + LATEST_VERSION);
  }

  /**
   * Create a new session
   */
  createSession(session: Omit<Session, 'createdAt'>): Session {
    if (!this.db) throw new Error('Database not initialized');

    const createdAt = Date.now();
    const fullSession: Session = { ...session, summary: session.summary ?? null, createdAt };

    this.db
      .prepare(
        `INSERT INTO sessions (id, title, transcript_json, ai_responses_json, summary, mode_id, duration_seconds, started_at, ended_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullSession.id,
        fullSession.title,
        JSON.stringify(fullSession.transcript),
        JSON.stringify(fullSession.aiResponses),
        fullSession.summary,
        fullSession.modeId,
        fullSession.durationSeconds,
        fullSession.startedAt,
        fullSession.endedAt,
        fullSession.createdAt
      );

    console.log('[Database] Created session:', fullSession.id);
    return fullSession;
  }

  /**
   * Update an existing session
   */
  updateSession(id: string, updates: Partial<Omit<Session, 'id' | 'createdAt'>>): void {
    if (!this.db) throw new Error('Database not initialized');

    const setClauses: string[] = [];
    const values: any[] = [];

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

    console.log('[Database] Updated session:', id);
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

    const searchPattern = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions 
         WHERE title LIKE ? OR transcript_json LIKE ? 
         ORDER BY started_at DESC`
      )
      .all(searchPattern, searchPattern) as SessionRow[];

    return rows.map((row) => this.rowToSession(row));
  }

  /**
   * Delete a session
   */
  deleteSession(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const result = this.db
      .prepare('DELETE FROM sessions WHERE id = ?')
      .run(id);

    console.log('[Database] Deleted session:', id, 'changes:', result.changes);
    return result.changes > 0;
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
   * Convert database row to Session object
   */
  private rowToSession(row: SessionRow): Session {
    return {
      id: row.id,
      title: row.title,
      transcript: JSON.parse(row.transcript_json),
      aiResponses: JSON.parse(row.ai_responses_json),
      summary: row.summary || null,
      modeId: row.mode_id,
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
    };
  }

  // ==================== MODE METHODS ====================

  /**
   * Create a new mode
   */
  createMode(mode: Omit<Mode, 'id' | 'createdAt' | 'updatedAt'>): Mode {
    if (!this.db) throw new Error('Database not initialized');

    const id = globalThis.crypto.randomUUID();
    const now = Date.now();
    const fullMode: Mode = {
      ...mode,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO modes (id, name, system_prompt, icon, color, is_default, is_builtin, quick_actions_json, notes_template_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullMode.id,
        fullMode.name,
        fullMode.systemPrompt,
        fullMode.icon,
        fullMode.color,
        fullMode.isDefault ? 1 : 0,
        fullMode.isBuiltin ? 1 : 0,
        JSON.stringify(fullMode.quickActions),
        fullMode.notesTemplate ? JSON.stringify(fullMode.notesTemplate) : null,
        fullMode.createdAt,
        fullMode.updatedAt
      );

    console.log('[Database] Created mode:', fullMode.id, fullMode.name);
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

    console.log('[Database] Set active mode:', id);
    return result.changes > 0;
  }

  /**
   * Update a mode
   */
  updateMode(id: string, updates: Partial<Omit<Mode, 'id' | 'isBuiltin' | 'createdAt'>>): Mode | null {
    if (!this.db) throw new Error('Database not initialized');

    const setClauses: string[] = ['updated_at = ?'];
    const values: any[] = [Date.now()];

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
    if (updates.quickActions !== undefined) {
      setClauses.push('quick_actions_json = ?');
      values.push(JSON.stringify(updates.quickActions));
    }
    if (updates.notesTemplate !== undefined) {
      setClauses.push('notes_template_json = ?');
      values.push(updates.notesTemplate ? JSON.stringify(updates.notesTemplate) : null);
    }

    values.push(id);
    this.db
      .prepare(`UPDATE modes SET ${setClauses.join(', ')} WHERE id = ?`)
      .run(...values);

    console.log('[Database] Updated mode:', id);
    return this.getMode(id);
  }

  /**
   * Delete a mode (only non-builtin)
   */
  deleteMode(id: string): boolean {
    if (!this.db) throw new Error('Database not initialized');

    const mode = this.getMode(id);
    if (!mode || mode.isBuiltin) {
      console.log('[Database] Cannot delete builtin mode:', id);
      return false;
    }

    if (mode.isDefault) {
      const firstBuiltin = this.db
        .prepare('SELECT id FROM modes WHERE is_builtin = 1 LIMIT 1')
        .get() as { id: string } | undefined;
      if (firstBuiltin) {
        this.setActiveMode(firstBuiltin.id);
      }
    }

    const result = this.db
      .prepare('DELETE FROM modes WHERE id = ? AND is_builtin = 0')
      .run(id);

    console.log('[Database] Deleted mode:', id, 'changes:', result.changes);
    return result.changes > 0;
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
      quickActions: original.quickActions,
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
      quickActions: JSON.parse(row.quick_actions_json),
      notesTemplate: row.notes_template_json ? JSON.parse(row.notes_template_json) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[Database] Closed');
    }
  }
}

// Singleton instance
export const databaseService = new DatabaseService();
