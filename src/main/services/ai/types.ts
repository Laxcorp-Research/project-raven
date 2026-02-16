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

export const PROVIDER_MODELS: Record<AIProviderName, string[]> = {
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-haiku-20240307',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
};

export const DEFAULT_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};
