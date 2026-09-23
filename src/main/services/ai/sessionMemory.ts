/**
 * Long-session memory for Assist.
 *
 * Pattern (Anthropic session-memory cookbook + Claude Code /compact +
 * Magic Compact): never rely on "drop oldest." That is how interview
 * problem statements and corrections rot out of a 1–2h thread.
 *
 * Each Assist is a new API call. We send:
 *   1. Structured session memory (running summary, cheap model, background)
 *   2. Pinned opening transcript (first problem / intro — verbatim)
 *   3. Pinned user-typed questions (verbatim)
 *   4. Last few turns (verbatim, assistant replies capped)
 *   5. Live transcript tail + delta since last Assist (not full+delta twice)
 *
 * fitMessagesToContext remains the hard window guard. Pins live in the
 * system prompt so a window trim cannot delete the original task.
 */

import type { AIMessage } from './types';

export const RECENT_HISTORY_MESSAGES = 8;
export const ASSISTANT_REPLAY_CHAR_LIMIT = 6_000;
export const USER_DIGEST_CHAR_LIMIT = 400;
export const USER_PIN_LIMIT = 24;
export const OPENING_LINE_LIMIT = 150;
export const OPENING_CHAR_LIMIT = 4_000;
export const TRANSCRIPT_DELTA_MEMORY_CHAR_LIMIT = 8_000;
export const SESSION_MEMORY_MAX_TOKENS = 2_500;
export const SESSION_MEMORY_CHAR_CAP = 12_000;
export const MEMORY_REFRESH_MIN_MESSAGES = 4;
export const MEMORY_REFRESH_NEW_MESSAGES = 2;

export interface MemoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionMemory {
  text: string;
  throughMessageIndex: number;
  lastTranscriptLength: number;
  openingTranscript: string;
  userPins: string[];
}

export function createEmptyMemory(): SessionMemory {
  return {
    text: '',
    throughMessageIndex: 0,
    lastTranscriptLength: 0,
    openingTranscript: '',
    userPins: [],
  };
}

/**
 * Serialize memory for storage against the session. Returns null when there
 * is nothing worth keeping so the column stays NULL for sessions where
 * Assist was never used.
 */
export function serializeSessionMemory(memory: SessionMemory): string | null {
  const hasContent = memory.text.trim() || memory.openingTranscript.trim() || memory.userPins.length > 0;
  if (!hasContent) return null;
  return JSON.stringify({
    text: memory.text,
    openingTranscript: memory.openingTranscript,
    userPins: memory.userPins,
  });
}

export function parseStoredSessionMemory(json: string | null | undefined): SessionMemory | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Partial<SessionMemory> | null;
    if (!raw || typeof raw !== 'object') return null;
    return {
      text: typeof raw.text === 'string' ? raw.text : '',
      openingTranscript: typeof raw.openingTranscript === 'string' ? raw.openingTranscript : '',
      userPins: Array.isArray(raw.userPins) ? raw.userPins.filter((p): p is string => typeof p === 'string') : [],
      // Message indices belong to the conversation that produced them; a
      // resumed session starts a new one.
      throughMessageIndex: 0,
      lastTranscriptLength: 0,
    };
  } catch {
    return null;
  }
}

