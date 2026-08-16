/**
 * General Assistant built-in mode: seeding, upgrade migration, and
 * active-mode safety net.
 *
 * Other built-in modes (Interview / Sales / Meeting / Learning / Job
 * Search) live in src/renderer/src/components/dashboard/ModeEditorModal.tsx
 * as TEMPLATES the user explicitly picks from the Templates library.
 */

import { databaseService } from './database';
import { createLogger } from '../logger';

const log = createLogger('BuiltinModes');

// Known pre-v2.1 General Assistant systemPrompt variants. A row matching
// ANY of these verbatim is considered an unedited default and eligible for
// upgrade. Variants exist because minor punctuation drift (a missing
// period, a trailing whitespace) slipped into the DB on some installs -
// harmless to users, but enough to make a strict `===` check miss rows
// that are functionally unedited. We deliberately keep the list short +
// explicit rather than using fuzzy matching: any variant NOT in this list
// is treated as a user edit and left alone.
const PRE_V21_GENERAL_ASSISTANT_VARIANTS: readonly string[] = [
  // Canonical - matches what shipped in src/main/services/builtinModes.ts
  // before the v2.1 rewrite (commit 8a4bc45).
  `Adapt your coaching style based on the conversation context. You may be in an interview, meeting, sales call, lecture, or casual discussion.

- Read the room from the transcript and adjust your approach
- For formal contexts (interviews, client calls): be professional and structured
- For casual contexts (team chats, brainstorms): be conversational and direct
- If you detect a specific context (interview questions, sales objections, action items), adopt that style automatically

Match the formality of the conversation. Be direct and actionable. Concise by default, thorough when solving problems.`,

  // Period-drift variant - seen in production DBs for some installs. The
  // final bullet ends in "automatically." instead of "automatically".
  // Origin unclear (build-time formatter, or a pre-repo build). Treated as
  // unedited for migration purposes since the functional content is identical.
  `Adapt your coaching style based on the conversation context. You may be in an interview, meeting, sales call, lecture, or casual discussion.

- Read the room from the transcript and adjust your approach
- For formal contexts (interviews, client calls): be professional and structured
- For casual contexts (team chats, brainstorms): be conversational and direct
- If you detect a specific context (interview questions, sales objections, action items), adopt that style automatically.

Match the formality of the conversation. Be direct and actionable. Concise by default, thorough when solving problems.`,
];

/**
 * Default mode given to every new user as part of onboarding.
 *
 * NOTE: This is the bundled default. Hosted Pro used to overlay a
 * server-seeded prompt; the OSS app always uses this copy.
 */
const DEFAULT_MODE = {
  name: 'General Assistant',
  icon: '🎯',
  color: '#6366f1',
  systemPrompt: `You are operating in General Assistant mode. No specific conversation context is assumed - the user may be in any setting: interview, meeting, sales call, lecture, 1:1, casual chat.

Read <transcript> to identify the genre and adapt:
- Formal contexts (interviews, client calls, vendor reviews): be structured, professional, and precise. Name people and commitments.
- Casual contexts (brainstorms, team chats, catchups): match the register - shorter, more conversational, still substantive.
- If signals strongly indicate a specific sub-genre (interview questions, sales objections, action-item tracking), shift to that style automatically. Don't wait for the user to ask.

Concise by default. Thorough when solving a problem. Always actionable - the user is in a live conversation and needs something they can use.`,
  isDefault: true,
  isBuiltin: false,
  notesTemplate: [
    { id: 'gen-1', title: 'Summary', instructions: 'One-paragraph summary of what the conversation was about and what was accomplished.' },
    { id: 'gen-2', title: 'Key points', instructions: 'The most important topics discussed or decisions made.' },
    { id: 'gen-3', title: 'Action items', instructions: 'Tasks for me or others, with owners and deadlines if mentioned.' },
    { id: 'gen-4', title: 'Follow-up', instructions: 'Open questions, next steps, or things to circle back on.' },
  ],
};

/**
 * Create the default General Assistant mode for a new user.
 * Called once during onboarding completion - not on every startup.
 *
 * Always uses the bundled DEFAULT_MODE.systemPrompt. We never block
 * onboarding on a network call.
 */
export async function createDefaultMode(): Promise<void> {
  const existingModes = databaseService.getAllModes()
  if (existingModes.length > 0) {
    log.debug('User already has modes - skipping default mode creation')
    return
  }
  log.info('Creating default "General Assistant" mode for new user')

  databaseService.createMode({ ...DEFAULT_MODE })
}

/**
 * One-time content migration for existing users: upgrade the General
 * Assistant mode's systemPrompt + notesTemplate to the v2.1 version,
 * but only if the user hasn't edited it (exact-string match on the
 * pre-v2.1 default). Leaves user-edited prompts strictly alone.
 *
 * Intentionally NOT guarded by a "has-run" flag. Raven Pro switches SQLite
 * DBs per account (databaseService.switchToAccountDatabase) so a boot-time
 * flag would skip the migration for a DB that loads later in the session.
 * The function is idempotent instead: after a successful rewrite the row
 * no longer matches PRE_V21_GENERAL_ASSISTANT_PROMPT, so subsequent calls
 * are no-ops. One small extra getAllModes() per DB-switch is fine.
 *
 * New users created on v2.1+ never hit this path because their mode is
 * seeded with the new prompt directly (via DEFAULT_MODE).
 */
export function migrateGeneralAssistantPromptV21(): void {
  try {
    const modes = databaseService.getAllModes()
    const variants = new Set<string>(PRE_V21_GENERAL_ASSISTANT_VARIANTS)
    const candidates = modes.filter(
      (m) => m.name === 'General Assistant' && variants.has(m.systemPrompt)
    )

    if (candidates.length === 0) return

    for (const mode of candidates) {
      log.info(`Migrating General Assistant ${mode.id} to v2.1 prompt + notesTemplate`)
      databaseService.updateMode(mode.id, {
        systemPrompt: DEFAULT_MODE.systemPrompt,
        notesTemplate: DEFAULT_MODE.notesTemplate,
      })
    }
  } catch (err) {
    log.error('General Assistant v2.1 migration failed:', err)
    // Safe to ignore - next DB context or next boot will retry.
  }
}

/**
 * Safety net: ensure there's always an active mode.
 * Handles edge cases like database migration or corrupted state.
 * Does NOT create modes - that's done in onboarding via createDefaultMode().
 */
export function ensureActiveMode(): void {
  try {
    const existingModes = databaseService.getAllModes()
    if (existingModes.length === 0) return
    const hasActive = existingModes.some((m) => m.isDefault)
    if (!hasActive) {
      log.info('No active mode found - setting first mode as active')
      databaseService.setActiveMode(existingModes[0].id)
    }
  } catch (err) {
    log.error('Failed to ensure active mode:', err)
  }
}

