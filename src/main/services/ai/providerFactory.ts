import type { AIProvider, AIProviderConfig, AIProviderName } from './types';
import { DEFAULT_EFFORT, resolveCatalogModel } from './types';
import { AnthropicProvider } from './anthropicProvider';
import { OpenAIProvider } from './openaiProvider';
import { createLogger } from '../../logger';

const log = createLogger('AI');

let cachedProvider: AIProvider | null = null;
let cachedConfigKey = '';

function configKey(config: AIProviderConfig): string {
  return `${config.provider}:${config.model}:${config.effort ?? ''}:${config.apiKey}`;
}

export function getProvider(config: AIProviderConfig): AIProvider {
  const key = configKey(config);
  if (cachedProvider && cachedConfigKey === key) {
    return cachedProvider;
  }

  switch (config.provider) {
    case 'anthropic':
      cachedProvider = new AnthropicProvider(config.apiKey, config.model, config.effort);
      break;
    case 'openai':
      cachedProvider = new OpenAIProvider(config.apiKey, config.model, config.effort);
      break;
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }

  cachedConfigKey = key;
  log.info(`Created ${config.provider} provider with model ${config.model} effort ${config.effort ?? 'default'}`);
  return cachedProvider;
}

export function clearProviderCache(): void {
  cachedProvider = null;
  cachedConfigKey = '';
}

/** Cheap model for title/summary generation only. Not an overlay mode. */
export const FAST_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.6-luna',
};

/** Open-source mode: reads the user's model + effort from Settings. */
export async function getProviderFromStore(): Promise<AIProvider> {
  const { getSetting, getApiKey } = await import('../../store');

  const provider = (getSetting('aiProvider') || 'anthropic') as AIProviderName;
  const model = resolveCatalogModel(provider, getSetting('aiModel') as string);
  const effort = (getSetting('aiEffort') as string) || DEFAULT_EFFORT;

  const apiKey = provider === 'openai'
    ? getApiKey('openaiApiKey')
    : getApiKey('anthropicApiKey');

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Add it in Settings.`);
  }

  return getProvider({ provider, model, apiKey, effort });
}

/** Cheap BYOK model for title generation. Assist does not use this. */
export async function getFastProvider(): Promise<AIProvider> {
  const { getSetting, getApiKey } = await import('../../store');

  const provider = (getSetting('aiProvider') || 'anthropic') as AIProviderName;
  const model = FAST_MODELS[provider];

  const apiKey = provider === 'openai'
    ? getApiKey('openaiApiKey')
    : getApiKey('anthropicApiKey');

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Add it in Settings.`);
  }

  return getProvider({ provider, model, apiKey, effort: DEFAULT_EFFORT });
}

let cachedProProvider: AIProvider | null = null;
let cachedProKey = '';

export async function getProProvider(): Promise<AIProvider> {
  const { getSetting } = await import('../../store');
  const provider = (getSetting('aiProvider') === 'openai' ? 'openai' : 'anthropic') as AIProviderName;
  const model = resolveCatalogModel(provider, getSetting('aiModel') as string);
  const effort = (getSetting('aiEffort') as string) || DEFAULT_EFFORT;
  const key = `pro:${provider}:${model}:${effort}`;

  if (cachedProProvider && cachedProKey === key) return cachedProProvider;

  const { BackendProxyProvider } = await import(
    /* @vite-ignore */ '../../../pro/main/backendProxyProvider'
  );
  cachedProProvider = new BackendProxyProvider(provider, model, { effort });
  cachedProKey = key;
  log.info(`Created proxy provider: ${provider}/${model} effort ${effort}`);
  return cachedProProvider;
}

/** Cheap Pro model for title generation. Assist does not use this. */
export async function getProFastProvider(): Promise<AIProvider> {
  const model = FAST_MODELS.anthropic;
  const key = `pro-fast:anthropic:${model}`;

  if (cachedProProvider && cachedProKey === key) return cachedProProvider;

  const { BackendProxyProvider } = await import(
    /* @vite-ignore */ '../../../pro/main/backendProxyProvider'
  );
  cachedProProvider = new BackendProxyProvider('anthropic', model);
  cachedProKey = key;
  log.info(`Created proxy provider (system-fast): anthropic/${model}`);
  return cachedProProvider;
}

/** Pro mode: system endpoint for summary/title generation - bypasses AI usage limit. */
export async function getProSystemProvider(): Promise<AIProvider> {
  const model = FAST_MODELS.anthropic;

  const { BackendProxyProvider } = await import(
    /* @vite-ignore */ '../../../pro/main/backendProxyProvider'
  );
  return new BackendProxyProvider('anthropic', model, { systemEndpoint: true });
}
