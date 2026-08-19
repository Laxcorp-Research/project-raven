/**
 * Live assist vs notes vs system memory.
 *
 * Memory is not a Settings slot. A weak compact poisons Assist for the
 * rest of the session, so this is Sonnet-class, not Haiku/Luna. Still
 * hits the Live assist vendor's key:
 * Anthropic → Claude Sonnet 5, OpenAI → GPT-5.6 Terra.
 *
 * Unset notes* still defaults to the cheap models (Haiku / Luna).
 */

export type AIProviderName = 'anthropic' | 'openai'

export const NOTES_FAST_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.6-luna',
}

/** System memory compact. Not user-configurable. Not the notes cheap default. */
export const MEMORY_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.6-terra',
}

export function parseAIProviderName(value: unknown): AIProviderName | null {
  return value === 'openai' || value === 'anthropic' ? value : null
}

/** notesProvider if set, else assist aiProvider, else Anthropic. */
export function resolveNotesProvider(notesProvider: unknown, aiProvider: unknown): AIProviderName {
  return parseAIProviderName(notesProvider) ?? parseAIProviderName(aiProvider) ?? 'anthropic'
}

/** Catalog id if the user picked a notes model; otherwise the cheap default. */
export function resolveNotesModel(
  provider: AIProviderName,
  notesModel: unknown,
  catalog: readonly string[],
): string {
  const requested = typeof notesModel === 'string' ? notesModel.trim() : ''
  if (requested && catalog.includes(requested)) return requested
  return NOTES_FAST_MODELS[provider]
}

export function notesSlotIsExplicit(notesProvider: unknown, notesModel: unknown): boolean {
  const model = typeof notesModel === 'string' ? notesModel.trim() : ''
  return parseAIProviderName(notesProvider) !== null && model.length > 0
}

/** Live-assist vendor only. Ignores notesProvider / notesModel. */
export function resolveMemoryProvider(aiProvider: unknown): AIProviderName {
  return parseAIProviderName(aiProvider) ?? 'anthropic'
}

export function resolveMemoryModel(aiProvider: unknown): string {
  return MEMORY_MODELS[resolveMemoryProvider(aiProvider)]
}
