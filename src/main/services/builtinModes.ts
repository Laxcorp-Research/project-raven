/**
 * Built-in Mode Definitions
 * These are seeded on first run and can be reset to defaults
 */

import { databaseService } from './database';

export interface BuiltinModeDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  systemPrompt: string;
  quickActions: { id: string; label: string; prompt: string; icon?: string }[];
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
    quickActions: [
      { id: 'interview-assist', label: 'Help me answer', prompt: 'Help me formulate a strong answer to the question that was just asked. Use the STAR method if it\'s a behavioral question.', icon: '💡' },
      { id: 'interview-clarify', label: 'Clarify question', prompt: 'Help me ask a clarifying question about what was just asked to make sure I understand correctly.', icon: '❓' },
      { id: 'interview-followup', label: 'Question to ask', prompt: 'Suggest a thoughtful follow-up question I could ask based on what we\'ve discussed.', icon: '🎯' },
      { id: 'interview-recap', label: 'Key points', prompt: 'Summarize the key points from this conversation that I should remember.', icon: '📝' },
    ],
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
    quickActions: [
      { id: 'sales-objection', label: 'Handle objection', prompt: 'Help me respond to the objection or concern that was just raised. Focus on understanding their perspective and addressing it.', icon: '🛡️' },
      { id: 'sales-value', label: 'Show value', prompt: 'Suggest how I can reinforce our value proposition based on what the prospect has shared.', icon: '💎' },
      { id: 'sales-discover', label: 'Discovery question', prompt: 'Suggest a discovery question to better understand their needs or pain points.', icon: '🔍' },
      { id: 'sales-next', label: 'Next steps', prompt: 'Suggest how to advance this conversation toward next steps or a close.', icon: '➡️' },
    ],
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
    quickActions: [
      { id: 'meeting-recap', label: 'Quick recap', prompt: 'Give me a quick recap of the key points discussed so far.', icon: '📝' },
      { id: 'meeting-actions', label: 'Action items', prompt: 'List the action items mentioned so far, including who\'s responsible if stated.', icon: '✅' },
      { id: 'meeting-decisions', label: 'Decisions made', prompt: 'Summarize the decisions that have been made in this meeting.', icon: '⚖️' },
      { id: 'meeting-questions', label: 'Open questions', prompt: 'What questions or topics seem unresolved or need follow-up?', icon: '❓' },
    ],
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
    quickActions: [
      { id: 'learning-explain', label: 'Explain this', prompt: 'Explain the concept that was just discussed in simpler terms with an example.', icon: '💡' },
      { id: 'learning-example', label: 'Give example', prompt: 'Provide a concrete, real-world example of what was just explained.', icon: '🎯' },
      { id: 'learning-summary', label: 'Summarize', prompt: 'Summarize the key concepts covered so far in a clear, organized way.', icon: '📝' },
      { id: 'learning-questions', label: 'Study questions', prompt: 'Suggest some questions I should be able to answer based on this material.', icon: '❓' },
    ],
  },
];

/**
 * Seed built-in modes - DISABLED
 * Templates now create modes on-demand, not pre-seeded
 */
export function seedBuiltinModes(): void {
  console.log('[BuiltinModes] Templates available on-demand, no seeding needed');
}

/**
 * Reset a built-in mode to its default values
 */
export function resetBuiltinMode(id: string): boolean {
  const modeDef = BUILTIN_MODES.find((m) => m.id === id);
  if (!modeDef) {
    console.log('[BuiltinModes] Mode not found for reset:', id);
    return false;
  }

  databaseService.updateMode(id, {
    name: modeDef.name,
    systemPrompt: modeDef.systemPrompt,
    icon: modeDef.icon,
    color: modeDef.color,
    quickActions: modeDef.quickActions,
  });

  console.log('[BuiltinModes] Reset mode to defaults:', modeDef.name);
  return true;
}

/**
 * Get the default system prompt for a builtin mode
 */
export function getBuiltinModeDefaults(id: string): BuiltinModeDefinition | null {
  return BUILTIN_MODES.find((m) => m.id === id) || null;
}
