export type AIProviderName = 'anthropic' | 'openai' | 'opencode-go'
export type EffortLevel = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelOption {
  id: string
  label: string
  effort: EffortLevel[] | null
}

// Keep in sync with src/main/services/ai/types.ts. Ladders are per-model
// from official Anthropic / OpenAI docs — not one shared default list.
const ANTHROPIC_FULL: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
const ANTHROPIC_NO_XHIGH: EffortLevel[] = ['low', 'medium', 'high', 'max']
const ANTHROPIC_OPUS_45: EffortLevel[] = ['low', 'medium', 'high']
const OPENAI_56: EffortLevel[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max']
const OPENAI_PRE56: EffortLevel[] = ['none', 'low', 'medium', 'high', 'xhigh']

export const MODEL_CATALOG: Record<AIProviderName, ModelOption[]> = {
  anthropic: [
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', effort: null },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', effort: ANTHROPIC_FULL },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', effort: ANTHROPIC_NO_XHIGH },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', effort: null },
    { id: 'claude-opus-5', label: 'Claude Opus 5', effort: ANTHROPIC_FULL },
    { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', effort: ANTHROPIC_FULL },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', effort: ANTHROPIC_FULL },
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', effort: ANTHROPIC_NO_XHIGH },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', effort: ANTHROPIC_OPUS_45 },
    { id: 'claude-fable-5', label: 'Claude Fable 5', effort: ANTHROPIC_FULL },
  ],
  openai: [
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', effort: OPENAI_56 },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', effort: OPENAI_56 },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', effort: OPENAI_56 },
    { id: 'gpt-5.5', label: 'GPT-5.5', effort: OPENAI_PRE56 },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', effort: OPENAI_PRE56 },
    { id: 'gpt-5.4', label: 'GPT-5.4', effort: OPENAI_PRE56 },
    { id: 'gpt-5.2', label: 'GPT-5.2', effort: OPENAI_PRE56 },
  ],
  'opencode-go': [
    { id: 'grok-4.5', label: 'Grok 4.5', effort: null },
    { id: 'glm-5.2', label: 'GLM-5.2', effort: null },
    { id: 'glm-5.1', label: 'GLM-5.1', effort: null },
    { id: 'kimi-k3', label: 'Kimi K3', effort: null },
    { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code', effort: null },
    { id: 'kimi-k2.6', label: 'Kimi K2.6', effort: null },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', effort: null },
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', effort: null },
    { id: 'mimo-v2.5', label: 'MiMo-V2.5', effort: null },
    { id: 'mimo-v2.5-pro', label: 'MiMo-V2.5-Pro', effort: null },
    { id: 'hy3', label: 'Hy3', effort: null },
  ],
}

export const DEFAULT_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.6-luna',
  'opencode-go': 'kimi-k3',
}

export const DEFAULT_EFFORT: EffortLevel = 'low'

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  none: 'None (fastest)',
  low: 'Low (fast)',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max (slowest)',
}

export function effortLevelsForModel(provider: AIProviderName, model: string): EffortLevel[] | null {
  return MODEL_CATALOG[provider].find((m) => m.id === model)?.effort ?? null
}

export function resolveEffort(
  provider: AIProviderName,
  model: string,
  requested?: string,
): EffortLevel | null {
  const levels = effortLevelsForModel(provider, model)
  if (!levels || levels.length === 0) return null
  if (requested && (levels as string[]).includes(requested)) return requested as EffortLevel
  if (levels.includes('low')) return 'low'
  return levels[0]
}