export interface ResumedMemorySource {
  storedMemoryJson: string | null;
  summary: string | null;
  /** Already-parsed action items from the earlier sitting. */
  actionItems: ReadonlyArray<{ task: string; assignee: string | null; deadline: string | null }>;
  title: string;
  firstStartedAt: number;
  resumedAt: number;
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

const RESUMED_HEADING = '## Resumed Session';

/**
 * Drop the "Resumed Session" section a previous resume wrote, so a third
 * sitting gets one fresh note instead of a stack of stale ones.
 */
export function stripResumedNote(text: string): string {
  const start = text.indexOf(RESUMED_HEADING);
  if (start === -1) return text;
  const rest = text.slice(start + RESUMED_HEADING.length);
  const next = rest.search(/\n## /);
  const end = next === -1 ? text.length : start + RESUMED_HEADING.length + next;
  return `${text.slice(0, start)}${text.slice(end)}`.trim();
}

/**
 * Memory for a session that is being continued after a break. Prefers the
 * memory Assist built during the earlier sitting; falls back to the stored
 * post-call summary and action items when Assist was never used; always
 * leads with a note that says the session was resumed so the model reads
 * "yesterday" correctly instead of assuming it all just happened.
 */
export function buildResumedMemory(src: ResumedMemorySource): SessionMemory {
  const stored = parseStoredSessionMemory(src.storedMemoryJson) ?? createEmptyMemory();
  const title = src.title.trim() || 'Untitled session';

  const resumeNote =
    `${RESUMED_HEADING}\n`
    + `This session ("${title}") began on ${formatWhen(src.firstStartedAt)}, was stopped, `
    + `and is being continued now (${formatWhen(src.resumedAt)}). Everything recorded before `
    + `this point happened in the earlier sitting; the live transcript continues from here.`;

  const sections: string[] = [resumeNote];
  const priorText = stripResumedNote(stored.text);

  if (priorText) {
    sections.push(priorText);
  } else if (src.summary?.trim()) {
    sections.push(`## Earlier Sitting Summary\n${src.summary.trim()}`);
    if (src.actionItems.length > 0) {
      const lines = src.actionItems.map((item) => {
        const who = item.assignee ? ` (${item.assignee})` : '';
        const when = item.deadline ? ` - due ${item.deadline}` : '';
        return `- ${item.task}${who}${when}`;
      });
      sections.push(`## Action Items From Earlier Sitting\n${lines.join('\n')}`);
    }
  } else {
    sections.push(
      '## Earlier Sitting\nNo notes exist for the earlier sitting. Rely on the pinned opening and the transcript, which includes it.',
    );
  }

  return {
    text: sections.join('\n\n').slice(0, SESSION_MEMORY_CHAR_CAP),
    openingTranscript: stored.openingTranscript,
    userPins: stored.userPins,
    throughMessageIndex: 0,
    lastTranscriptLength: 0,
  };
}

export function windowLines(text: string, limit: number): string {
  const lines = text.split('\n');
  if (lines.length <= limit) return text;
  const kept = lines.slice(-limit);
  return `[...earlier conversation omitted - ${lines.length - limit} lines]\n${kept.join('\n')}`;
}

/** First lines of the meeting — the problem statement. NOT the tail. */
export function captureOpeningTranscript(transcript: string): string {
  const lines = transcript.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
  if (lines.length === 0) return '';
  const head = lines.slice(0, OPENING_LINE_LIMIT).join('\n');
  return head.length > OPENING_CHAR_LIMIT ? head.slice(0, OPENING_CHAR_LIMIT) : head;
}

export function pinOpeningIfNeeded(memory: SessionMemory, transcript: string): SessionMemory {
  if (memory.openingTranscript.trim() || !transcript.trim()) return memory;
  return { ...memory, openingTranscript: captureOpeningTranscript(transcript) };
}

export function pinUserQuestion(memory: SessionMemory, question?: string): SessionMemory {
  const q = question?.replace(/\s+/g, ' ').trim() ?? '';
  if (q.length < 2) return memory;
  if (memory.userPins.some((p) => p === q)) return memory;
  return { ...memory, userPins: [...memory.userPins, q].slice(-USER_PIN_LIMIT) };
}

export function openingStillVisible(opening: string, nowWindow: string): boolean {
  const needle = opening.slice(0, Math.min(80, opening.length)).trim();
  if (needle.length < 24) return true;
  return nowWindow.includes(needle);
}

export function digestUserTurn(params: {
  actionLabel: string;
  customPrompt?: string;
  transcript: string;
}): string {
  if (params.customPrompt?.trim()) return params.customPrompt.trim();
  const tail = params.transcript.replace(/\s+/g, ' ').trim().slice(-USER_DIGEST_CHAR_LIMIT);
  return tail ? `${params.actionLabel}: ${tail}` : params.actionLabel;
}

export function buildTranscriptBlock(params: {
  transcript: string;
  lastProcessedLength: number;
  isFirstTurn: boolean;
  nowLineLimit: number;
}): string {
  const raw = params.transcript.trim();
  if (!raw) return '';

  const nowWindow = windowLines(params.transcript, params.nowLineLimit);

  if (params.isFirstTurn) {
    return `<transcript>\n${nowWindow}\n</transcript>\n\n`;
  }

  const delta = params.transcript.slice(params.lastProcessedLength);
  if (delta.trim()) {
    const windowedDelta = windowLines(delta, params.nowLineLimit);
    return (
      `<transcript>\n[NEW SINCE LAST - read first]\n${windowedDelta.trim()}\n\n`
      + `[RECENT TAIL]\n${nowWindow}\n</transcript>\n\n`
    );
  }

  return `<transcript note="unchanged_since_last">\n${nowWindow}\n</transcript>\n\n`;
}

export function transcriptDeltaForMemory(full: string, fromLength: number): string {
  const delta = full.slice(fromLength);
  if (delta.length <= TRANSCRIPT_DELTA_MEMORY_CHAR_LIMIT) return delta;
  const head = 2_500;
  const tail = TRANSCRIPT_DELTA_MEMORY_CHAR_LIMIT - head - 28;
  return `${delta.slice(0, head)}\n[...middle omitted...]\n${delta.slice(-tail)}`;
}

export function shouldRefreshMemory(memory: SessionMemory, messageCount: number): boolean {
  if (messageCount < MEMORY_REFRESH_MIN_MESSAGES) return false;
  return messageCount - memory.throughMessageIndex >= MEMORY_REFRESH_NEW_MESSAGES;
}

export function acceptMemoryText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 40) return null;
  if (/^(i('m| am) sorry|i cannot|i can't)/i.test(trimmed)) return null;
  const headings = trimmed.match(/^##\s+/gm);
  if (!headings || headings.length < 2) return null;
  return trimmed.slice(0, SESSION_MEMORY_CHAR_CAP);
}

export function truncateForReplay(role: 'user' | 'assistant', content: string): string {
  if (role === 'user') return content;
  if (content.length <= ASSISTANT_REPLAY_CHAR_LIMIT) return content;
  return `${content.slice(0, ASSISTANT_REPLAY_CHAR_LIMIT)}\n[...answer truncated; full solution is in session_memory if already compacted]`;
}

export function selectRecentTurns<T>(messages: T[], limit = RECENT_HISTORY_MESSAGES): T[] {
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
}

export function buildReplayMessages(params: {
  history: Array<{ role: 'user' | 'assistant'; content: string; digest?: string }>;
  currentUserMessage: string;
  screenshot: { data: string; mediaType: 'image/png' } | null;
}): AIMessage[] {
  const recent = selectRecentTurns(params.history);
  const messages: AIMessage[] = [];

  for (let i = 0; i < recent.length - 1; i++) {
    const msg = recent[i];
    const raw = msg.role === 'user' ? (msg.digest || msg.content) : msg.content;
    messages.push({
      role: msg.role,
      content: msg.role === 'user'
        ? `[Previous request: ${raw}]`
        : truncateForReplay('assistant', raw),
    });
  }

  if (params.screenshot) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: params.currentUserMessage },
        { type: 'image', base64: params.screenshot.data, mediaType: params.screenshot.mediaType },
      ],
    });
  } else {
    messages.push({ role: 'user', content: params.currentUserMessage });
  }

  return messages;
}

