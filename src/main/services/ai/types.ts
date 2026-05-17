export type AIProviderName = 'anthropic' | 'openai';

export interface AIProviderConfig {
  provider: AIProviderName;
  model: string;
  apiKey: string;
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

// Current model lineup as of 2026-05. Order is "recommended for live use"
// first (fast/cheap), then mid-tier, then flagship (deep reasoning). The
// OSS dropdown in ApiKeysTab.tsx preserves this order; the labels there
// give the user a one-line cue about which to pick.
//
// Removed in this refresh:
//   - claude-sonnet-4-20250514 (old Sonnet 4 dated snapshot; Sonnet 4.6
//     is the current version - no reason to expose the stale snapshot)
//   - gpt-5-mini (stale naming; gpt-5.4-mini is the current name for
//     the small reasoning model)
//   - gpt-4o (legacy; current OpenAI lineup is 5.x-series)
export const PROVIDER_MODELS: Record<AIProviderName, string[]> = {
  anthropic: [
    'claude-haiku-4-5',
    'claude-sonnet-4-6',
    'claude-opus-4-7',
  ],
  openai: [
    'gpt-5.4-mini',
    'gpt-5.4',
    'gpt-5.5',
    'gpt-5.2',
  ],
};

export const DEFAULT_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.4-mini',
};
