/**
 * Database tests -- unit tests for row conversion and query logic.
 *
 * Note: better-sqlite3 is a native module compiled for Electron's Node version,
 * so we can't use it directly in vitest (system Node). Instead, we test the
 * conversion logic and data integrity by verifying the expected transforms.
 */
import { describe, it, expect } from 'vitest';

import type { SessionRow, ModeRow } from '../services/database';

/**
 * Replicates the private rowToSession logic from DatabaseService.
 * This is the exact same code so we can test the conversion in isolation.
 */
function rowToSession(row: SessionRow) {
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

/**
 * Replicates the private rowToMode logic from DatabaseService.
 */
function rowToMode(row: ModeRow) {
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    icon: row.icon,
    color: row.color,
    isDefault: row.is_default === 1,
    isBuiltin: row.is_builtin === 1,
    notesTemplate: row.notes_template_json ? JSON.parse(row.notes_template_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

describe('rowToSession', () => {
  it('correctly maps all fields from a database row', () => {
    const row: SessionRow = {
      id: 'session-1',
      title: 'Test Session',
      transcript_json: JSON.stringify([
        { id: 'e1', source: 'mic', text: 'Hello', timestamp: 1000, isFinal: true },
      ]),
      ai_responses_json: JSON.stringify([
        { id: 'ai1', action: 'assist', userMessage: 'help', response: 'Sure', timestamp: 2000 },
      ]),
      summary: 'A summary',
      mode_id: 'mode-1',
      duration_seconds: 120,
      started_at: 1000000,
      ended_at: 1120000,
      created_at: 1000000,
    };

    const session = rowToSession(row);

    expect(session.id).toBe('session-1');
    expect(session.title).toBe('Test Session');
    expect(session.transcript).toHaveLength(1);
    expect(session.transcript[0].text).toBe('Hello');
    expect(session.aiResponses).toHaveLength(1);
    expect(session.aiResponses[0].response).toBe('Sure');
    expect(session.summary).toBe('A summary');
    expect(session.modeId).toBe('mode-1');
    expect(session.durationSeconds).toBe(120);
    expect(session.startedAt).toBe(1000000);
    expect(session.endedAt).toBe(1120000);
  });

  it('parses JSON fields into arrays', () => {
    const row: SessionRow = {
      id: 'session-2',
      title: 'JSON Test',
      transcript_json: JSON.stringify([
        { id: 'e1', source: 'mic', text: 'First', timestamp: 100, isFinal: true },
        { id: 'e2', source: 'system', text: 'Second', timestamp: 200, isFinal: true },
      ]),
      ai_responses_json: '[]',
      summary: null,
      mode_id: null,
      duration_seconds: 0,
      started_at: 100,
      ended_at: null,
      created_at: 100,
    };

    const session = rowToSession(row);
    expect(Array.isArray(session.transcript)).toBe(true);
    expect(session.transcript).toHaveLength(2);
    expect(Array.isArray(session.aiResponses)).toBe(true);
    expect(session.aiResponses).toHaveLength(0);
  });

  it('handles empty transcript JSON', () => {
    const row: SessionRow = {
      id: 'session-3',
      title: 'Empty',
      transcript_json: '[]',
      ai_responses_json: '[]',
      summary: null,
      mode_id: null,
      duration_seconds: 0,
      started_at: 100,
      ended_at: null,
      created_at: 100,
    };

    const session = rowToSession(row);
    expect(session.transcript).toEqual([]);
    expect(session.aiResponses).toEqual([]);
  });

  it('converts null summary correctly', () => {
    const row: SessionRow = {
      id: 'session-4',
      title: 'No Summary',
      transcript_json: '[]',
      ai_responses_json: '[]',
      summary: null,
      mode_id: null,
      duration_seconds: 0,
      started_at: 100,
      ended_at: null,
      created_at: 100,
    };

    const session = rowToSession(row);
    expect(session.summary).toBeNull();
  });

  it('converts empty string summary to null', () => {
    const row: SessionRow = {
      id: 'session-5',
      title: 'Empty Summary',
      transcript_json: '[]',
      ai_responses_json: '[]',
      summary: '',
      mode_id: null,
      duration_seconds: 0,
      started_at: 100,
      ended_at: null,
      created_at: 100,
    };

    const session = rowToSession(row);
    expect(session.summary).toBeNull();
  });
});

describe('rowToMode', () => {
  it('converts is_default and is_builtin integers to booleans', () => {
    const row: ModeRow = {
      id: 'mode-1',
      name: 'Interview',
      system_prompt: 'Help',
      icon: '🎤',
      color: '#3b82f6',
      is_default: 1,
      is_builtin: 0,
      notes_template_json: null,
      created_at: 1000,
      updated_at: 1000,
    };

    const mode = rowToMode(row);
    expect(mode.isDefault).toBe(true);
    expect(mode.isBuiltin).toBe(false);
    expect(typeof mode.isDefault).toBe('boolean');
    expect(typeof mode.isBuiltin).toBe('boolean');
  });

  it('handles null notesTemplate', () => {
    const row: ModeRow = {
      id: 'mode-3',
      name: 'General',
      system_prompt: 'General help',
      icon: '🎯',
      color: '#6366f1',
      is_default: 0,
      is_builtin: 0,
      notes_template_json: null,
      created_at: 1000,
      updated_at: 1000,
    };

    const mode = rowToMode(row);
    expect(mode.notesTemplate).toBeNull();
  });

  it('parses notesTemplate JSON when present', () => {
    const notes = [
      { id: 'n1', title: 'Key Points', instructions: 'List main points' },
    ];

    const row: ModeRow = {
      id: 'mode-4',
      name: 'Meeting',
      system_prompt: 'Meeting help',
      icon: '📋',
      color: '#8b5cf6',
      is_default: 0,
      is_builtin: 0,
      notes_template_json: JSON.stringify(notes),
      created_at: 1000,
      updated_at: 1000,
    };

    const mode = rowToMode(row);
    expect(mode.notesTemplate).toHaveLength(1);
    expect(mode.notesTemplate![0].title).toBe('Key Points');
  });
});