export function buildPinnedSystemBlock(memory: SessionMemory, nowWindow: string): string {
  const parts: string[] = [];

  if (memory.text.trim()) {
    parts.push(
      `<session_memory>\n${memory.text.trim()}\n</session_memory>`,
    );
  }

  if (memory.openingTranscript.trim() && !openingStillVisible(memory.openingTranscript, nowWindow)) {
    parts.push(
      `<pinned_opening>\n${memory.openingTranscript.trim()}\n</pinned_opening>`,
    );
  }

  if (memory.userPins.length > 0) {
    const list = memory.userPins.map((q, i) => `${i + 1}. ${q}`).join('\n');
    parts.push(`<pinned_user_questions>\n${list}\n</pinned_user_questions>`);
  }

  return parts.length ? `\n\n${parts.join('\n\n')}` : '';
}

export function shiftMemoryAfterTrim(memory: SessionMemory, dropped: number): SessionMemory {
  if (dropped <= 0) return memory;
  return {
    ...memory,
    throughMessageIndex: Math.max(0, memory.throughMessageIndex - dropped),
  };
}

export function buildMemoryUpdatePrompt(params: {
  previousMemory: string;
  turns: MemoryTurn[];
  transcriptDelta: string;
}): string {
  const turnBlock = params.turns.map((t) => {
    const body = t.content.length > 4_000 ? `${t.content.slice(0, 4_000)}\n[...truncated...]` : t.content;
    return `<${t.role}>\n${body}\n</${t.role}>`;
  }).join('\n\n');

  const prior = params.previousMemory.trim()
    ? params.previousMemory.trim()
    : '(none — this is the first compression)';

  const spoken = params.transcriptDelta.trim()
    ? params.transcriptDelta.trim()
    : '(no new spoken transcript)';

  return `${MEMORY_UPDATE_PROMPT}

<previous_session_memory>
${prior}
</previous_session_memory>

<new_assist_turns>
${turnBlock || '(none)'}
</new_assist_turns>

<new_spoken_transcript>
${spoken}
</new_spoken_transcript>

Write the full updated session memory now. Output only the markdown sections.`;
}

