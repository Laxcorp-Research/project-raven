export type AIProviderName = 'anthropic' | 'openai';

export type EffortLevel = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AIProviderConfig {
  provider: AIProviderName;
  model: string;
  apiKey: string;
  effort?: string;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

export type AIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; base64: string; mediaType: string };

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string | AIContentPart[];
}

export interface AIProvider {
  readonly name: AIProviderName;

  streamResponse(params: {
    system: string;
    messages: AIMessage[];
    maxTokens?: number;
  }, callbacks: StreamCallbacks): Promise<void>;

  generateShort(params: {
    system?: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<string>;
}

export interface ModelOption {
  id: string;
  label: string;
  /** Effort levels the API accepts. null = no effort parameter. */
  effort: EffortLevel[] | null;
}

// Official per-model ladders. Do not reuse one list across families.
// Anthropic: https://platform.claude.com/docs/en/build-with-claude/effort
//   max: Fable 5, Opus 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 5, Sonnet 4.6
//   xhigh: Fable 5, Opus 5, Opus 4.8, Opus 4.7, Sonnet 5 (not 4.6 / Opus 4.6 / Opus 4.5)
//   Opus 4.5: low/medium/high only. Haiku 4.5 and Sonnet 4.5: no effort API.
// OpenAI model pages: GPT-5.6 adds `max`; 5.5 / 5.4 / 5.4-mini / 5.2 stop at `xhigh`.
const ANTHROPIC_FULL: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const ANTHROPIC_NO_XHIGH: EffortLevel[] = ['low', 'medium', 'high', 'max'];
const ANTHROPIC_OPUS_45: EffortLevel[] = ['low', 'medium', 'high'];
const OPENAI_56: EffortLevel[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
const OPENAI_PRE56: EffortLevel[] = ['none', 'low', 'medium', 'high', 'xhigh'];

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
};

export const PROVIDER_MODELS: Record<AIProviderName, string[]> = {
  anthropic: MODEL_CATALOG.anthropic.map((m) => m.id),
  openai: MODEL_CATALOG.openai.map((m) => m.id),
};

export const DEFAULT_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.6-luna',
};

export const DEFAULT_EFFORT: EffortLevel = 'low';

/** Official Messages / Chat Completions max output. Not a product cap. */
const OUTPUT_64K = 64_000;
const OUTPUT_128K = 128_000;

export function resolveCatalogModel(provider: AIProviderName, requested?: string): string {
  if (requested && PROVIDER_MODELS[provider].includes(requested)) return requested;
  return DEFAULT_MODELS[provider];
}

export function streamMaxTokensFor(provider: AIProviderName, model: string): number {
  if (provider === 'anthropic') {
    if (
      model === 'claude-haiku-4-5'
      || model === 'claude-sonnet-4-5'
      || model === 'claude-opus-4-5'
    ) {
      return OUTPUT_64K;
    }
    return OUTPUT_128K;
  }
  return OUTPUT_128K;
}

/** Official input+output context. Not a product cap. */
const CONTEXT_200K = 200_000;
const CONTEXT_400K = 400_000;
const CONTEXT_1M = 1_000_000;
const CONTEXT_1050K = 1_050_000;
const CONTEXT_SAFETY_TOKENS = 2_048;
const IMAGE_PART_TOKENS = 2_000;
const MIN_OUTPUT_TOKENS = 4_096;

export function contextWindowFor(provider: AIProviderName, model: string): number {
  if (provider === 'anthropic') {
    if (
      model === 'claude-haiku-4-5'
      || model === 'claude-sonnet-4-5'
      || model === 'claude-opus-4-5'
    ) {
      return CONTEXT_200K;
    }
    return CONTEXT_1M;
  }
  if (model === 'gpt-5.2' || model === 'gpt-5.4-mini') return CONTEXT_400K;
  return CONTEXT_1050K;
}

/** Conservative overestimate (chars/3) so we under-send rather than 400. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3);
}

export function estimateMessageTokens(message: AIMessage): number {
  if (typeof message.content === 'string') return estimateTokens(message.content);
  return message.content.reduce((sum, part) => {
    if (part.type === 'text') return sum + estimateTokens(part.text);
    return sum + IMAGE_PART_TOKENS;
  }, 0);
}

/**
 * Pack newest history that still fits: context - output - system - current.
 * Each Assist is a new API call; the model only sees what we send here.
 */
export function fitMessagesToContext(params: {
  system: string;
  messages: AIMessage[];
  maxOutputTokens: number;
  contextWindow: number;
}): { messages: AIMessage[]; maxTokens: number } {
  if (params.messages.length === 0) {
    return { messages: [], maxTokens: params.maxOutputTokens };
  }

  const current = params.messages[params.messages.length - 1];
  const history = params.messages.slice(0, -1);
  const fixed =
    estimateTokens(params.system)
    + estimateMessageTokens(current)
    + CONTEXT_SAFETY_TOKENS;

  let maxTokens = params.maxOutputTokens;
  if (fixed + maxTokens > params.contextWindow) {
    maxTokens = Math.max(MIN_OUTPUT_TOKENS, params.contextWindow - fixed);
  }

  let budget = params.contextWindow - maxTokens - fixed;
  const kept: AIMessage[] = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateMessageTokens(history[i]);
    if (tokens > budget) {
      if (
        kept.length === 0
        && history[i].role === 'assistant'
        && typeof history[i].content === 'string'
        && budget > 200
      ) {
        const maxChars = budget * 3;
        kept.unshift({
          ...history[i],
          content: `${history[i].content.slice(0, maxChars)}\n[...earlier answer truncated to fit context]`,
        });
        if (i > 0 && history[i - 1].role === 'user') {
          kept.unshift(history[i - 1]);
        }
      }
      break;
    }
    kept.unshift(history[i]);
    budget -= tokens;
  }

  while (kept.length > 0 && kept[0].role !== 'user') kept.shift();
  while (kept.length > 0 && kept[kept.length - 1].role === 'user') kept.pop();

  return { messages: [...kept, current], maxTokens };
}

export function effortLevelsForModel(provider: AIProviderName, model: string): EffortLevel[] | null {
  return MODEL_CATALOG[provider].find((m) => m.id === model)?.effort ?? null;
}

export function resolveEffort(
  provider: AIProviderName,
  model: string,
  requested?: string,
): EffortLevel | null {
  const levels = effortLevelsForModel(provider, model);
  if (!levels || levels.length === 0) return null;
  if (requested && (levels as string[]).includes(requested)) return requested as EffortLevel;
  if (levels.includes('low')) return 'low';
  return levels[0];
}

export function buildAnthropicEffortParams(
  model: string,
  requested?: string,
): Record<string, unknown> {
  const effort = resolveEffort('anthropic', model, requested);
  if (!effort) return {};
  // Always send the selected level. Omitting `low` would fall through to
  // the API default (`high`) and the picker would lie.
  return { output_config: { effort } };
}

export function buildOpenAIEffortParams(
  model: string,
  requested?: string,
): Record<string, unknown> {
  const effort = resolveEffort('openai', model, requested);
  if (!effort) return {};
  return { reasoning_effort: effort };
}
