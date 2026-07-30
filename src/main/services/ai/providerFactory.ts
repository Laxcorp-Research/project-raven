import type { AIProvider, AIProviderConfig, AIProviderName } from './types';
import { AnthropicProvider } from './anthropicProvider';
import { OpenAIProvider } from './openaiProvider';
import { DEFAULT_OLLAMA_URL, OllamaProvider } from './ollamaProvider';
import { createLogger } from '../../logger';

const log = createLogger('AI');

let cachedProvider: AIProvider | null = null;
let cachedConfigKey = '';

function configKey(config: AIProviderConfig): string {
  return `${config.provider}:${config.model}:${config.apiKey}:${config.baseURL || ''}`;
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
    case 'ollama':
      cachedProvider = new OllamaProvider(config.model, config.baseURL || DEFAULT_OLLAMA_URL);
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
  openai: 'gpt-5.4-mini',
  ollama: '',
};

// Deep-mode models used by the Pro path when the user toggles "Smart
// Mode" in the overlay. Previously getProProvider() read the `aiModel`
// setting from the local store, but the Pro UI has no way to change
// that setting (ApiKeysTab is hidden for Pro users). The setting
// silently stayed at its default - claude-haiku-4-5 - so the Smart
// Mode toggle was a no-op: both Fast and Deep ended up using Haiku.
//
// Pinning Deep to Sonnet 4.6 here makes the toggle actually differentiate
// quality: Haiku (~sub-1s, 'near-frontier') for live responsiveness,
// Sonnet (better reasoning, extended thinking) when the user explicitly
// opts into the slower/smarter path. OSS users keep picking their own
// model via ApiKeysTab + getProviderFromStore().
const DEEP_MODELS: Record<AIProviderName, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-5',
  ollama: '',
};

/** Open-source mode: reads user's own API keys from local store. */
export async function getProviderFromStore(): Promise<AIProvider> {
  const { getSetting, getApiKey } = await import('../../store');

  const provider = (getSetting('aiProvider') || 'anthropic') as AIProviderName;
  const model = (getSetting('aiModel') || 'claude-haiku-4-5') as string;

  const apiKey = provider === 'ollama' ? '' : provider === 'openai'
    ? getApiKey('openaiApiKey') : getApiKey('anthropicApiKey');

  if (provider !== 'ollama' && !apiKey) {
    throw new Error(`No API key configured for ${provider}. Add it in Settings.`);
  }

  const baseURL = provider === 'ollama' ? String(getSetting('ollamaBaseUrl') || DEFAULT_OLLAMA_URL) : undefined;
  return getProvider({ provider, model, apiKey, baseURL });
}

/** Open-source mode: fast model with user's own keys. */
export async function getFastProvider(): Promise<AIProvider> {
  const { getSetting, getApiKey } = await import('../../store');

  const provider = (getSetting('aiProvider') || 'anthropic') as AIProviderName;
  const model = provider === 'ollama' ? String(getSetting('aiModel') || '') : FAST_MODELS[provider];

  const apiKey = provider === 'ollama' ? '' : provider === 'openai'
    ? getApiKey('openaiApiKey') : getApiKey('anthropicApiKey');

  if (provider !== 'ollama' && !apiKey) {
    throw new Error(`No API key configured for ${provider}. Add it in Settings.`);
  }

  const baseURL = provider === 'ollama' ? String(getSetting('ollamaBaseUrl') || DEFAULT_OLLAMA_URL) : undefined;
  return getProvider({ provider, model, apiKey, baseURL });
}

let cachedProProvider: AIProvider | null = null;
let cachedProKey = '';

// Pro mode is Claude-only by design. The Pro UI hides the AI-provider
// picker (API Keys tab is filtered out in SettingsModal for isPro users),
// so `aiProvider` in the store has no legitimate way to become 'openai'
// for a Pro user. Pinning the three Pro helpers to 'anthropic' here is
// defense-in-depth against: (1) store corruption or rollback from an
// OSS install that set aiProvider='openai', (2) tampering, (3) a
// future code path that exposes the picker and forgets to gate it by
// plan. OSS users are unaffected - getProviderFromStore/getFastProvider
// still read `aiProvider` honestly for self-hosted keys.
const PRO_PROVIDER: AIProviderName = 'anthropic';

/** Pro mode: routes through backend proxy. Deep/Smart mode - pins to the
 *  Deep model (Sonnet 4.6). Intentionally ignores the `aiModel` store
 *  setting because the Pro UI has no picker for it; reading that setting
 *  meant Deep mode silently used Haiku (same as Fast mode), making the
 *  Smart toggle a no-op. See DEEP_MODELS + PRO_PROVIDER comments. */
export async function getProProvider(): Promise<AIProvider> {
  const model = DEEP_MODELS[PRO_PROVIDER];
  const key = `pro:${PRO_PROVIDER}:${model}`;

  if (cachedProProvider && cachedProKey === key) return cachedProProvider;

  const { BackendProxyProvider } = await import(
    /* @vite-ignore */ '../../../pro/main/backendProxyProvider'
  );
  cachedProProvider = new BackendProxyProvider(PRO_PROVIDER, model);
  cachedProKey = key;
  log.info(`Created proxy provider (deep): ${PRO_PROVIDER}/${model}`);
  return cachedProProvider;
}

/** Pro mode: routes through backend proxy with a fast model. */
export async function getProFastProvider(): Promise<AIProvider> {
  const model = FAST_MODELS[PRO_PROVIDER];
  const key = `pro-fast:${PRO_PROVIDER}:${model}`;

  if (cachedProProvider && cachedProKey === key) return cachedProProvider;

  const { BackendProxyProvider } = await import(
    /* @vite-ignore */ '../../../pro/main/backendProxyProvider'
  );
  cachedProProvider = new BackendProxyProvider(PRO_PROVIDER, model);
  cachedProKey = key;
  log.info(`Created proxy provider (fast): ${PRO_PROVIDER}/${model}`);
  return cachedProProvider;
}

/** Pro mode: system endpoint for summary/title generation - bypasses AI usage limit. */
export async function getProSystemProvider(): Promise<AIProvider> {
  const model = FAST_MODELS[PRO_PROVIDER];

  const { BackendProxyProvider } = await import(
    /* @vite-ignore */ '../../../pro/main/backendProxyProvider'
  );
  return new BackendProxyProvider(PRO_PROVIDER, model, { systemEndpoint: true });
}
