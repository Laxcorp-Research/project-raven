import type { AIProvider, AIProviderConfig, AIProviderName } from './types';
import { AnthropicProvider } from './anthropicProvider';
import { OpenAIProvider } from './openaiProvider';

let cachedProvider: AIProvider | null = null;
let cachedConfigKey = '';

function configKey(config: AIProviderConfig): string {
  return `${config.provider}:${config.model}:${config.apiKey}`;
}

export function getProvider(config: AIProviderConfig): AIProvider {
  const key = configKey(config);
  if (cachedProvider && cachedConfigKey === key) {
    return cachedProvider;
  }

  switch (config.provider) {
    case 'anthropic':
      cachedProvider = new AnthropicProvider(config.apiKey, config.model);
      break;
    case 'openai':
      cachedProvider = new OpenAIProvider(config.apiKey, config.model);
      break;
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }

  cachedConfigKey = key;
  console.log(`[AIProvider] Created ${config.provider} provider with model ${config.model}`);
  return cachedProvider;
}

export function clearProviderCache(): void {
  cachedProvider = null;
  cachedConfigKey = '';
}

export async function getProviderFromStore(): Promise<AIProvider> {
  const Store = (await import('electron-store')).default;
  const store = new Store();

  const provider = (store.get('aiProvider', 'anthropic') as AIProviderName);
  const model = store.get('aiModel', 'claude-sonnet-4-20250514') as string;

  let apiKey: string;
  if (provider === 'openai') {
    apiKey = store.get('openaiApiKey', '') as string;
  } else {
    apiKey = store.get('anthropicApiKey', '') as string;
  }

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Add it in Settings.`);
  }

  return getProvider({ provider, model, apiKey });
}
