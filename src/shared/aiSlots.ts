/**
 * Live assist vs notes vs system memory.
 *
 * Memory is not a Settings slot. It always uses the cheap model for the
 * Live assist vendor so the compact job hits a key the user already has:
 * Anthropic → Claude Haiku 4.5, OpenAI → GPT-5.6 Luna.
 *
 * Unset notes* still defaults to that same cheap model.
 */

export type AIProviderName = 'anthropic' | 'openai'

export const NOTES_FAST_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.6-luna',
}

/** Same map as NOTES_FAST_MODELS — memory is not user-configurable. */
export const MEMORY_MODELS = NOTES_FAST_MODELS

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
