import type { AIProvider, AIProviderConfig, AIProviderName } from './types';
import { AnthropicProvider } from './anthropicProvider';
import { OpenAIProvider } from './openaiProvider';
import { createLogger } from '../../logger';

const log = createLogger('AI');

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
  log.info(`Created ${config.provider} provider with model ${config.model}`);
  return cachedProvider;
}

export function clearProviderCache(): void {
  cachedProvider = null;
  cachedConfigKey = '';
}

const FAST_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
};

/** Open-source mode: reads user's own API keys from local store. */
export async function getProviderFromStore(): Promise<AIProvider> {
  const { getStore } = await import('../../store');
  const store = getStore();

  const provider = (store.get('aiProvider', 'anthropic') as AIProviderName);
  const model = store.get('aiModel', 'claude-haiku-4-5') as string;

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

/** Open-source mode: fast model with user's own keys. */
export async function getFastProvider(): Promise<AIProvider> {
  const { getStore } = await import('../../store');
  const store = getStore();

  const provider = (store.get('aiProvider', 'anthropic') as AIProviderName);
  const model = FAST_MODELS[provider];

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

let cachedProProvider: AIProvider | null = null;
let cachedProKey = '';

/** Pro mode: routes through backend proxy. User's selected model at full quality. */
export async function getProProvider(): Promise<AIProvider> {
  const { getStore } = await import('../../store');
  const store = getStore();

  const provider = (store.get('aiProvider', 'anthropic') as AIProviderName);
  const model = store.get('aiModel', 'claude-haiku-4-5') as string;
  const key = `pro:${provider}:${model}`;

  if (cachedProProvider && cachedProKey === key) return cachedProProvider;

  const { BackendProxyProvider } = await import(
    /* @vite-ignore */ '../../../pro/main/backendProxyProvider'
  );
  cachedProProvider = new BackendProxyProvider(provider, model);
  cachedProKey = key;
  log.info(`Created proxy provider: ${provider}/${model}`);
  return cachedProProvider;
}

/** Pro mode: routes through backend proxy with a fast model. */
export async function getProFastProvider(): Promise<AIProvider> {
  const { getStore } = await import('../../store');
  const store = getStore();

  const provider = (store.get('aiProvider', 'anthropic') as AIProviderName);
  const model = FAST_MODELS[provider];
  const key = `pro-fast:${provider}:${model}`;

  if (cachedProProvider && cachedProKey === key) return cachedProProvider;

  const { BackendProxyProvider } = await import(
    /* @vite-ignore */ '../../../pro/main/backendProxyProvider'
  );
  cachedProProvider = new BackendProxyProvider(provider, model);
  cachedProKey = key;
  log.info(`Created proxy provider (fast): ${provider}/${model}`);
  return cachedProProvider;
}
