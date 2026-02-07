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

export interface Session {
  id: string;
  title: string;
  transcript: TranscriptEntry[];
  aiResponses: AIResponse[];
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
  mode_id: string | null;
  duration_seconds: number;
  started_at: number;
  ended_at: number | null;
  created_at: number;
}

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
  }

  /**
   * Create a new session
   */
  createSession(session: Omit<Session, 'createdAt'>): Session {
    if (!this.db) throw new Error('Database not initialized');

    const createdAt = Date.now();
    const fullSession: Session = { ...session, createdAt };

    this.db
      .prepare(
        `INSERT INTO sessions (id, title, transcript_json, ai_responses_json, mode_id, duration_seconds, started_at, ended_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fullSession.id,
        fullSession.title,
        JSON.stringify(fullSession.transcript),
        JSON.stringify(fullSession.aiResponses),
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
      modeId: row.mode_id,
      durationSeconds: row.duration_seconds,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
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
