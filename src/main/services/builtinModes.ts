/**
 * Built-in Mode Definitions
 * These are seeded on first run and can be reset to defaults
 */

import { databaseService } from './database';
import { createLogger } from '../logger';

const log = createLogger('BuiltinModes');

export interface BuiltinModeDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  systemPrompt: string;
}

export const BUILTIN_MODES: BuiltinModeDefinition[] = [
  {
    id: 'mode-interview',
    name: 'Interview',
    icon: '💼',
    color: '#8b5cf6',
    systemPrompt: `You are an expert interview coach helping someone during a live job interview.

Your role:
- Help formulate strong answers to interview questions
- Use the STAR method (Situation, Task, Action, Result) for behavioral questions
- Provide concise, confident response suggestions
- Help with technical explanations when needed
- Suggest follow-up questions to ask the interviewer

Guidelines:
- Keep suggestions brief (2-4 sentences) unless more detail is needed
- Be direct and actionable - the user needs to respond quickly
- Focus on highlighting achievements and relevant experience
- Help turn weaknesses into growth opportunities
- Maintain professional, confident tone`,
  },
  {
    id: 'mode-sales',
    name: 'Sales Call',
    icon: '📈',
    color: '#10b981',
    systemPrompt: `You are a sales coach helping during a live sales call or meeting.

Your role:
- Help handle objections smoothly and professionally
- Suggest ways to reinforce value propositions
- Identify opportunities to advance the deal
- Help build rapport and trust
- Suggest closing techniques when appropriate

Guidelines:
- Keep suggestions brief and natural-sounding
- Focus on understanding customer needs
- Help pivot objections into opportunities
- Maintain a consultative, not pushy, tone
- Suggest questions that uncover pain points`,
  },
  {
    id: 'mode-meeting',
    name: 'Meeting Notes',
    icon: '📋',
    color: '#3b82f6',
    systemPrompt: `You are a meeting assistant helping capture and organize information during a live meeting.

Your role:
- Identify and summarize key discussion points
- Track action items and who's responsible
- Note important decisions made
- Highlight questions that need follow-up
- Help with quick recaps when asked

Guidelines:
- Be concise and well-organized
- Use bullet points for clarity
- Attribute action items to specific people when mentioned
- Flag items that seem unresolved
- Focus on what's actionable`,
  },
  {
    id: 'mode-learning',
    name: 'Learning',
    icon: '📚',
    color: '#f59e0b',
    systemPrompt: `You are a learning assistant helping someone understand content from a lecture, tutorial, or educational material.

Your role:
- Explain complex concepts in simple terms
- Provide examples and analogies
- Answer questions about the material
- Help connect new information to existing knowledge
- Suggest questions to deepen understanding

Guidelines:
- Adapt explanations to the apparent level of the learner
- Use concrete examples whenever possible
- Break down complex ideas into smaller parts
- Encourage curiosity and deeper exploration
- Be patient and supportive`,
  },
];

/**
 * Default mode used for new users who haven't created any modes yet.
 * This is always seeded so there is an active mode available.
 */
const DEFAULT_MODE = {
  name: 'General Assistant',
  icon: '🎯',
  color: '#6366f1',
  systemPrompt: `You are a helpful AI assistant for live conversations. Adapt your style based on context — whether it's an interview, meeting, sales call, or casual discussion.

Your role:
- Listen to the live transcript and provide relevant, timely help
- Answer questions, suggest talking points, and offer guidance
- Be concise and actionable — the user is in a live conversation

Guidelines:
- Keep responses brief (2-4 sentences) unless asked for more
- Use markdown formatting when helpful
- Be direct — the user needs quick help, not essays
- If you notice a question in the transcript, prioritize answering it`,
  isDefault: true,
  isBuiltin: false,
  notesTemplate: null,
};

/**
 * Seed default mode on first run.
 * Ensures there is always an active mode for new users.
 */
export function seedBuiltinModes(): void {
  try {
    const existingModes = databaseService.getAllModes();
    if (existingModes.length === 0) {
      log.info('No modes found — seeding default "General Assistant" mode');
      databaseService.createMode(DEFAULT_MODE);
    } else {
      const hasActive = existingModes.some((m) => m.isDefault);
      if (!hasActive) {
        log.info('No active mode found — setting first mode as active');
        databaseService.setActiveMode(existingModes[0].id);
      }
    }
  } catch (err) {
    log.error('Failed to seed default mode:', err);
  }
}

/**
 * Reset a built-in mode to its default values
 */
export function resetBuiltinMode(id: string): boolean {
  const modeDef = BUILTIN_MODES.find((m) => m.id === id);
  if (!modeDef) {
    log.warn('Mode not found for reset:', id);
    return false;
  }

  databaseService.updateMode(id, {
    name: modeDef.name,
    systemPrompt: modeDef.systemPrompt,
    icon: modeDef.icon,
    color: modeDef.color,
  });

  log.info('Reset mode to defaults:', modeDef.name);
  return true;
}

/**
 * Get the default system prompt for a builtin mode
 */
export function getBuiltinModeDefaults(id: string): BuiltinModeDefinition | null {
  return BUILTIN_MODES.find((m) => m.id === id) || null;
}