/**
 * Adapted from Anthropic's official session-memory cookbook prompt.
 * Interview/coding additions: original problem, language, rejected
 * approaches, and spoken corrections must survive compression.
 */
export const MEMORY_UPDATE_PROMPT = `Compress this live meeting + Assist thread into a structured session memory
that lets you continue without asking the user to repeat themselves.
Optimize for the assistant continuing the work, not for a human recap.

This is used in interviews, coding screens, and long meetings. Losing the
original problem, a constraint, or a correction causes wrong answers.

Before writing, think through:
1. What was the original task / problem? Quote key requirements.
2. What did the user or interviewer correct or reject?
3. What approaches already failed?
4. What is the current solution state (code shape, answer, decision)?
5. What is happening right now in the spoken conversation?
6. Which names, numbers, languages, and constraints must survive?

## User Intent
The original request and any refinements. Use direct quotes for requirements.
If the goal evolved, record that progression.

## Problem / Interview Task
The problem statement, input/output examples, language or stack, time
limits, and constraints. Keep these verbatim when possible. If a later
turn replaced the task, keep BOTH the old task (marked superseded) and
the current one.

## Completed Work
What Assist already produced that is still in force: key functions,
final answers, decisions. Do not paste entire files — keep signatures,
algorithms, and the latest agreed solution.

## Errors & Corrections
Failed approaches (do not retry). User/interviewer corrections verbatim:
"don't do X", "actually I meant Y", "that's wrong because...".

## Active Work
What was in progress at the end of the latest turn. Partial state,
the last question asked, where the code or discussion left off.

## Pending Tasks
Explicit remaining asks vs implied ones.

## Meeting Facts
Names, companies, numbers, dates, decisions said aloud that are still true.

Rules:
- Each section under 400 words. Condense older content; keep recent detail.
- If you must cut: user corrections > original problem > errors > active work > completed work.
- Omit filler and pleasantries.
- Merge with <previous_session_memory>; do not drop facts that are still true.
- Never invent requirements that were not in the source.`;
